import type { Project, SubTab } from './types'

/** Teammate PTYs are named `tmux-<run>-<pane>` by `tmux_bridge.rs`. */
export const TEAMMATE_PTY_PREFIX = 'tmux-'

/** A teammate's shell tab that recorded its conversation and the team arguments it launched with. */
function isResumable(tab: SubTab): boolean {
  return Boolean(tab.sessionId && tab.extraArgs?.length)
}

/** The conversation of the leader that launched a teammate, from the arguments it was started with. */
function parentSessionOf(tab: SubTab): string | undefined {
  const args = tab.extraArgs ?? []
  if (!args.includes('--agent-id')) return undefined
  const index = args.indexOf('--parent-session-id')
  return index >= 0 ? args[index + 1] : undefined
}

/** Ties each teammate terminal to the terminal of its leader, so closing the leader closes it. */
export function linkTeammatesToLeaders(project: Project): Project {
  return {
    ...project,
    terminals: project.terminals.map((terminal) => {
      if (terminal.teamLeaderId) return terminal
      const parent = terminal.tabs.map(parentSessionOf).find(Boolean)
      if (!parent) return terminal
      const leader = project.terminals.find(
        (other) => other.id !== terminal.id && other.tabs.some((tab) => tab.sessionId === parent),
      )
      return leader ? { ...terminal, teamLeaderId: leader.id } : terminal
    }),
  }
}

/** Teammate terminals whose leader's terminal is gone. */
export function teammatesWithoutLeader(
  projects: Project[],
): { projectId: string; terminalId: string }[] {
  return projects.flatMap((project) =>
    project.terminals
      .filter(
        (terminal) =>
          terminal.teamLeaderId &&
          !project.terminals.some((other) => other.id === terminal.teamLeaderId),
      )
      .map((terminal) => ({ projectId: project.id, terminalId: terminal.id })),
  )
}

/**
 * Teammate terminals saved by an earlier run, whose agents died with the app. Each one that
 * recorded its conversation becomes a Claude tab that resumes it, so the pane comes back in place.
 * It has to happen before the terminals mount: a shell tab mounted first starts a plain shell under
 * the teammate's old terminal id.
 */
export async function reviveTeammateTabs(
  projects: Project[],
  ptyExists: (id: string) => Promise<boolean>,
): Promise<Project[]> {
  const revived = await Promise.all(
    projects.map(async (project) => ({
      ...project,
      terminals: await Promise.all(
        project.terminals.map(async (terminal) => {
          const stale = terminal.tabs.find(
            (tab) => tab.ptyId?.startsWith(TEAMMATE_PTY_PREFIX) && isResumable(tab),
          )
          if (!stale?.ptyId) return terminal
          if (await ptyExists(stale.ptyId).catch(() => true)) return terminal
          return {
            ...terminal,
            tabs: terminal.tabs.map((tab) =>
              tab.id === stale.id
                ? { ...tab, type: 'claude' as const, name: 'claude', ptyId: null }
                : tab,
            ),
          }
        }),
      ),
    })),
  )
  return revived.map(linkTeammatesToLeaders)
}
