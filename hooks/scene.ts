import type { OfficeAgent, OfficeLead, OfficeSpot } from '../types'

type Pt = readonly [number, number]

export const W = 640
export const H = 440
const BAR = 414
const FONT = "Menlo,Monaco,'Courier New',monospace"
const SPEED = 70 // map units per second
const HOP = 0.3

// Where people stand: every point is the top-centre of a head.
const ENG_X = [70, 170, 270, 370]
const ENG_DESK_Y = [168, 240]
const LAB_X = [360, 460, 560]
const LAB_DESK_Y = 368
const MEET: Pt[] = [[500, 76], [540, 76], [580, 76], [500, 160], [540, 160], [580, 160]]
const LOUNGE: Pt[] = [[50, 308], [84, 308], [118, 308], [182, 334], [248, 334], [215, 298]]
const LOBBY: Pt[] = [[360, 48], [381, 48], [402, 48], [423, 48]]
const GATE: Pt = [188, 46]
const BOSS: Pt = [76, 38]
const AISLE = 190

export function headOf(spot: OfficeSpot): Pt {
  const i = Math.max(0, spot.i)
  switch (spot.room) {
    case 'eng':
      return [ENG_X[i % 4]!, ENG_DESK_Y[Math.floor(i / 4)]! - 20]
    case 'lab':
      return [LAB_X[i]!, LAB_DESK_Y - 20]
    case 'meet':
      return MEET[i]!
    case 'lounge':
      return LOUNGE[i]!
    case 'lobby':
      return LOBBY[i]!
  }
}

/** The walk from a spot to the engineering aisle, which joins every room. */
function toAisle(spot: OfficeSpot | null): Pt[] {
  if (spot === null) return [GATE, [220, 64], [220, AISLE]]
  const [x, y] = headOf(spot)
  switch (spot.room) {
    case 'eng':
      return [[x, y], [x, AISLE]]
    case 'lab':
      return [[x, y], [x, 310], [411, 310], [411, AISLE]]
    case 'meet':
      return [[x, y], [460, y], [460, AISLE]]
    case 'lounge':
      return [[x, y], [x, 288], [220, 288], [220, AISLE]]
    case 'lobby':
      return [[x, y], [x, 68], [220, 68], [220, AISLE]]
  }
}

export function route(from: OfficeSpot | null, to: OfficeSpot): Pt[] {
  const all = [...toAisle(from), ...toAisle(to).reverse()]
  return all.filter((p, k) => {
    const prev = all[k - 1]
    return prev === undefined || prev[0] !== p[0] || prev[1] !== p[1]
  })
}

function lengthOf(points: Pt[]): number {
  let total = 0
  for (let k = 1; k < points.length; k++) {
    total += Math.hypot(points[k]![0] - points[k - 1]![0], points[k]![1] - points[k - 1]![1])
  }
  return total
}

const esc = (text: string) =>
  text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

const n1 = (v: number) => Math.round(v * 10) / 10

// ---------------------------------------------------------------- people

const SHIRTS = ['#4f7cc9', '#8a6fd1', '#3f9a68', '#d9822b', '#c95a4a', '#2fa3a0', '#d46a9a', '#c9a227', '#6b7bd6', '#7a9a3a']
const HAIRS = ['#2b2420', '#6b4a2f', '#1e1e24', '#c9a25a', '#a5492e', '#8a8a8a', '#3b2a4a']
const SKINS = ['#f3cfa6', '#e6b48c', '#c98f62', '#8f5d3d']

// Eight pixels wide, twelve tall; h hair, s skin, e eyes, c shirt, p trousers, k shoes.
const HEADS = [
  ['..hhhh..', '.hhhhhh.', 'hhsssshh', '.sesses.', '.ssssss.', '..ssss..'],
  ['..hhhh..', '.hhhhhh.', 'hhsssshh', 'hsessesh', 'hssssssh', 'h.ssss.h'],
  ['.h.hh.h.', '.hhhhhh.', '.hssssh.', '.sesses.', '.ssssss.', '..ssss..'],
  ['...hh...', '.hhhhhh.', 'hhsssshh', '.sesses.', '.ssssss.', '..ssss..'],
]
const BODY = ['.cccccc.', 'cccccccc', 'cccccccc', '.cccccc.', '..pppp..', '..k..k..']

