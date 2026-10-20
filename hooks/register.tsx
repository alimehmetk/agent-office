import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { OfficeAgent, OfficeLead } from '../types'
import { act, arrive, detailFor, finish, gist, goHome, verbFor } from './model'
import { H, W, scene, summary } from './scene'

const PANE = 'agent-office'
const IDLE: OfficeLead = { verb: 'Idle', detail: '', isBusy: false }

const agents = atom({ plugin: 'agent-office', key: 'agents' } as const, [] as OfficeAgent[])
const lead = atom({ plugin: 'agent-office', key: 'lead' } as const, IDLE)
const isDismissed = atom({ plugin: 'agent-office', key: 'isDismissed' } as const, false)

const openOffice = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Agent Office' })

/** Opens the pane unasked, unless the person closed it; a refusal is fine. */
const offerOffice = async ($: EngineInterface) => {
  if (!(await read($, isDismissed))) await openOffice($).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'Open the agent office: every subagent at its desk, live',
    })
    void offerOffice($)

    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await update($, isDismissed, () => false)
    await openOffice($)

    return { text: 'Agent office opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      await update($, isDismissed, () => true)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, lead, () => ({ verb: 'Think', detail: 'reading the brief', isBusy: true }))
    await update($, agents, goHome)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = started.agentId
    if (id === undefined) return started

    const now = await $.clock.now()
    await update($, agents, list =>
      arrive(list, { id, type: e.subagentType, description: e.description, name: e.name }, now),
    )
    void offerOffice($)

    return started
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const verb = verbFor(tool)
    const detail = detailFor(tool, e as unknown as Record<string, unknown>)
    const id = e.agentId
    if (id === undefined) {
      await update($, lead, () => ({ verb, detail, isBusy: true }))
    } else if ((await read($, agents)).some(a => a.id === id)) {
      const now = await $.clock.now()
      await update($, agents, list => act(list, id, { verb, detail, isTool: true }, now))
    }

    return next(e)
  })

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const stored = await next(e)
    const said = gist(
      e.message.content
        .flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : []))
        .join(' '),
    )
    if (said === '') return stored

    const id = e.agentId
    if (id === undefined) {
      await update($, lead, old => ({ ...old, detail: said, isBusy: true }))
    } else if ((await read($, agents)).some(a => a.id === id)) {
      const now = await $.clock.now()
      await update($, agents, list => act(list, id, { detail: said, isTool: false }, now))
    }

    return stored
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) {
      await update($, lead, () => IDLE)
    } else {
      const now = await $.clock.now()
      const isOk = e.reason === 'answer'
      await update($, agents, list => finish(list, id, isOk, gist(e.answer), now))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, agents)
    const boss = await read($, lead)

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text>
            <Text bold>👑 Claude</Text> <Text dimColor>{boss.isBusy ? `${boss.verb}: ${boss.detail}` : 'Idle'}</Text>
          </Text>
          {list.length === 0 && <Text dimColor>No subagents yet. They appear here as Claude dispatches them.</Text>}
          {list.map(a => (
            <Text dimColor={a.status !== 'working'} wrap="truncate-end">
              <Text bold color={a.status === 'working' ? 'success' : undefined}>
                {a.status === 'done' ? '✓ ' : a.status === 'failed' ? '✗ ' : '● '}
                {a.label}
              </Text>{' '}
              {a.verb}: {a.detail}
            </Text>
          ))}
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const now = await $.clock.now()
    // Fill the pane's width (about 7.5 CSS pixels a cell), keeping the office's shape.
    const width = Math.max(320, Math.round((e.props.bodyColumns || 86) * 7.5))

    return (
      <Box flexDirection="column">
        <Svg
          source={scene(list, boss, now, e.props.view.agentId)}
          alt={summary(list, boss)}
          width={width}
          height={Math.round((width * H) / W)}
          isInteractive
        />
      </Box>
    )
  })
}
