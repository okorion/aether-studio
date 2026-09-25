// Positive distance weights preserve an exact inverse for reverse scrolling.
export const SCALE_SCROLL_START = .765
export const SCALE_SCROLL_END = .925
export const SCALE_SCROLL_RATIO = .60
const spans = [
  [0, .065, 1.2], [.065, .14, 1.7], [.14, .765, 1],
  [.765, .805, SCALE_SCROLL_RATIO], [.805, .855, .18],
  [.855, .925, .5], [.925, 1, 1.65],
] as const
const length = spans.reduce((sum, [a, b, weight]) => sum + (b - a) * weight, 0)
const clamp = (p: number) => Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0

export const journeyHeightSvh = 100 + 1700 * length

export function sceneToScroll(value: number) {
  const p = clamp(value)
  return spans.reduce((sum, [a, b, weight]) => sum + Math.max(0, Math.min(p, b) - a) * weight, 0) / length
}

export function scrollToScene(value: number) {
  let distance = clamp(value) * length
  for (const [a, b, weight] of spans) {
    const span = (b - a) * weight
    if (distance < span) return a + distance / weight
    distance -= span
  }
  return 1
}
