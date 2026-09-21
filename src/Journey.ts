/** One continuous score, shared by the camera, matter, light and page copy. */
export const journeyStops = [
  ['arrival', 'Entry'], ['suspended', 'Suspension'], ['approach', 'Approach'],
  ['insignia', 'Insignia'], ['imagination', 'Imagination'], ['unfold', 'Unfold'],
  ['vertebrae', 'Vertebrae'], ['current', 'Current'], ['screens', 'Living screens'],
  ['orbit', 'Orbit'], ['cascade', 'Cascade'], ['resonance', 'Resonance'],
  ['parallax', 'Parallax'], ['converge', 'Convergence'], ['descent', 'Descent'],
  ['chamber', 'Chamber'], ['reactor', 'Reactor'], ['scales', 'Iridescence'],
  ['bloom', 'Metal bloom'], ['fold', 'Fold'], ['depth', 'Depth'],
  ['afterglow', 'Afterglow'], ['return', 'Return'], ['silence', 'Silence'],
] as const

export const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const windowWeight = (p: number, a: number, b: number, c: number, d: number) =>
  smooth(a, b, p) * (1 - smooth(c, d, p))

// [radius, azimuth, elevation, exposure]. Every stop looks at the same centre.
const cameraScore = [
  [11.6, 0, 0.03, 1.24], [11.1, 0.03, 0.04, 1.28], [9.3, 0.06, 0.03, 1.32],
  [6.6, 0.08, 0.01, 1.4], [5.2, 0.05, 0, 1.5], [6.5, 0.08, 0.04, 1.4],
  [9.8, 0.14, 0.04, 1.38], [11.5, 0.2, 0.06, 1.4], [12, 0.26, 0.05, 1.48],
  [11.6, 0.33, 0.02, 1.5], [11, 0.38, 0, 1.48], [10.6, 0.3, 0.08, 1.4],
  [11.6, 0.18, 0.16, 1.2], [12.5, 0.1, 0.13, 1.15], [11.8, 0.04, 0.08, 1.25],
  [11, 0, 0.06, 1.42], [10.7, -0.04, 0.1, 1.52], [10, -0.1, 0.12, 1.58],
  [10.8, -0.16, 0.08, 1.45], [11.6, -0.1, 0.04, 1.2], [12, 0, -0.03, 0.94],
  [12, 0.06, -0.06, 0.8], [11.6, 0.05, -0.02, 0.86], [11.4, 0.04, 0.01, 0.94],
]

export function sampleJourney(value: number) {
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  const position = progress * (journeyStops.length - 1)
  const index = Math.min(journeyStops.length - 2, Math.floor(position))
  const blend = smooth(0, 1, position - index)
  const from = cameraScore[index]
  const to = cameraScore[index + 1]
  const mix = (n: number) => from[n] + (to[n] - from[n]) * blend
  const spine = windowWeight(progress, .20, .29, .60, .69)
  const machine = windowWeight(progress, .60, .69, .75, .81)
  const scales = windowWeight(progress, .74, .81, .87, .94)
  const core = windowWeight(progress, .20, .28, .88, .96)
  const end = smooth(.86, .97, progress)
  const overlay = progress < .1 ? 'entry' : progress < .235 ? 'statement'
    : progress < .65 ? 'work' : progress < .78 ? 'machine'
      : progress < .89 ? 'scales' : 'contact'
  return {
    progress, index: Math.min(23, Math.round(position)),
    radius: mix(0), azimuth: mix(1), elevation: mix(2), exposure: mix(3),
    spine, machine, scales, core, end, overlay,
    energy: .22 + spine * 1.4 + machine * .75 + scales * .85,
    darkness: smooth(.81, .97, progress),
  }
}
