import { sampleJourney, FOREST_ENTRY_START, FOREST_ENTRY_END } from './Journey'
import { REACTOR } from './Reactor'

export const SCALE_CEILING_Y = REACTOR.worldY - 3.7 * REACTOR.heightScale
export const SCALE_PANEL_Y = SCALE_CEILING_Y - 2.65

/** A fixed panel and ceiling share the same descending camera. */
export function sampleScaleOffset(progress: number) {
  return SCALE_PANEL_Y - sampleJourney(progress).height
}

/** Linear camera-height passage, without a second ease at each curtain. */
export function sampleScaleCurtain(progress: number, lower: boolean) {
  // The water is entirely below the horizontal horizon. Its outgoing band
  // must cover that half (including the diagonal fringe) before water fades
  // within 0.30 world units of the eye. The upper room can finish sliding out.
  if (!lower) return Math.max(-.25, Math.min(1.25, .8 + (SCALE_CEILING_Y - sampleJourney(progress).height) * .4))
  // Begin while the panel is still in view, not after an empty screen below it.
  const start = sampleJourney(FOREST_ENTRY_START).height
  const end = sampleJourney(FOREST_ENTRY_END).height
  const travel = Math.max(0, Math.min(1, (sampleJourney(progress).height - start) / (end - start)))
  return -.35 + travel * 1.7
}
