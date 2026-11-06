import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import type { AgentHookPayload } from '../stores/agentCanvasStore'
import { useProjectsStore } from '../stores/projectsStore'
import { claudeSessionFromHook } from './claudeSessionTracking'
import { ptyExists } from './tauri'
import { TEAMMATE_PTY_PREFIX, teammatesWithoutLeader } from './teammateRevival'
import type { GridLayout, Project, Terminal } from './types'

const OPEN_EVENT = 'tmux-pane-open'
const CLOSE_EVENT = 'tmux-pane-close'
/** A leader's sub-tab can lose its PTY id for a moment while its agent relaunches. */
const LEADER_GONE_GRACE_MS = 2000

type OpenPayload = {
  paneId: string
  ptyId: string
  leaderPtyId: string
  title: string
  cwd: string | null
  /** What follows `claude` on the teammate's command line. */
  args?: string[]
}

type ClosePayload = { ptyId: string }

export type TeamMember = { terminalId: string; projectId: string }
export type Teams = Map<string, TeamMember[]>

/** The terminal whose sub-tab runs `ptyId`, with the project that holds it. */
export function findPtyOwner(
  projects: Project[],
  ptyId: string,
): { projectId: string; terminal: Terminal } | null {
  for (const project of projects) {
    for (const terminal of project.terminals) {
      if (terminal.tabs.some((tab) => tab.ptyId === ptyId)) {
        return { projectId: project.id, terminal }
      }
    }
  }
  return null
}

/** Flags Alethe puts on every Claude launch itself, so a saved copy would clash with the new one. */
const LAUNCH_FLAGS_WITH_VALUE = new Set([
  '--settings',
  '--mcp-config',
  '--resume',
  '-r',
  '--session-id',
  '--teammate-mode',
])

/** A teammate's arguments without the per-launch flags the app adds again when it resumes it. */
export function teammateLaunchArgs(args: readonly string[] | undefined): string[] {
  const kept: string[] = []
  for (let index = 0; index < (args?.length ?? 0); index += 1) {
    const arg = args![index]
    if (LAUNCH_FLAGS_WITH_VALUE.has(arg)) {
      index += 1
    } else if (!arg.startsWith('--settings=') && !arg.startsWith('--resume=')) {
      kept.push(arg)
    }
  }
  return kept
}

/** tmux's `main-vertical`: the leader on the left, its teammates stacked on the right. */
export function mainVerticalLayout(leaderId: string, teammateIds: string[]): GridLayout {
  const rows = Math.max(1, teammateIds.length)
  const cells: GridLayout['cells'] = {
    [leaderId]: { col: 1, row: 1, colSpan: 1, rowSpan: rows },
  }
  teammateIds.forEach((id, index) => {
    cells[id] = { col: 2, row: index + 1, colSpan: 1, rowSpan: 1 }
  })
  return { cols: 2, rows, cells }
}

export type TeamSync = {
  teams: Teams
  /** Leaders that are missing: their teammates go with them once the grace period holds. */
  orphaned: string[]
  /** Leaders whose team lost a member, so the layout has to be redone. */
  arrange: string[]
}

/** Drops teammates whose terminal is gone and finds the teams whose leader is. */
export function planTeamSync(teams: Teams, projects: Project[]): TeamSync {
  const next: Teams = new Map()
  const orphaned: string[] = []
  const arrange: string[] = []
  for (const [leaderPtyId, members] of teams) {
    if (!findPtyOwner(projects, leaderPtyId)) {
      orphaned.push(leaderPtyId)
      next.set(leaderPtyId, members)
      continue
    }
    const alive = members.filter((member) =>
      projects
        .find((project) => project.id === member.projectId)
        ?.terminals.some((terminal) => terminal.id === member.terminalId),
    )
    if (alive.length !== members.length) arrange.push(leaderPtyId)
    if (alive.length > 0) next.set(leaderPtyId, alive)
  }
  return { teams: next, orphaned, arrange }
}

/** Teammate terminals per leader PTY, in the order they opened. */
let teams: Teams = new Map()
const pendingOrphans = new Set<string>()

function arrangeTeam(leaderPtyId: string) {
  const store = useProjectsStore.getState()
  const leader = findPtyOwner(store.projects, leaderPtyId)
  const members = teams.get(leaderPtyId) ?? []
  if (!leader || members.length === 0) return
  store.setProjectGridLayout(
    leader.projectId,
    mainVerticalLayout(
      leader.terminal.id,
      members.map((member) => member.terminalId),
    ),
  )
}

