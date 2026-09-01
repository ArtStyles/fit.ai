const WEB_WIDTH = 760
const WEB_HEIGHT = 143
const WEB_CENTER = { x: WEB_WIDTH / 2, y: WEB_HEIGHT / 2 }
const SPOKE_COUNT = 24
const RING_COUNT = 8

export type MusicWebSpoke = {
  x1: number
  y1: number
  x2: number
  y2: number
  opacity: number
}

export type MusicWebRing = {
  d: string
  opacity: number
  width: number
  accent: boolean
}

export type MusicWebGeometry = {
  spokes: MusicWebSpoke[]
  rings: MusicWebRing[]
}

type Point = { x: number; y: number }

function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let mixed = value
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

function rounded(value: number): number {
  return Number(value.toFixed(3))
}

function pointAtHaloBoundary(angle: number): Point {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const distanceToX = dx > 0
    ? (WEB_WIDTH - WEB_CENTER.x) / dx
    : (0 - WEB_CENTER.x) / dx
  const distanceToY = dy > 0
    ? (WEB_HEIGHT - WEB_CENTER.y) / dy
    : (0 - WEB_CENTER.y) / dy

  if (distanceToX <= distanceToY) {
    return {
      x: dx > 0 ? WEB_WIDTH : 0,
      y: rounded(WEB_CENTER.y + dy * distanceToX),
    }
  }

  return {
    x: rounded(WEB_CENTER.x + dx * distanceToY),
    y: dy > 0 ? WEB_HEIGHT : 0,
  }
}

function ringPath(points: Point[], ringIndex: number, random: () => number): string {
  const commands = [`M ${points[0].x} ${points[0].y}`]

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const current = points[pointIndex]
    const next = points[(pointIndex + 1) % points.length]
    const midpointX = (current.x + next.x) / 2
    const midpointY = (current.y + next.y) / 2
    const length = Math.hypot(midpointX - WEB_CENTER.x, midpointY - WEB_CENTER.y) || 1
    const bend = 1 + random() * 2
    const direction = (pointIndex + ringIndex) % 2 === 0 ? 1 : -1
    const controlX = midpointX + ((midpointX - WEB_CENTER.x) / length) * bend * direction
    const controlY = midpointY + ((midpointY - WEB_CENTER.y) / length) * bend * direction

    commands.push(`Q ${rounded(controlX)} ${rounded(controlY)} ${next.x} ${next.y}`)
  }

  return `${commands.join(' ')} Z`
}

export function buildMusicWebGeometry(seed: number): MusicWebGeometry {
  const random = mulberry32(seed)
  const endpoints = Array.from({ length: SPOKE_COUNT }, (_, index) => {
    const regularAngle = (index / SPOKE_COUNT) * Math.PI * 2
    const organicAngleOffset = (random() - 0.5) * 0.035
    return pointAtHaloBoundary(regularAngle + organicAngleOffset)
  })
  const spokes = endpoints.map(endpoint => ({
    x1: WEB_CENTER.x,
    y1: WEB_CENTER.y,
    x2: endpoint.x,
    y2: endpoint.y,
    opacity: rounded(0.1 + random() * 0.12),
  }))
  const rings = Array.from({ length: RING_COUNT }, (_, ringIndex) => {
    const progress = (ringIndex + 1) / (RING_COUNT + 1)
    const points = endpoints.map(endpoint => {
      const dx = endpoint.x - WEB_CENTER.x
      const dy = endpoint.y - WEB_CENTER.y
      const length = Math.hypot(dx, dy) || 1
      const irregularity = (1 + random() * 2) * (random() < 0.5 ? -1 : 1)

      return {
        x: rounded(WEB_CENTER.x + dx * progress + (dx / length) * irregularity),
        y: rounded(WEB_CENTER.y + dy * progress + (dy / length) * irregularity),
      }
    })

    return {
      d: ringPath(points, ringIndex, random),
      opacity: rounded(0.08 + random() * 0.1),
      width: rounded(0.45 + random() * 0.35),
      accent: ringIndex === 2 || ringIndex === 6,
    }
  })

  return { spokes, rings }
}

export function buildMusicBarPhases(seed: number): [number, number, number, number] {
  const random = mulberry32(seed)
  return [random(), random(), random(), random()]
}
