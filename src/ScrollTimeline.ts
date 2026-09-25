// Shorten travel through the scale room without flattening its actual panel
// or changing any authored world poses / forward-and-reverse scene curtains.
export const SCALE_SCROLL_START = .765
export const SCALE_SCROLL_END = .925
export const SCALE_SCROLL_RATIO = .60
const saved = (SCALE_SCROLL_END - SCALE_SCROLL_START) * (1 - SCALE_SCROLL_RATIO)
const length = 1 - saved
const clamp = (p: number) => Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0

export const journeyHeightSvh = 100 + 1700 * length

export function sceneToScroll(value: number) {
  const p = clamp(value)
  return (p <= SCALE_SCROLL_START ? p : p >= SCALE_SCROLL_END ? p - saved
    : SCALE_SCROLL_START + (p - SCALE_SCROLL_START) * SCALE_SCROLL_RATIO) / length
}

export function scrollToScene(value: number) {
  const distance = clamp(value) * length
  return distance <= SCALE_SCROLL_START ? distance : distance >= SCALE_SCROLL_END - saved ? distance + saved
    : SCALE_SCROLL_START + (distance - SCALE_SCROLL_START) / SCALE_SCROLL_RATIO
}
