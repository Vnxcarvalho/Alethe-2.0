import { describe, expect, it } from 'vitest'

import {
  linkTeammatesToLeaders,
  reviveTeammateTabs,
  teammatesWithoutLeader,
} from './teammateRevival'
import type { Project, SubTab, Terminal } from './types'

const tab = (overrides: Partial<SubTab>): SubTab =>
  ({ id: 't', type: 'shell', name: 'shell', cwd: '/', ptyId: null, ...overrides }) as SubTab

const projectOf = (...tabs: SubTab[]): Project =>
  ({
    id: 'p',
    terminals: tabs.map((one, index) => ({ id: `term${index}`, tabs: [one] }) as Terminal),
  }) as unknown as Project

const dead = () => Promise.resolve(false)

describe('teams of terminals', () => {
  const leader = { id: 'lead', tabs: [{ id: 'l', sessionId: 'sess-lead' }] }
  const mate = {
    id: 'mate',
    tabs: [
      {
        id: 'm',
        type: 'claude',
        extraArgs: ['--agent-id', 'front@t', '--parent-session-id', 'sess-lead'],
      },
    ],
  }
  const projectWith = (...terminals: object[]) => ({ id: 'p', terminals }) as unknown as Project

  it('ties a teammate to the terminal that holds its leader’s conversation', () => {
    const linked = linkTeammatesToLeaders(projectWith(leader, mate))
    expect(linked.terminals[1].teamLeaderId).toBe('lead')
    expect(linked.terminals[0].teamLeaderId).toBeUndefined()
  })

  it('leaves a teammate alone when no terminal holds its leader', () => {
    expect(linkTeammatesToLeaders(projectWith(mate)).terminals[0].teamLeaderId).toBeUndefined()
  })

  it('finds teammates whose leader terminal was closed', () => {
    const linked = linkTeammatesToLeaders(projectWith(leader, mate))
    expect(teammatesWithoutLeader([linked])).toEqual([])
    const withoutLeader = { ...linked, terminals: [linked.terminals[1]] }
    expect(teammatesWithoutLeader([withoutLeader])).toEqual([
      { projectId: 'p', terminalId: 'mate' },
    ])
  })
})

describe('reviveTeammateTabs', () => {
  const resumable = tab({
    ptyId: 'tmux-abc-2',
    sessionId: 'session-1',
    extraArgs: ['--agent-id', 'front@team'],
  })

  it('turns a dead teammate that recorded its conversation into a Claude tab to resume', async () => {
    const [project] = await reviveTeammateTabs([projectOf(resumable)], dead)
    expect(project.terminals[0].tabs[0]).toMatchObject({
      type: 'claude',
      ptyId: null,
      sessionId: 'session-1',
      extraArgs: ['--agent-id', 'front@team'],
    })
  })

  it('leaves a teammate whose terminal is still running', async () => {
    const [project] = await reviveTeammateTabs([projectOf(resumable)], () => Promise.resolve(true))
    expect(project.terminals[0].tabs[0].type).toBe('shell')
  })

  it('leaves a teammate with no recorded conversation, and ordinary terminals', async () => {
    const [project] = await reviveTeammateTabs(
      [projectOf(tab({ ptyId: 'tmux-abc-3' }), tab({ ptyId: 'plain-pty' }))],
      dead,
    )
    expect(project.terminals.map((terminal) => terminal.tabs[0].type)).toEqual(['shell', 'shell'])
  })
})