const pixelCache = new Map<string, Record<string, string>>()

function pixelPaths(style: number): Record<string, string> {
  const key = String(style)
  const cached = pixelCache.get(key)
  if (cached) return cached
  const rows = [...HEADS[style]!, ...BODY]
  const paths: Record<string, string> = {}
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]!
      let run = 1
      while (row[x + run] === c) run++
      if (c !== '.') paths[c] = `${paths[c] ?? ''}M${-8 + x * 2} ${y * 2}h${run * 2}v2h${-run * 2}z`
      x += run
    }
  })
  pixelCache.set(key, paths)
  return paths
}

type Look = { shirt: string; hair: string; skin: string; style: number }

export function lookOf(seed: number): Look {
  return {
    shirt: SHIRTS[seed % SHIRTS.length]!,
    hair: HAIRS[(seed >>> 4) % HAIRS.length]!,
    skin: SKINS[(seed >>> 8) % SKINS.length]!,
    style: (seed >>> 12) % HEADS.length,
  }
}

const BOSS_LOOK: Look = { shirt: '#d34b3c', hair: '#1e1e24', skin: '#f3cfa6', style: 2 }

/** A person drawn at the origin; `typingDelay` set makes the hands type. */
function person(look: Look, typingDelay: number | null): string {
  const p = pixelPaths(look.style)
  const fill: Record<string, string> = {
    h: look.hair, s: look.skin, e: '#2a2a33', c: look.shirt, p: '#3d4258', k: '#24252b',
  }
  const body = Object.entries(p)
    .map(([c, d]) => `<path d="${d}" fill="${fill[c]}"/>`)
    .join('')
  const hands = `<path d="M-8 18h2v2h-2zM6 18h2v2h-2z" fill="${look.skin}"${
    typingDelay === null ? '' : ` class="ty" style="animation-delay:${n1(typingDelay)}s"`
  }/>`
  return body + hands
}

function badge(label: string, color: string, isInView: boolean): string {
  const w = n1(label.length * 4.9 + 10)
  const ring = isInView ? ' stroke="#ffe066" stroke-width="1.5"' : ''
  return `<rect x="${-w / 2}" y="-14" width="${w}" height="11" rx="3" fill="${color}"${ring}/><text y="-5.6" class="b">${esc(label)}</text>`
}

/** A speech bubble over a head at `x`, nudged sideways to stay in the frame. */
function bubble(text: string, x: number, style = ''): string {
  const line = clip(text, 18)
  const w = n1(line.length * 4.85 + 12)
  const left = x - w / 2
  const right = x + w / 2
  const shift = n1(left < 4 ? 4 - left : right > W - 4 ? W - 4 - right : 0)
  return `<g${style ? ` style="${style}"` : ''}><rect x="${n1(shift - w / 2)}" y="-32" width="${w}" height="13" rx="6" fill="#fff" stroke="#d8cfc0" stroke-width=".8"/><path d="M-3 -19.4l3 3.4l3-3.4z" fill="#fff"/><text x="${shift}" y="-22.6" class="t">${esc(line)}</text></g>`
}

// ---------------------------------------------------------------- furniture

function plant(x: number, y: number): string {
  return `<rect x="${x - 4}" y="${y}" width="8" height="7" fill="#b5653d"/><circle cx="${x}" cy="${y - 3}" r="5" fill="#4f9a55"/><circle cx="${x - 4}" cy="${y - 1}" r="3.5" fill="#3f8a48"/><circle cx="${x + 4}" cy="${y - 1}" r="3.5" fill="#3f8a48"/>`
}

