export type OfficeRoom = 'eng' | 'lab' | 'meet' | 'lounge' | 'lobby'

/** A place in the office: a room and a seat index in it (-1: off the map). */
export type OfficeSpot = { room: OfficeRoom; i: number }

export type OfficeAgentStatus = 'working' | 'done' | 'failed'

export type OfficeAgent = {
  id: string
  label: string
  role: string
  type: string
  description: string
  status: OfficeAgentStatus
  verb: string
  detail: string
  tools: number
  look: number
  spot: OfficeSpot
  /** Where the last walk started; null for the front gate. */
  from: OfficeSpot | null
  movedAt: number
  startedAt: number
  endedAt: number | null
}

export type OfficeLead = { verb: string; detail: string; isBusy: boolean }

declare module 'claude-code' {
  interface PluginState {
    'agent-office': {
      agents: OfficeAgent[]
      lead: OfficeLead
      isDismissed: boolean
    }
  }
}
