import { describe, expect, it } from 'vitest'

import { mainVerticalLayout, planTeamSync, teammateLaunchArgs, type Teams } from './tmuxBridge'
import type { Project, Terminal } from './types'

const terminal = (id: string, ptyId: string | null): Terminal =>
  ({ id, tabs: [{ id: `${id}-tab`, ptyId }] }) as unknown as Terminal

const project = (terminals: Terminal[]): Project => ({ id: 'p1', terminals }) as unknown as Project

describe('teammateLaunchArgs', () => {
  it('keeps the team arguments and drops the flags the app adds on every launch', () => {
    expect(
      teammateLaunchArgs([
        '--agent-id',
        'frontend@team',
        '--settings',
        'C:\\hooks.json',
        '--mcp-config',
        'mcp.json',
        '--teammate-mode',
        'tmux',
        '--agent-color',
        'blue',
        '--resume=abc',
      ]),
    ).toEqual(['--agent-id', 'frontend@team', '--agent-color', 'blue'])
  })

  it('returns nothing when there are no arguments', () => {
    expect(teammateLaunchArgs(undefined)).toEqual([])
  })
})

describe('planTeamSync', () => {
  const teams = (): Teams =>
    new Map([
      [
        'lead-pty',
        [
          { terminalId: 'a', projectId: 'p1' },
          { terminalId: 'b', projectId: 'p1' },
        ],
      ],
    ])

  it('keeps a team whose leader and teammates are all still open', () => {
    const plan = planTeamSync(teams(), [
      project([terminal('lead', 'lead-pty'), terminal('a', 'tmux-x-1'), terminal('b', 'tmux-x-2')]),
    ])
    expect(plan.orphaned).toEqual([])
    expect(plan.arrange).toEqual([])
    expect(plan.teams.get('lead-pty')).toHaveLength(2)
  })

  it('drops a teammate closed by hand and asks for the layout to be redone', () => {
    const plan = planTeamSync(teams(), [
      project([terminal('lead', 'lead-pty'), terminal('a', 'tmux-x-1')]),
    ])
    expect(plan.arrange).toEqual(['lead-pty'])
    expect(plan.teams.get('lead-pty')).toEqual([{ terminalId: 'a', projectId: 'p1' }])
  })

  it('forgets a team whose teammates are all gone', () => {
    const plan = planTeamSync(teams(), [project([terminal('lead', 'lead-pty')])])
    expect(plan.teams.has('lead-pty')).toBe(false)
  })

  it('reports a team whose leader is missing so its teammates can follow it', () => {
    const plan = planTeamSync(teams(), [
      project([terminal('a', 'tmux-x-1'), terminal('b', 'tmux-x-2')]),
    ])
    expect(plan.orphaned).toEqual(['lead-pty'])
    expect(plan.teams.get('lead-pty')).toHaveLength(2)
  })
})

describe('mainVerticalLayout', () => {
  it('puts the leader on the left across every row and stacks teammates on the right', () => {
    expect(mainVerticalLayout('lead', ['a', 'b'])).toEqual({
      cols: 2,
      rows: 2,
      cells: {
        lead: { col: 1, row: 1, colSpan: 1, rowSpan: 2 },
        a: { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
        b: { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
      },
    })
  })

  it('keeps one row for a leader with no teammates yet', () => {
    expect(mainVerticalLayout('lead', []).rows).toBe(1)
  })
})
