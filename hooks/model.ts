import type { OfficeAgent, OfficeRoom, OfficeSpot } from '../types'

/** How many seats each room has. */
export const SEATS: Record<OfficeRoom, number> = {
  eng: 8,
  lab: 3,
  meet: 6,
  lounge: 6,
  lobby: 4,
}

const ROLE_RULES: [RegExp, string][] = [
  [/\b(test|qa|verif|repro|regress|bug ?hunt)/i, 'QA'],
  [/\b(deploy|ci\b|pipeline|docker|infra|release|devops|build system)/i, 'DevOps'],
  [/\b(design|ui\b|ux\b|css|styl|layout|visual|theme)/i, 'Designer'],
  [/\b(review|audit|critique|security|lint)/i, 'Reviewer'],
  [/\b(plan|architect|strategy|approach|spec|outline)/i, 'Architect'],
  [/\b(research|search|find|explore|investigat|look ?up|survey|scan|map)/i, 'Researcher'],
  [/\b(write|draft|copy|docs?\b|readme|summar)/i, 'Writer'],
]

/** A job title from the agent type and the few words the call described it with. */
export function roleFor(type: string, description: string): string {
  if (type === 'Explore') return 'Researcher'
  if (type === 'Plan') return 'Architect'
  if (type === 'claude-code-guide') return 'Librarian'
  if (/review/i.test(type)) return 'Reviewer'
  for (const [pattern, role] of ROLE_RULES) {
    if (pattern.test(description)) return role
  }
  return 'Developer'
}

const isBookish = (role: string) => role === 'Researcher' || role === 'Librarian'

/** The rooms an agent of this role looks for a seat in, best first. */
function workRooms(role: string): OfficeRoom[] {
  return isBookish(role) ? ['lab', 'eng', 'meet', 'lobby'] : ['eng', 'meet', 'lab', 'lobby']
}

function freeSpot(agents: OfficeAgent[], rooms: OfficeRoom[]): OfficeSpot {
  for (const room of rooms) {
    const taken = new Set(agents.filter(a => a.spot.room === room).map(a => a.spot.i))
    for (let i = 0; i < SEATS[room]; i++) {
      if (!taken.has(i)) return { room, i }
    }
  }
  return { room: 'lobby', i: -1 }
}

function uniqueLabel(agents: OfficeAgent[], base: string): string {
  const used = new Set(agents.map(a => a.label))
  for (let n = 1; ; n++) {
    const label = n === 1 ? base : `${base} ${n}`
    if (!used.has(label)) return label
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

export type Arrival = { id: string; type: string; description: string; name?: string }

/** A new subagent walks in through the gate and takes the best free seat. */
export function arrive(agents: OfficeAgent[], who: Arrival, now: number): OfficeAgent[] {
  if (agents.some(a => a.id === who.id)) return agents
  const role = roleFor(who.type, who.description)
  const base = who.name ? who.name.slice(0, 14) : role
  const agent: OfficeAgent = {
    id: who.id,
    label: uniqueLabel(agents, base),
    role,
    type: who.type,
    description: who.description,
    status: 'working',
    verb: 'Think',
    detail: who.description ? `on it: ${who.description}` : 'reading the brief',
    tools: 0,
    look: hash(who.id),
    spot: freeSpot(agents, workRooms(role)),
    from: null,
    movedAt: now,
    startedAt: now,
    endedAt: null,
  }
  return [...agents, agent]
}

/** A subagent used a tool or said something: its bubble and verb change. */
export function act(
  agents: OfficeAgent[],
  id: string,
  change: { verb?: string; detail: string; isTool: boolean },
  now: number,
): OfficeAgent[] {
  const agent = agents.find(a => a.id === id)
  if (agent === undefined) return agents
  const others = agents.filter(a => a.id !== id)
  // A finished agent that was messaged again leaves the lounge for a desk.
  const isBack = agent.status !== 'working'
  const spot = isBack ? freeSpot(others, workRooms(agent.role)) : agent.spot
  const next: OfficeAgent = {
    ...agent,
    status: 'working',
    verb: change.verb ?? agent.verb,
    detail: change.detail || agent.detail,
    tools: agent.tools + (change.isTool ? 1 : 0),
    spot,
    from: isBack ? agent.spot : agent.from,
    movedAt: isBack ? now : agent.movedAt,
    endedAt: isBack ? null : agent.endedAt,
  }
  return agents.map(a => (a.id === id ? next : a))
}

/** A subagent finished: it walks to the lounge, and someone waiting takes its desk. */
export function finish(
  agents: OfficeAgent[],
  id: string,
  isOk: boolean,
  answer: string,
  now: number,
): OfficeAgent[] {
  const agent = agents.find(a => a.id === id)
  if (agent === undefined || agent.status !== 'working') return agents
  let rest = agents.filter(a => a.id !== id)
  let spot = freeSpot(rest, ['lounge'])
  if (spot.i === -1) {
    // The lounge is full: whoever has been resting longest goes home.
    const oldest = rest
      .filter(a => a.spot.room === 'lounge')
      .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))[0]
    if (oldest !== undefined) {
      rest = rest.filter(a => a.id !== oldest.id)
      spot = oldest.spot
    }
  }
  const done: OfficeAgent = {
    ...agent,
    status: isOk ? 'done' : 'failed',
    verb: isOk ? 'Done' : 'Failed',
    detail: answer || (isOk ? 'all done' : 'hit a wall'),
    spot,
    from: agent.spot,
    movedAt: now,
    endedAt: now,
  }
  return promoteWaiting([...rest, done], now)
}