function syncTeams() {
  const store = useProjectsStore.getState()
  const plan = planTeamSync(teams, store.projects)
  teams = plan.teams
  for (const leaderPtyId of plan.arrange) arrangeTeam(leaderPtyId)
  for (const leaderPtyId of plan.orphaned) {
    if (pendingOrphans.has(leaderPtyId)) continue
    pendingOrphans.add(leaderPtyId)
    setTimeout(() => {
      pendingOrphans.delete(leaderPtyId)
      const current = useProjectsStore.getState()
      if (findPtyOwner(current.projects, leaderPtyId)) return
      for (const member of teams.get(leaderPtyId) ?? []) {
        current.deleteTerminal(member.projectId, member.terminalId)
      }
      teams.delete(leaderPtyId)
    }, LEADER_GONE_GRACE_MS)
  }
  // Teammates brought back by a later run are not in `teams`; their terminal names the leader's.
  for (const { projectId, terminalId } of teammatesWithoutLeader(store.projects)) {
    if (pendingOrphans.has(terminalId)) continue
    pendingOrphans.add(terminalId)
    setTimeout(() => {
      pendingOrphans.delete(terminalId)
      const current = useProjectsStore.getState()
      const stillOrphaned = teammatesWithoutLeader(current.projects).some(
        (orphan) => orphan.terminalId === terminalId,
      )
      if (stillOrphaned) current.deleteTerminal(projectId, terminalId)
    }, LEADER_GONE_GRACE_MS)
  }
}

/**
 * Teammate terminals saved by an earlier run, whose agents died with the app. The ones that
 * recorded their conversation were already turned into Claude tabs when the projects loaded
 * (`reviveTeammateTabs`); what is left has nothing to resume.
 */
async function removeStaleTeammates() {
  const store = useProjectsStore.getState()
  for (const project of store.projects) {
    for (const terminal of project.terminals) {
      const stale = terminal.tabs.find((tab) => tab.ptyId?.startsWith(TEAMMATE_PTY_PREFIX))
      if (!stale?.ptyId) continue
      const alive = await ptyExists(stale.ptyId).catch(() => true)
      if (!alive) useProjectsStore.getState().deleteTerminal(project.id, terminal.id)
    }
  }
}

/** Remembers the conversation a teammate runs, so a later run can resume it. */
function recordTeammateSession(payload: AgentHookPayload) {
  const ptyId = payload.plannerId
  if (!ptyId?.startsWith(TEAMMATE_PTY_PREFIX)) return
  const sessionId = claudeSessionFromHook(payload)
  if (!sessionId) return
  const store = useProjectsStore.getState()
  const owner = findPtyOwner(store.projects, ptyId)
  const tab = owner?.terminal.tabs.find((candidate) => candidate.ptyId === ptyId)
  if (owner && tab) store.setSubTabSessionId(owner.projectId, owner.terminal.id, tab.id, sessionId)
}

/**
 * Claude Code's agent teams open one pane per teammate through the tmux shim (`tmux_bridge.rs`).
 * Each teammate already runs headless in the app; this puts a terminal next to its leader that
 * attaches to it, named after the teammate, and lays the team out like tmux's `main-vertical`.
 * A team follows its leader: closing the leader closes the teammates.
 */
export function listenTmuxBridge(): () => void {
  void removeStaleTeammates()
  const unsubscribeStore = useProjectsStore.subscribe(syncTeams)
  const stops: Promise<UnlistenFn>[] = [
    listen<OpenPayload>(OPEN_EVENT, ({ payload }) => {
      const store = useProjectsStore.getState()
      const leader = findPtyOwner(store.projects, payload.leaderPtyId)
      if (!leader) return
      if (findPtyOwner(store.projects, payload.ptyId)) return
      const cwd = payload.cwd || leader.terminal.cwd
      const created = store.createTerminal(leader.projectId, {
        name: payload.title,
        cwd,
        teamLeaderId: leader.terminal.id,
        firstTab: {
          type: 'shell',
          cwd,
          ptyId: payload.ptyId,
          extraArgs: teammateLaunchArgs(payload.args),
        },
      })
      store.renameTerminal(leader.projectId, created.id, payload.title)
      teams.set(payload.leaderPtyId, [
        ...(teams.get(payload.leaderPtyId) ?? []),
        { terminalId: created.id, projectId: leader.projectId },
      ])
      arrangeTeam(payload.leaderPtyId)
    }),
    listen<AgentHookPayload>('agent-hook', ({ payload }) => recordTeammateSession(payload)),
    listen<ClosePayload>(CLOSE_EVENT, ({ payload }) => {
      const store = useProjectsStore.getState()
      const owner = findPtyOwner(store.projects, payload.ptyId)
      if (owner) store.deleteTerminal(owner.projectId, owner.terminal.id)
      // The store subscription drops the member and redoes the layout.
    }),
  ]
  return () => {
    unsubscribeStore()
    for (const stop of stops) void stop.then((unlisten) => unlisten())
  }
}
