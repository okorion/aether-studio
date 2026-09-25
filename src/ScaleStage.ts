import { smooth } from './Journey'

/** The panel travels with its curtain instead of crossing a second tall room. */
export function sampleScaleOffset(progress: number) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  return -4.2 * (1 - smooth(.715, .785, p)) + 3.6 * smooth(.855, .925, p)
}

// The outgoing floor and incoming ceiling meet at the same screen-space cut.
// The incoming ceiling stays above the eye throughout the entire visible band.
export const SCALE_CEILING_CLEARANCE = 4.0
