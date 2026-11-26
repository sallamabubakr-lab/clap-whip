// The drawings: two pixel characters on a strip above the prompt. The idle
// scene loops; the crack scene plays once from the moment it is shown.

/** The drawing's own units; it is shown one and a half times as large. */
const WIDTH = 454
const HEIGHT = 72

export const SHOWN_WIDTH = 681
export const SHOWN_HEIGHT = 108

/** Seconds the crack scene runs before the idle scene returns. */
export const CRACK_SECONDS = 2.6

const PIXEL = 3
const GROUND = 66

// The Claude character: a wide block of a body, two tall eyes, a stub of an
// arm on each side and four short legs.
const CRITTER = [
  '..BBBBBBBB..',
  '..BEBBBBEB..',
  '..BEBBBBEB..',
  'BBBBBBBBBBBB',
  'BBBBBBBBBBBB',
  '..BBBBBBBB..',
  '..B.B..B.B..',
  '..B.B..B.B..',
]
const CRITTER_WIDTH = 12 * 3
const CRITTER_HEIGHT = CRITTER.length * 3

const MASTER = [
  '..HHHH..',
  '..HHHH..',
  '.HRRRRH.',
  '.WWWWWW.',
  '.WKWWKW.',
  '.WWKKWW.',
  '..CCCC..',
  '.CCYYCC.',
  '.CCYYCC.',
  '.CCYYCC.',
  '.WW..WW.',
  '.WW..WW.',
]

const COLORS: Record<string, string> = {
  B: '#D97757',
  E: '#2A1A14',
  H: '#2E2A33',
  R: '#D8402F',
  W: '#F6F1E7',
  K: '#2E2A33',
  C: '#E0452F',
  Y: '#FFD84A',
}

const CRITTER_X = 118
const CRITTER_Y = GROUND - CRITTER.length * PIXEL
const MASTER_X = WIDTH - 26 - 8 * PIXEL
const MASTER_Y = GROUND - MASTER.length * PIXEL
const HAND_X = MASTER_X + 1
const HAND_Y = MASTER_Y + 8 * PIXEL

function sprite(rows: string[], x: number, y: number): string {
  let out = ''
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const key = row[c] ?? '.'
      let end = c
      while (end < row.length && row[end] === key) end += 1
      if (key !== '.') {
        out += `<rect x="${x + c * PIXEL}" y="${y + r * PIXEL}" width="${(end - c) * PIXEL}" height="${PIXEL}" fill="${COLORS[key]}"/>`
      }
      c = end
    }
  })
  return out
}

