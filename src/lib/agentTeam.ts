/** Default roles of an agent team: the lead plus these teammates. */
export const DEFAULT_TEAM_ROLES = ['front', 'back']

const MAX_TEAM_ROLES = 6
const TEAM_NOTES_FILE = 'TEAM.md'

/** Role names from a comma or line separated list, without blanks and repeats. */
export function parseTeamRoles(text: string): string[] {
  const seen = new Set<string>()
  const roles: string[] = []
  for (const part of text.split(/[,\n;]/)) {
    const role = part.replace(/["'`]/g, '').trim().replace(/\s+/g, ' ')
    const key = role.toLowerCase()
    if (!role || seen.has(key)) continue
    seen.add(key)
    roles.push(role)
    if (roles.length === MAX_TEAM_ROLES) break
  }
  return roles
}

/** The shell command a lead runs to open one more member in its own terminal. */
export const OPEN_MEMBER_COMMAND = 'alethe-team open'

/** Plain text for a prompt that travels as a command-line argument: no quotes, one line. */
export function plainPromptText(text: string): string {
  return text.replace(/["'`]/g, '').replace(/\s+/g, ' ').trim()
}

const OPEN_MEMBER_HINT = [
  `You can open another member in a terminal of its own, next to this one, by running this command in your shell:`,
  `${OPEN_MEMBER_COMMAND} ROLE TASK (ROLE is one word such as front or back, TASK is optional plain text without quotes).`,
  `Run it when the user asks you to create a team or an agent for some work, then coordinate through ${TEAM_NOTES_FILE}.`,
].join(' ')

/**
 * What a plain Antigravity terminal is told when it starts, so it can open a team on request. It
 * does nothing until the user asks.
 */
export function teamHelperPrompt(): string {
  return [
    `Alethe can run a team of agents for you.`,
    OPEN_MEMBER_HINT,
    `Do nothing now; say you are ready.`,
  ].join(' ')
}

/**
 * The first prompt of a team member. The agents cannot message each other, so they coordinate
 * through one notes file at the project root, and each one stays in its own area.
 */
export function teamPrompt(role: string | null, roles: readonly string[], task?: string): string {
  // No quotes anywhere in the prompt: it travels as a command-line argument.
  const mates = roles.join(', ')
  const given = task ? plainPromptText(task) : ''
  const shared = [
    `Coordinate through ${TEAM_NOTES_FILE} at the project root (create it if it is missing):`,
    `read it before you start and again before you touch a file another member may own,`,
    `and add a short line there when you finish a piece, saying what changed and what you need from the others.`,
    `Never edit a file another member is working on; ask for it in ${TEAM_NOTES_FILE} instead.`,
    `Reply in the language the user writes in.`,
  ].join(' ')
  if (role === null) {
    return [
      `You are the lead of a team of agents working on this project, each in its own terminal: ${mates}.`,
      `You do not write code yourself unless the user asks.`,
      `Split what the user asks for into tasks for each member, write them in ${TEAM_NOTES_FILE} under the name of that member, and review what they report back.`,
      OPEN_MEMBER_HINT,
      shared,
      `Do nothing until the user gives you a task; say you are ready.`,
    ].join(' ')
  }
  return [
    `You are the ${role} member of a team of agents working on this project, each in its own terminal (the lead and ${mates}).`,
    `Work only in the ${role} area of the project.`,
    shared,
    given
      ? `Your task: ${given}`
      : `Do not start anything until the user or the lead gives you a task; say you are ready.`,
  ].join(' ')
}