const PROPS: Record<string, (x: number, y: number) => string> = {
  Developer: (x, y) =>
    `<rect x="${x - 5}" y="${y - 8}" width="11" height="9" rx="1" fill="#2d3340"/><path d="M${x - 3} ${y - 6}h5M${x - 3} ${y - 4}h7M${x - 3} ${y - 2}h4" stroke="#7ee08f"/>`,
  QA: (x, y) =>
    `<circle cx="${x}" cy="${y - 3}" r="3.2" fill="#cfe9f7" stroke="#6b4a2f" stroke-width="1.2"/><path d="M${x + 2} ${y - 1}l4 4" stroke="#6b4a2f" stroke-width="1.6"/>`,
  Researcher: (x, y) =>
    `<rect x="${x - 5}" y="${y - 2}" width="10" height="3" fill="#c95a4a"/><rect x="${x - 4}" y="${y - 5}" width="9" height="3" fill="#4f7cc9"/><rect x="${x - 5}" y="${y - 8}" width="10" height="3" fill="#e0b84a"/>`,
  DevOps: (x, y) =>
    `<rect x="${x - 5}" y="${y - 4}" width="10" height="6" rx="1" fill="#5c6270"/><circle cx="${x}" cy="${y - 4}" r="3.4" fill="#e04a3a" stroke="#fff" stroke-width=".8"/>`,
  Designer: (x, y) =>
    `<ellipse cx="${x}" cy="${y - 2}" rx="6" ry="4" fill="#f0dfc0"/><circle cx="${x - 3}" cy="${y - 3}" r="1.2" fill="#d94a6a"/><circle cx="${x}" cy="${y - 4}" r="1.2" fill="#4a8ad9"/><circle cx="${x + 3}" cy="${y - 2}" r="1.2" fill="#4ac07a"/>`,
  Architect: (x, y) =>
    `<rect x="${x - 6}" y="${y - 6}" width="12" height="9" fill="#5b8fd6"/><path d="M${x - 4} ${y - 4}h8M${x - 4} ${y - 1}h5M${x + 2} ${y - 4}v5" stroke="#dfeaff" stroke-width=".8"/>`,
  Reviewer: (x, y) =>
    `<rect x="${x - 5}" y="${y - 7}" width="10" height="10" fill="#fff" stroke="#c9c1b3" stroke-width=".6"/><path d="M${x - 3} ${y - 3}l1.5 1.5l3-3.5" stroke="#3f9a68" stroke-width="1.2" fill="none"/>`,
  Writer: (x, y) =>
    `<rect x="${x - 5}" y="${y - 7}" width="10" height="10" fill="#fff" stroke="#c9c1b3" stroke-width=".6"/><path d="M${x - 3} ${y - 4}h6M${x - 3} ${y - 2}h6M${x - 3} ${y}h4" stroke="#9a9a9a" stroke-width=".6"/><path d="M${x + 3} ${y + 2}l4-7" stroke="#3b3f58" stroke-width="1.2"/>`,
}
PROPS.Librarian = PROPS.Researcher!

function mug(x: number, y: number): string {
  return `<rect x="${x - 3}" y="${y - 5}" width="6" height="6" rx="1" fill="#efe9de"/><rect x="${x + 3}" y="${y - 4}" width="2" height="3" fill="none" stroke="#efe9de"/>`
}

function desk(x: number, y: number, occupant: OfficeAgent | undefined): string {
  const isOn = occupant?.status === 'working'
  const prop = occupant ? (PROPS[occupant.role] ?? mug)(x + 14, y) : ''
  return [
    `<rect x="${x - 20}" y="${y}" width="40" height="12" rx="1" fill="#b9844f"/>`,
    `<rect x="${x - 20}" y="${y + 10}" width="40" height="3" fill="#8d5f36"/>`,
    `<rect x="${x - 19}" y="${y - 7}" width="11" height="9" rx="1" fill="#2d3340"/>`,
    `<rect x="${x - 18}" y="${y - 6}" width="9" height="6" fill="#46505f"${isOn ? ' class="on"' : ''}/>`,
    `<rect x="${x - 14.5}" y="${y + 2}" width="2" height="2" fill="#2d3340"/>`,
    occupant ? '' : mug(x + 12, y + 1),
    prop,
    `<ellipse cx="${x}" cy="${y + 18}" rx="6" ry="3.2" fill="#5f6470"/>`,
  ].join('')
}

