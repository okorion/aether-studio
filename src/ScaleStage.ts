import { sampleJourney } from './Journey'
import { REACTOR } from './Reactor'

export const SCALE_CEILING_Y = REACTOR.worldY - 3.7 * REACTOR.heightScale
export const SCALE_PANEL_Y = SCALE_CEILING_Y - 3.6

/** A fixed panel and ceiling share the same descending camera. */
export function sampleScaleOffset(progress: number) {
  return SCALE_PANEL_Y - sampleJourney(progress).height
}

/** Linear camera-height passage, without a second ease at each curtain. */
export function sampleScaleCurtain(progress: number, lower: boolean) {
  const start = sampleJourney(lower ? .855 : .715).height
  const end = sampleJourney(lower ? .925 : .785).height
  const travel = Math.max(0, Math.min(1, (sampleJourney(progress).height - start) / (end - start)))
  return lower ? -.35 + travel * 1.7 : -.25 + travel * 1.5
}