/** Agents queued in the lobby (or off the map) move to any desk that freed up. */
function promoteWaiting(agents: OfficeAgent[], now: number): OfficeAgent[] {
  let list = agents
  for (const agent of agents) {
    if (agent.status !== 'working' || agent.spot.room !== 'lobby') continue
    const others = list.filter(a => a.id !== agent.id)
    const spot = freeSpot(
      others,
      workRooms(agent.role).filter(room => room !== 'lobby'),
    )
    if (spot.i === -1) continue
    list = list.map(a =>
      a.id === agent.id ? { ...a, spot, from: agent.spot, movedAt: now } : a,
    )
  }
  return list
}

/** A new prompt: everyone resting in the lounge goes home. */
export function goHome(agents: OfficeAgent[]): OfficeAgent[] {
  const left = agents.filter(a => a.status === 'working')
  return left.length === agents.length ? agents : left
}

/** The status-bar verb for a tool. */
export function verbFor(tool: string): string {
  if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(tool)) return 'Edit'
  if (tool === 'Read') return 'Read'
  if (/^(Grep|Glob|ToolSearch|LSP)$/.test(tool)) return 'Search'
  if (tool === 'Bash' || tool === 'Monitor') return 'Run'
  if (tool.startsWith('Web')) return 'Web'
  if (tool === 'Agent' || tool === 'SendMessage' || tool === 'Workflow') return 'Delegate'
  if (/^(TodoWrite|Task)/.test(tool)) return 'Plan'
  if (tool === 'AskUserQuestion') return 'Ask'
  if (tool === 'Skill') return 'Skill'
  if (tool.startsWith('mcp__')) return 'Tool'
  return tool.slice(0, 8)
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
const baseName = (path: string) => path.split('/').filter(Boolean).pop() ?? path

/** A speech-bubble line for a tool call, from its arguments. */
export function detailFor(tool: string, input: Record<string, unknown>): string {
  const arg = (key: string) => {
    const value = input[key]
    return typeof value === 'string' ? oneLine(value) : ''
  }
  switch (tool) {
    case 'Read':
      return `reading ${baseName(arg('file_path'))}`
    case 'Edit':
    case 'MultiEdit':
      return `editing ${baseName(arg('file_path'))}`
    case 'Write':
      return `writing ${baseName(arg('file_path'))}`
    case 'NotebookEdit':
      return `editing ${baseName(arg('notebook_path'))}`
    case 'Bash':
      return `$ ${arg('command')}`
    case 'Grep':
      return `grep ${arg('pattern')}`
    case 'Glob':
      return `looking for ${arg('pattern')}`
    case 'WebSearch':
      return `searching ${arg('query')}`
    case 'WebFetch': {
      const host = /^https?:\/\/([^/]+)/.exec(arg('url'))?.[1]
      return `reading ${host ?? 'the web'}`
    }
    case 'Agent':
      return `briefing: ${arg('description')}`
    case 'SendMessage':
      return 'pinging a teammate'
    case 'TodoWrite':
      return 'updating the plan'
    case 'Skill':
      return `using ${arg('skill')}`
    case 'AskUserQuestion':
      return 'has a question for you'
    default: {
      const mcp = /^mcp__[^_]+(?:_[^_]+)*__(.+)$/.exec(tool)
      return mcp ? mcp[1]!.replace(/_/g, ' ') : tool.toLowerCase()
    }
  }
}

/** The first sentence of what an agent said, cleaned of markdown. */
export function gist(text: string): string {
  const plain = oneLine(text.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|[\]]/g, ''))
  if (plain === '') return ''
  const sentence = /^(.{8,}?[.!?:])(\s|$)/.exec(plain)?.[1] ?? plain
  return sentence.slice(0, 80)
}
