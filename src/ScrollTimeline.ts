// Positive distance weights preserve an exact inverse for reverse scrolling.
export const SCALE_SCROLL_START = .785
export const SCALE_SCROLL_END = .855
export const SCALE_SCROLL_HEIGHT_SVH = 100
export const SCALE_SCROLL_RATIO = SCALE_SCROLL_HEIGHT_SVH / (1700 * (SCALE_SCROLL_END - SCALE_SCROLL_START))
const spans = [
  [0, .065, 1.2], [.065, .14, 1.7], [.14, SCALE_SCROLL_START, 1],
  [SCALE_SCROLL_START, SCALE_SCROLL_END, SCALE_SCROLL_RATIO],
] as const
const prefixLength = spans.reduce((sum, [a, b, weight]) => sum + (b - a) * weight, 0)
// Integrate a smooth 1 -> 1.65 distance weight around the former .925 step.
// Its area is unchanged, so total page height and earlier poses stay fixed.
const lowerDistance = (p: number) => {
  const t = Math.max(0, Math.min(1, (p - .905) / .04))
  const hold = .04 * (t ** 3 - .5 * t ** 4) + Math.max(0, p - .945)
  return Math.max(0, p - SCALE_SCROLL_END) + .65 * hold
}
const length = prefixLength + lowerDistance(1)
const clamp = (p: number) => Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0

export const journeyHeightSvh = 100 + 1700 * length

export function sceneToScroll(value: number) {
  const p = clamp(value)
  return (spans.reduce((sum, [a, b, weight]) => sum + Math.max(0, Math.min(p, b) - a) * weight, 0)
    + lowerDistance(p)) / length
}

export function scrollToScene(value: number) {
  if (clamp(value) === 1) return 1
  let distance = clamp(value) * length
  for (const [a, b, weight] of spans) {
    const span = (b - a) * weight
    if (distance < span) return a + distance / weight
    distance -= span
  }
  // Strictly positive weights make this inverse unique in either direction.
  let low = SCALE_SCROLL_END, high = 1
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) * .5
    if (lowerDistance(middle) < distance) low = middle
    else high = middle
  }
  return (low + high) * .5
}