function shelf(x: number, y: number, w: number): string {
  const books: string[] = []
  const colors = ['#c95a4a', '#4f7cc9', '#e0b84a', '#3f9a68', '#8a6fd1', '#d9822b', '#2fa3a0']
  for (const row of [0, 1]) {
    for (let bx = x + 3, k = row * 3; bx < x + w - 4; bx += 4, k++) {
      const h = 7 + ((k * 7) % 3)
      books.push(`<rect x="${bx}" y="${y + 3 + row * 11 + (10 - h)}" width="3" height="${h}" fill="${colors[k % colors.length]}"/>`)
    }
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="25" fill="#7a5233"/><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="21" fill="#5a3b24"/>${books.join('')}<rect x="${x + 2}" y="${y + 12.5}" width="${w - 4}" height="1.5" fill="#7a5233"/>`
}

/** The boss's wide desk: two monitors (lit while the main chat works), a phone and a nameplate. */
function bossDesk(isBusy: boolean): string {
  const lit = isBusy ? ' class="on"' : ''
  return [
    `<rect x="34" y="58" width="84" height="14" rx="1" fill="#7d4f2e"/><rect x="34" y="70" width="84" height="4" fill="#5a3620"/>`,
    `<rect x="38" y="49" width="14" height="10" rx="1" fill="#2d3340"/><rect x="39" y="50" width="12" height="7" fill="#46505f"${lit}/>`,
    `<rect x="100" y="49" width="14" height="10" rx="1" fill="#2d3340"/><rect x="101" y="50" width="12" height="7" fill="#46505f"${lit}/>`,
    `<rect x="56" y="61" width="8" height="5" rx="1" fill="#2b2b2b"/><rect x="88" y="60" width="6" height="6" rx="1" fill="#efe9de"/>`,
    `<rect x="62" y="68" width="28" height="5" fill="#c8971f"/><text x="76" y="72" style="font-size:3.6px;fill:#4a2c18;font-weight:700;letter-spacing:.6px">CLAUDE</text>`,
  ].join('')
}

const label = (x: number, y: number, text: string) =>
  `<text x="${x}" y="${y}" class="room">${text}</text>`

const STYLE = `<style>
text{font-family:${FONT};text-anchor:middle}
.b{font-size:8px;font-weight:700;fill:#fff}
.t{font-size:8px;fill:#333}
.room{font-size:7px;letter-spacing:1.5px;fill:rgba(60,40,20,.28);font-weight:700}
.bar{font-size:8px;text-anchor:start}
.on{animation:scr 1.4s steps(2) infinite}
.ty{animation:ty .45s steps(2) infinite}
.led{animation:led 1.1s steps(2) infinite}
.cat{animation:cat 18s linear infinite}
@keyframes scr{0%{fill:#6fd3a5}50%{fill:#a8ecc9}}
@keyframes ty{50%{transform:translateY(-1.5px)}}
@keyframes hop{50%{transform:translateY(-2px)}}
@keyframes fade{0%,80%{opacity:1}100%{opacity:0}}
@keyframes led{50%{fill:#2b2f3a}}
@keyframes cat{0%{transform:translate(0,0) scaleX(1)}45%{transform:translate(90px,0) scaleX(1)}50%{transform:translate(90px,0) scaleX(-1)}95%{transform:translate(0,0) scaleX(-1)}100%{transform:translate(0,0) scaleX(1)}}
</style>`

const DEFS = `<defs><pattern id="wd" width="32" height="12" patternUnits="userSpaceOnUse"><rect width="32" height="12" fill="#d8b788"/><rect y="5.5" width="32" height="1" fill="#cca775"/><rect y="11.5" width="32" height=".5" fill="#cca775"/><rect width="1" height="6" fill="#cca775"/><rect x="16" y="6" width="1" height="6" fill="#cca775"/></pattern><pattern id="tl" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#e6d8bb"/><path d="M0 0h16v1H0zM0 0h1v16H0z" fill="#dacaa6"/></pattern><pattern id="cp" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#aeb0cb"/><rect width="4" height="4" fill="#a7a9c5"/><rect x="4" y="4" width="4" height="4" fill="#a7a9c5"/></pattern></defs>`

function windows(): string {
  const top = [30, 150, 270, 370, 470, 560].map(
    x => `<rect x="${x}" y="1" width="46" height="6" fill="#a8d8f0" stroke="#e8f6ff" stroke-width=".8"/>`,
  )
  const inner = [30, 90, 260, 340].map(
    x => `<rect x="${x}" y="97" width="40" height="6" fill="#a8d8f0" stroke="#e8f6ff" stroke-width=".8"/>`,
  )
  return [...top, ...inner].join('')
}

/** The corner office: the main chat's room, carpet, bookcase, trophy and a window seat. */
const BOSS_ROOM = [
  `<rect x="8" y="8" width="142" height="88" fill="#e9dcc0"/>`,
  `<rect x="16" y="16" width="126" height="74" rx="2" fill="#8e3b46"/><rect x="20" y="20" width="118" height="66" rx="2" fill="none" stroke="#c8a049" stroke-width="1"/>`,
  `<rect x="150" y="8" width="6" height="88" fill="#4b3a2f"/><rect x="150" y="64" width="6" height="22" fill="#e6d8bb"/>`,
  `<rect x="16" y="12" width="26" height="22" fill="#6b4226"/><rect x="18" y="14" width="22" height="8" fill="#4a2c18"/><rect x="18" y="24" width="22" height="8" fill="#4a2c18"/>`,
  `<rect x="19" y="16" width="3" height="6" fill="#c95a4a"/><rect x="23" y="17" width="3" height="5" fill="#4f7cc9"/><rect x="27" y="16" width="3" height="6" fill="#e0b84a"/><rect x="31" y="26" width="6" height="6" fill="#f2c230"/><rect x="33" y="24" width="2" height="2" fill="#f2c230"/>`,
  `<rect x="110" y="13" width="28" height="18" fill="#fbfbf8" stroke="#c8a049" stroke-width="1.2"/><path d="M114 27l6-7l5 4l4-6l5 9z" fill="#5b8fd6"/><circle cx="131" cy="17" r="2" fill="#f2c230"/>`,
  `<rect x="64" y="22" width="24" height="30" rx="4" fill="#3a2a24"/><rect x="66" y="24" width="20" height="10" rx="3" fill="#4d3830"/>`,
  plant(140, 84),
  `<text x="40" y="92" class="room" style="fill:rgba(255,235,200,.55)">BOSS</text>`,
].join('')

/** Everything that never changes: walls, floors, rooms and their furniture. */
const BACKDROP = [
  `<rect width="${W}" height="${BAR}" fill="#4b3a2f"/>`,
  // floors
  `<rect x="8" y="8" width="424" height="88" fill="url(#tl)"/>`,
  `<rect x="8" y="104" width="424" height="160" fill="url(#wd)"/>`,
  `<rect x="440" y="8" width="192" height="256" fill="#b9b8d2"/>`,
  `<rect x="8" y="272" width="292" height="134" fill="#b3c7a2"/>`,
  `<rect x="308" y="272" width="324" height="134" fill="url(#cp)"/>`,
  // doors
  `<rect x="204" y="96" width="32" height="8" fill="#d8b788"/>`,
  `<rect x="204" y="264" width="32" height="8" fill="#b3c7a2"/>`,
  `<rect x="396" y="264" width="30" height="8" fill="#aeb0cb"/>`,
  `<rect x="432" y="176" width="8" height="30" fill="#b9b8d2"/>`,
  windows(),
  // lobby
  `<rect x="198" y="84" width="44" height="9" rx="1" fill="#b49c78"/><text x="220" y="90.6" style="font-size:5px;fill:#7a6446;letter-spacing:.6px">WELCOME</text>`,
  `<rect x="241" y="22" width="2" height="28" fill="#6b4a2f"/><path d="M235 24h14v2h-14z" fill="#6b4a2f"/><ellipse cx="242" cy="50" rx="6" ry="2" fill="#6b4a2f"/>`,
  plant(424, 88),
  label(306, 90, 'LOBBY'),
  BOSS_ROOM,
  // engineering
  `<rect x="412" y="116" width="16" height="36" fill="#fbfbf8" stroke="#c9c1b3" stroke-width=".8"/><path d="M415 122h9M415 127h6M415 132h8M415 140h5" stroke="#5b8fd6" stroke-width="1.2"/><rect x="416" y="144" width="6" height="4" fill="#f4d35e"/>`,
  `<rect x="12" y="108" width="34" height="18" fill="#fbfbf8" stroke="#c9c1b3" stroke-width=".8"/><text x="29" y="116" style="font-size:5px;fill:#4f7cc9;font-weight:700">SHIP IT</text><text x="29" y="122.5" style="font-size:4px;fill:#999">everyday</text>`,
  plant(20, 250),
  label(220, 210, 'ENGINEERING'),
  // meeting room
  `<rect x="452" y="56" width="168" height="152" rx="3" fill="#a2a1c3"/>`,
  ...[500, 540, 580].map(x => `<rect x="${x - 6}" y="100" width="12" height="7" rx="2" fill="#5f6470"/><rect x="${x - 6}" y="153" width="12" height="7" rx="2" fill="#5f6470"/>`),
  `<rect x="482" y="106" width="116" height="46" rx="4" fill="#c8995f" stroke="#9a6f3e" stroke-width="1.5"/>`,
  `<rect x="600" y="14" width="26" height="34" fill="#fbfbf8" stroke="#c9c1b3" stroke-width=".8"/><path d="M604 22h16M604 28h10M604 34h14" stroke="#c95a4a" stroke-width="1.2"/>`,
  plant(456, 36),
  label(536, 252, 'MEETING'),
  // lounge
  `<rect x="22" y="300" width="128" height="62" rx="2" fill="#9db48d"/>`,
  `<rect x="28" y="318" width="112" height="9" rx="2" fill="#9b5d38"/><rect x="28" y="326" width="112" height="18" rx="2" fill="#c27a4a"/><rect x="24" y="320" width="7" height="25" rx="2" fill="#9b5d38"/><rect x="137" y="320" width="7" height="25" rx="2" fill="#9b5d38"/><path d="M84 327v16" stroke="#a5653d"/>`,
  `<circle cx="215" cy="352" r="28" fill="#9fb88f"/><circle cx="215" cy="352" r="16" fill="#c9a26b" stroke="#9c7a4a" stroke-width="1.5"/><rect x="211" y="346" width="5" height="5" rx="1" fill="#efe9de"/>`,
  `<rect x="13" y="278" width="16" height="22" rx="1" fill="#3a3a3a"/><rect x="16" y="281" width="10" height="5" fill="#1d1d1d"/><text x="21" y="285" style="font-size:3.5px;fill:#7ee08f">CAFE</text><circle cx="21" cy="292" r="2" fill="#e04a3a"/>`,
  `<rect x="34" y="282" width="10" height="16" rx="1" fill="#e8e8ec"/><rect x="35" y="276" width="8" height="7" rx="2" fill="#8cc8ef"/>`,
  `<g class="cat"><g transform="translate(150 388)"><rect x="0" y="2" width="12" height="5" fill="#8a7a6a"/><rect x="10" y="-1" width="6" height="5" fill="#8a7a6a"/><rect x="10" y="-3" width="2" height="2" fill="#8a7a6a"/><rect x="14" y="-3" width="2" height="2" fill="#8a7a6a"/><rect x="-3" y="0" width="3" height="2" fill="#8a7a6a"/><rect x="1" y="7" width="2" height="2" fill="#6b5d50"/><rect x="9" y="7" width="2" height="2" fill="#6b5d50"/><rect x="13" y="1" width="1" height="1" fill="#222"/></g></g>`,
  plant(288, 392),
  label(84, 286, 'LOUNGE'),
  // research
  shelf(316, 276, 72),
  shelf(436, 276, 76),
  shelf(528, 276, 72),
  `<rect x="608" y="304" width="20" height="44" rx="1" fill="#2b2f3a"/>`,
  ...[0, 1, 2, 3, 4].map(k => `<rect x="612" y="${309 + k * 8}" width="3" height="2" fill="${k % 2 ? '#7ee08f' : '#f4d35e'}" class="led" style="animation-delay:-${(k * 0.37).toFixed(2)}s"/><rect x="618" y="${309 + k * 8}" width="6" height="2" fill="#4a5060"/>`),
  plant(318, 392),
  label(345, 322, 'RESEARCH'),
].join('')

// ---------------------------------------------------------------- the scene

const VERB_COLOR: Record<string, string> = { working: '#2f9e62', done: '#6b8fbf', failed: '#c95a4a' }

function sprintBoard(queue: number, doing: number, done: number): string {
  const notes = (count: number, x: number, colors: string[]) =>
    Array.from({ length: Math.min(count, 8) }, (_, k) =>
      `<rect x="${x + (k % 2) * 8}" y="${36 + Math.floor(k / 2) * 7}" width="6" height="5" fill="${colors[k % colors.length]}"/>`,
    ).join('')
  return `<g transform="translate(16 0)">${[
    `<rect x="236" y="14" width="96" height="62" fill="#fbfbf8" stroke="#c9c1b3" stroke-width=".8"/>`,
    `<rect x="236" y="14" width="96" height="9" fill="#7b6fc9"/><text x="284" y="20.6" style="font-size:6px;fill:#fff;font-weight:700;letter-spacing:1px">SPRINT</text>`,
    `<path d="M268 25v48M300 25v48" stroke="#e2dccf" stroke-width=".8"/>`,
    `<text x="252" y="31" style="font-size:4.5px;fill:#999">QUEUE</text><text x="284" y="31" style="font-size:4.5px;fill:#999">DOING</text><text x="316" y="31" style="font-size:4.5px;fill:#999">DONE</text>`,
    notes(queue, 245, ['#f4d35e', '#f7b267']),
    notes(doing, 277, ['#8fd3f4', '#a0e3b2', '#f4a9c0']),
    notes(done, 309, ['#a0e3b2']),
  ].join('')}</g>`
}

function statusBar(lead: OfficeLead, agents: OfficeAgent[], working: number): string {
  const items: { name: string; verb: string; dot: string; color: string }[] = [
    {
      name: 'Claude',
      verb: lead.isBusy ? lead.verb : 'Idle',
      dot: BOSS_LOOK.shirt,
      color: lead.isBusy ? VERB_COLOR.working! : '#9a9a9a',
    },
    ...[...agents]
      .sort((a, b) => Number(a.status !== 'working') - Number(b.status !== 'working'))
      .map(a => ({
        name: a.label,
        verb: a.verb,
        dot: lookOf(a.look).shirt,
        color: VERB_COLOR[a.status]!,
      })),
  ]
  const out = [
    `<rect y="${BAR}" width="${W}" height="${H - BAR}" fill="#fbfaf6"/><rect y="${BAR}" width="${W}" height="1" fill="#d9d2c4"/>`,
  ]
  let x = 10
  for (let k = 0; k < items.length; k++) {
    const it = items[k]!
    const w = (it.name.length + it.verb.length + 3) * 4.85 + 18
    if (x + w > W - 104 && k < items.length - 1) {
      out.push(`<text x="${n1(x)}" y="430" class="bar" style="fill:#999">+${items.length - k} more</text>`)
      break
    }
    out.push(
      `<circle cx="${n1(x + 3)}" cy="427.2" r="3" fill="${it.dot}"/><text x="${n1(x + 9)}" y="430" class="bar"><tspan style="fill:#333">${esc(it.name)}</tspan><tspan style="fill:#aaa"> · </tspan><tspan style="fill:${it.color}">${esc(it.verb)}</tspan></text>`,
    )
    x += w
  }
  out.push(
    `<text x="${W - 8}" y="430" class="bar" style="text-anchor:end;fill:#999">${working} at work</text>`,
  )
  return out.join('')
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/**
 * The office as one SVG document: the room, the boss (the main chat) in the corner office, every agent
 * at its seat (or walking to it), and the status bar. `now` places each walk
 * where it would be by now, so a redraw never restarts one.
 */
export function scene(
  agents: OfficeAgent[],
  lead: OfficeLead,
  now: number,
  inView?: string,
): string {
  const placed = agents.filter(a => a.spot.i >= 0)
  const working = agents.filter(a => a.status === 'working')
  const queued = working.filter(a => a.spot.room === 'lobby').length
  const keyframes: string[] = []
  const bodies: string[] = []
  const tags: string[] = []

  // The boss: this main chat, always in the corner office.
  const bossSays = lead.isBusy
    ? lead.detail
    : working.length > 0
      ? `waiting on ${working.length} agent${working.length === 1 ? '' : 's'}`
      : ''
  const [bx, by] = BOSS
  bodies.push(`<g transform="translate(${bx} ${by})">${person(BOSS_LOOK, lead.isBusy ? 0 : null)}</g>`)
  tags.push(
    `<g transform="translate(${bx} ${by})"><title>Claude, the boss: this main chat${lead.isBusy ? ` (${esc(lead.verb)})` : ''}</title>${badge('👑 Claude', '#c8971f', inView === undefined)}${bossSays ? bubble(bossSays, bx) : ''}</g>`,
  )

  placed.forEach((agent, k) => {
    const [tx, ty] = headOf(agent.spot)
    const path = route(agent.from, agent.spot)
    const dur = Math.max(0.6, lengthOf(path) / SPEED)
    const elapsed = (now - agent.movedAt) / 1000
    const isWalking = elapsed < dur
    let place = `transform="translate(${tx} ${ty})"`
    if (isWalking) {
      const total = lengthOf(path)
      let run = 0
      const stops = path.map((p, i) => {
        if (i > 0) run += Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1])
        return `${n1((run / total) * 100)}%{transform:translate(${p[0]}px,${p[1]}px)}`
      })
      keyframes.push(`@keyframes w${k}{${stops.join('')}}`)
      place = `style="transform:translate(${tx}px,${ty}px);animation:w${k} ${n1(dur)}s linear ${n1(-elapsed)}s both"`
    }
    const hop = isWalking
      ? ` style="animation:hop ${HOP}s steps(2) ${n1(-elapsed)}s ${Math.ceil(dur / HOP)}"`
      : ''
    const atDesk = agent.status === 'working' && (agent.spot.room === 'eng' || agent.spot.room === 'lab')
    const typing = atDesk ? Math.max(0, dur - elapsed) : null
    const isInView = inView === agent.id
    const ring = isInView
      ? '<ellipse cx="0" cy="24" rx="10" ry="3" fill="none" stroke="#ffe066" stroke-width="1.6"/>'
      : ''
    bodies.push(`<g ${place}>${ring}<g${hop}>${person(lookOf(agent.look), typing)}</g></g>`)

    const color = agent.status === 'working' ? '#e5953a' : agent.status === 'done' ? '#6aa57a' : '#c95a4a'
    const mark = agent.status === 'done' ? '✓ ' : agent.status === 'failed' ? '✗ ' : ''
    const since = (now - (agent.endedAt ?? agent.movedAt)) / 1000
    const says =
      agent.status === 'working'
        ? bubble(agent.detail, tx)
        : since < 10
          ? bubble(agent.detail, tx, `animation:fade 10s linear ${n1(-since)}s both`)
          : ''
    const took = ago((agent.endedAt ?? now) - agent.startedAt)
    const title = `${agent.label} (${agent.type}): ${agent.description}\n${agent.verb}: ${agent.detail}\n${agent.tools} tool calls · ${took}`
    tags.push(`<g ${place}><title>${esc(title)}</title>${badge(mark + agent.label, color, isInView)}${says}</g>`)
  })

  const occupantOf = (room: 'eng' | 'lab', i: number) =>
    placed.find(a => a.spot.room === room && a.spot.i === i && a.status === 'working')
  const desks = [
    ...ENG_DESK_Y.flatMap((y, row) => ENG_X.map((x, col) => desk(x, y, occupantOf('eng', row * 4 + col)))),
    ...LAB_X.map((x, i) => desk(x, LAB_DESK_Y, occupantOf('lab', i))),
    bossDesk(lead.isBusy),
    `<rect x="170" y="62" width="36" height="3" fill="#d9463b"/><rect x="166" y="54" width="5" height="14" rx="1" fill="#8e939c"/><rect x="205" y="54" width="5" height="14" rx="1" fill="#8e939c"/><text x="188" y="74" style="font-size:5px;fill:#8e939c;font-weight:700;letter-spacing:1px">GATE</text>`,
  ]

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMin meet" shape-rendering="crispEdges">`,
    STYLE.replace('</style>', `${keyframes.join('\n')}\n</style>`),
    DEFS,
    BACKDROP,
    sprintBoard(queued, working.length - queued, agents.length - working.length),
    bodies.join(''),
    desks.join(''),
    `<g shape-rendering="auto">${tags.join('')}</g>`,
    statusBar(lead, agents, working.length),
    '</svg>',
  ].join('')
}

/** What the drawing says, for a reader that cannot see it. */
export function summary(agents: OfficeAgent[], lead: OfficeLead): string {
  const working = agents.filter(a => a.status === 'working')
  const done = agents.length - working.length
  const who = working.map(a => `${a.label} (${a.verb}: ${a.detail})`).join('; ')
  return `Agent office. Claude (boss) ${lead.isBusy ? lead.verb : 'idle'}. ${working.length} agents at work${who ? `: ${who}` : ''}. ${done} finished.`
}
