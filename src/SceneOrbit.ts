import { FOREST_ENTRY_START, forestPitchLimit, forestPitchMinimum } from './Journey'

/** Apply unlock gain to new input, never to an angle saved before the curtain. */
export function createLowerForestOrbit(initial = { yaw: 0, pitch: 0 }, saved = { yaw: 0, pitch: 0 }) {
  let previous = { ...initial }
  let { yaw, pitch } = saved
  return (progress: number, input: { yaw: number; pitch: number; resetting?: boolean }, gain: number, delta = 1 / 60) => {
    if (input.resetting) {
      yaw *= Math.exp(-3 * delta)
      pitch *= Math.exp(-3 * delta)
    } else if (progress > FOREST_ENTRY_START) {
      yaw += (input.yaw - previous.yaw) * gain
      // Pitch has absolute safety bounds. Mapping it directly keeps both ends
      // reachable even when a pitch was retained from the upper forest.
      pitch = input.pitch * gain
      pitch = Math.max(forestPitchMinimum(progress), Math.min(forestPitchLimit(progress), pitch))
    }
    previous = { yaw: input.yaw, pitch: input.pitch }
    return { yaw, pitch }
  }
}
