import { expect, mock, test } from 'claude-code/testing'

import type { OfficeAgent } from '../types'
import { act, arrive, finish, goHome, roleFor } from '../hooks/model'
import { scene } from '../hooks/scene'

const PANE = {
  plugin: 'agent-office',
  component: 'Pane',
  requestId: 'agent-office',
  props: {
    title: 'Agent Office',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const LEAD = { verb: 'Idle', detail: '', isBusy: false }

function staff(count: number, now = 0): OfficeAgent[] {
  let list: OfficeAgent[] = []
  for (let k = 0; k < count; k++) {
    list = arrive(list, { id: `a${k}`, type: 'general-purpose', description: 'implement it' }, now)
  }
  return list
}

test('roles come from the agent type, then the task', async () => {
  expect(roleFor('Explore', 'anything')).toBe('Researcher')
  expect(roleFor('Plan', 'anything')).toBe('Architect')
  expect(roleFor('general-purpose', 'write tests for the parser')).toBe('QA')
  expect(roleFor('general-purpose', 'polish the header styles')).toBe('Designer')
  expect(roleFor('general-purpose', 'implement the cache')).toBe('Developer')
})

test('agents take desks, labels stay unique, finished ones rest then go home', async () => {
  let list = staff(3)
  expect(list.map(a => a.label)).toEqual(['Developer', 'Developer 2', 'Developer 3'])
  expect(list.map(a => a.spot)).toEqual([
    { room: 'eng', i: 0 },
    { room: 'eng', i: 1 },
    { room: 'eng', i: 2 },
  ])

  list = act(list, 'a1', { verb: 'Edit', detail: 'editing cache.ts', isTool: true }, 5)
  expect(list[1]).toMatchObject({ verb: 'Edit', detail: 'editing cache.ts', tools: 1 })

  list = finish(list, 'a1', true, 'Cache landed.', 10)
  const done = list.find(a => a.id === 'a1')
  expect(done).toMatchObject({ status: 'done', verb: 'Done', spot: { room: 'lounge', i: 0 }, from: { room: 'eng', i: 1 } })

  expect(goHome(list).map(a => a.id)).toEqual(['a0', 'a2'])
})

test('a full office queues in the lobby and the queue takes a freed desk', async () => {
  let list = staff(18)
  const last = list[17]!
  expect(last.spot).toEqual({ room: 'lobby', i: 0 })

  list = finish(list, 'a0', true, '', 100)
  expect(list.find(a => a.id === last.id)).toMatchObject({
    spot: { room: 'eng', i: 0 },
    from: { room: 'lobby', i: 0 },
    movedAt: 100,
  })
})

test('a walk resumes where it stands on a redraw, and ends at the desk', async () => {
  const list = staff(1, 0)
  const walking = scene(list, LEAD, 1000)
  expect(walking).toContain('@keyframes w0')
  expect(walking).toMatch(/animation:w0 [\d.]+s linear -1s both/)

  const seated = scene(list, LEAD, 60_000)
  expect(seated).not.toContain('@keyframes w0')
  expect(seated).toContain('transform="translate(70 148)"')
  expect(seated.length).toBeLessThan(131072)
})

test('a dispatched subagent appears in the pane and moves to the lounge when done', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('agent.spawn', () => ({ model: 'test-model', agentId: 'ag-1' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.agent.spawn({
    tool_use_id: 'tu-1',
    prompt: 'map the callers',
    description: 'find all callers of render',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'test-model',
    background: false,
    fork: false,
  })

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await desktop.find({ type: 'Svg' })
  expect(String(svg?.props.source)).toContain('>Researcher<')
  expect(String(svg?.props.alt)).toContain('1 agents at work')
  await desktop.unmount()

  await $.turn.complete({
    answer: 'Found 3 callers.',
    durationMs: 10,
    isAborted: false,
    turnId: 'turn-1',
    agentId: 'ag-1',
    reason: 'answer',
  })

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /✓ Researcher/ })).toBeDefined()
  await terminal.unmount()
})

test('the boss follows the main loop: busy on a prompt, idle when the turn ends', async ($, on) => {
  mock.clock(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.prompt.submit({ text: 'build the thing', wait: false, origin: { kind: 'composer' } })

  const busy = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await busy.find({ type: 'Text', text: /reading the brief/ })).toBeDefined()
  await busy.unmount()

  await $.turn.complete({ answer: 'Done.', durationMs: 10, isAborted: false, turnId: 't', reason: 'answer' })
  const idle = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await idle.find({ type: 'Text', text: /Idle/ })).toBeDefined()
  await idle.unmount()
})