/** A speech bubble whose tail points down at `tailX`; `anchor` says which end stays put. */
function bubble(text: string, tailX: number, bottom: number, color: string, anchor: 'start' | 'end'): string {
  const width = text.length * 6.6 + 14
  const height = 16
  const left = anchor === 'start' ? Math.max(2, tailX - 12) : Math.min(WIDTH - 2 - width, tailX - width + 12)
  const top = bottom - height - 4
  return (
    `<g filter="url(#edge)">` +
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="3" fill="#FFFFFF"/>` +
    `<path d="M${tailX - 3} ${top + height - 0.5} h6 l-3 4 z" fill="#FFFFFF"/>` +
    `</g>` +
    `<text x="${left + width / 2}" y="${top + 11.5}" text-anchor="middle" font-family="Menlo, Monaco, 'Courier New', monospace" font-size="10" font-weight="700" fill="${color}">${text}</text>`
  )
}

function frame(body: string, nonce: number): string {
  // Each crack names its filter differently, so two cracks are never the same
  // drawing and the second always plays from its start.
  const edge = `edge${nonce}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHOWN_WIDTH}" height="${SHOWN_HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="crispEdges">` +
        `<defs><filter id="${edge}" x="-10%" y="-20%" width="120%" height="140%">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="1" result="grown"/>` +
    `<feFlood flood-color="#2E2A33" flood-opacity="0.6"/>` +
    `<feComposite in2="grown" operator="in" result="rim"/>` +
    `<feMerge><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter></defs>` +
    body.replaceAll('url(#edge)', `url(#${edge})`) +
    `</svg>`
  )
}

const WHIP_STYLE = 'fill="none" stroke="#B98A4E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision"'

/** The whip at rest: trailing on the ground from the taskmaster's hand. */
const RESTING_WHIP = `M${HAND_X} ${HAND_Y} q-6 13 -18 14 q-12 1 -22 -3 q-8 -3 -14 1`

function master(): string {
  return `<g filter="url(#edge)">${sprite(MASTER, MASTER_X, MASTER_Y)}</g>`
}

function critter(): string {
  return `<g filter="url(#edge)">${sprite(CRITTER, CRITTER_X, CRITTER_Y)}</g>`
}

/** The strip between cracks: the critter bobs (faster while Claude works), the whip tip twitches. */
export function idleScene(isWorking: boolean, hint: string): string {
  const bob = isWorking ? 0.45 : 1.6
  const critterBubble = isWorking ? bubble('WORKING...', CRITTER_X + 18, CRITTER_Y - 2, '#C8551F', 'end') : ''
  const masterBubble = hint === '' ? '' : bubble(hint, MASTER_X + 12, MASTER_Y - 2, '#B5301F', 'end')
  return frame(
    `<g>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0; 0 -2; 0 0" dur="${bob}s" repeatCount="indefinite"/>` +
      critter() +
      `</g>` +
      critterBubble +
      `<path ${WHIP_STYLE} d="${RESTING_WHIP}">` +
      `<animate attributeName="d" dur="2.4s" repeatCount="indefinite" values="${RESTING_WHIP}; M${HAND_X} ${HAND_Y} q-6 13 -18 14 q-12 1 -22 -3 q-8 -3 -14 -3; ${RESTING_WHIP}"/>` +
      `</path>` +
      master() +
      masterBubble,
    0,
  )
}

/** One whip crack, start to finish: wind-up, lash across the strip, CRACK!, and a very motivated critter. */
export function crackScene(nonce: number): string {
  const hitX = CRITTER_X + CRITTER_WIDTH + 4
  const hitY = CRITTER_Y + 6
  const lashLength = Math.round(HAND_X - hitX + 80)

  const windUp =
    `<path ${WHIP_STYLE} opacity="0" d="M${HAND_X} ${HAND_Y - 6} c-4 -22 -4 -40 8 -44 c12 -4 16 14 8 26 c-8 12 -22 2 -16 -14 c5 -13 20 -18 30 -10">` +
    `<set attributeName="opacity" to="1" begin="0s" dur="0.2s"/>` +
    `<animateTransform attributeName="transform" type="rotate" values="14 ${HAND_X} ${HAND_Y}; -10 ${HAND_X} ${HAND_Y}" begin="0s" dur="0.2s" fill="freeze"/>` +
    `</path>`

  const lash =
    `<path ${WHIP_STYLE} opacity="0" stroke-dasharray="${lashLength}" stroke-dashoffset="${lashLength}" d="M${HAND_X} ${HAND_Y - 8} C${HAND_X - 120} ${HAND_Y - 46} ${hitX + 200} ${hitY - 34} ${hitX} ${hitY}">` +
    `<set attributeName="opacity" to="1" begin="0.2s" dur="0.3s"/>` +
    `<animate attributeName="stroke-dashoffset" from="${lashLength}" to="0" begin="0.2s" dur="0.1s" fill="freeze"/>` +
    `<animate attributeName="opacity" from="1" to="0" begin="0.4s" dur="0.1s"/>` +
    `</path>`

  const rest =
    `<path ${WHIP_STYLE} opacity="0" d="${RESTING_WHIP}">` +
    `<set attributeName="opacity" to="1" begin="0.5s" fill="freeze"/>` +
    `</path>`

  const sparkList: [number, number, string][] = [
    [-10, -8, '#FFD84A'],
    [4, -14, '#FFFFFF'],
    [14, -6, '#FFD84A'],
    [10, 6, '#FFFFFF'],
    [-6, 8, '#FFB020'],
    [20, 2, '#FFB020'],
  ]
  const sparks = sparkList
    .map(
      ([dx, dy, color]) =>
        `<rect x="${hitX - 2}" y="${hitY - 2}" width="4" height="4" fill="${color}" opacity="0">` +
        `<set attributeName="opacity" to="1" begin="0.3s" dur="0.45s"/>` +
        `<animateTransform attributeName="transform" type="translate" from="0 0" to="${dx * 1.6} ${dy * 1.6}" begin="0.3s" dur="0.45s" fill="freeze"/>` +
        `</rect>`,
    )
    .join('')

  const crackWord =
    `<g opacity="0">` +
    `<set attributeName="opacity" to="1" begin="0.3s" dur="1.25s"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 6; 0 -3; 0 0" keyTimes="0; 0.5; 1" begin="0.3s" dur="0.22s" fill="freeze"/>` +
    `<text x="${hitX + 14}" y="${hitY - 2}" transform="rotate(-8 ${hitX + 14} ${hitY - 2})" font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-size="21" font-weight="900" font-style="italic" fill="#FFD84A" stroke="#5A3A00" stroke-width="3" paint-order="stroke" stroke-linejoin="round" shape-rendering="geometricPrecision">CRACK!</text>` +
    `</g>`

  const sweatList: [number, number][] = [
    [-7, 2],
    [39, 0],
    [42, 9],
  ]
  const sweat = sweatList
    .map(
      ([dx, dy], i) =>
        `<rect x="${CRITTER_X + dx}" y="${CRITTER_Y + dy}" width="3" height="5" fill="#6EC3F4" opacity="0">` +
        `<animate attributeName="opacity" values="0; 1; 1; 0" begin="${0.6 + i * 0.18}s" dur="0.6s" repeatCount="3"/>` +
        `<animateTransform attributeName="transform" type="translate" from="0 0" to="${dx < 0 ? -3 : 3} 6" begin="${0.6 + i * 0.18}s" dur="0.6s" repeatCount="3"/>` +
        `</rect>`,
    )
    .join('')

  const okay =
    `<g opacity="0">` +
    `<set attributeName="opacity" to="1" begin="0.45s" fill="freeze"/>` +
    bubble('OKAY OKAY OKAY', CRITTER_X + 18, CRITTER_Y - 9, '#C8551F', 'end') +
    `</g>`

  const jumpingCritter =
    `<g>` +
    // The hit: a jump, then frantic scurrying on the spot.
    `<animateTransform attributeName="transform" type="translate" values="0 0; 0 -9; 0 0" begin="0.3s" dur="0.26s"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0; -2 -1; 2 0; -2 -1; 0 0" begin="0.57s" dur="0.2s" repeatCount="10"/>` +
    critter() +
    `<rect x="${CRITTER_X}" y="${CRITTER_Y}" width="${CRITTER_WIDTH}" height="${CRITTER_HEIGHT}" fill="#FFFFFF" opacity="0">` +
    `<set attributeName="opacity" to="0.75" begin="0.3s" dur="0.08s"/>` +
    `</rect>` +
    `</g>`

  const crackingMaster =
    `<g>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0; 2 -2; -2 0; 0 0" keyTimes="0; 0.5; 0.8; 1" begin="0s" dur="0.6s"/>` +
    master() +
    `</g>`

  return frame(
    jumpingCritter + sweat + okay + windUp + lash + rest + crackingMaster + bubble('FASTER!', MASTER_X + 12, MASTER_Y - 2, '#B5301F', 'end') + sparks + crackWord,
    nonce,
  )
}
