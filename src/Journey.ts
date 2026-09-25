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

/** Positive pitch looks down. Keep the lower clearing near eye level. */
export const forestPitchLimit = (progress: number) => progress >= .855 ? .04 : .6

/** Forests rotate in front of a fixed film; mechanical rooms retain orbit. */
export function sampleViewAzimuth(progress: number, requested: number) {
  const forest = progress < .5 ? 1 - smooth(.16, .20, progress) : smooth(.855, .885, progress)
  return requested + ((progress < .5 ? 0 : Math.PI * 2) - requested) * forest
}

// [radius, unwrapped azimuth, elevation, exposure, world height]. The camera
// follows one descending focus through a fixed environment, never a room swap.
const cameraScore = [
  [11.6, 0, .03, 1.24, 0], [11.1, .75, .06, 1.28, -1.8], [9.3, 2.2, .04, 1.32, -4.5],
  [6.6, 4.3, .01, 1.4, -7.7], [5.2, 6.1, 0, 1.5, -11], [6.5, 6.28, .03, 1.4, -14],
  [9.8, 6.28, .03, 1.38, -16.5], [11.5, 6.28, .03, 1.4, -18.5], [12, 6.28, .02, 1.48, -21],
  [11.6, 6.28, .02, 1.5, -23.5], [11, 6.28, 0, 1.48, -26], [10.6, 6.28, .02, 1.4, -28.5],
  [11.6, 6.28, .04, 1.2, -31], [12.5, 6.28, .07, 1.15, -33.5], [11.8, Math.PI * 2, .04, 1.15, -36],
  [11.1, Math.PI * 2, 0, 1.24, -38.5], [10.2, Math.PI * 2, 0, 1.28, -40.5], [10, Math.PI * 2, 0, 1.3, -42.5],
  [10.8, 6.65, -.03, 1.45, -45], [11.6, 6.3, -.02, 1.2, -47.5], [12, 6.65, .04, .94, -50.5],
  [12, 7.7, .09, .8, -54], [11.6, 10.0, .11, .86, -57.5], [11.4, 12.25, .1, .94, -61.5],
]

// Monotone cubic slopes preserve continuous travel through the authored stops.
// Per-stop smoothstep would halt the descent at all 24 keyframes.
function sampleTrack(index: number, t: number, column: number) {
  const value = (i: number) => cameraScore[Math.max(0, Math.min(23, i))][column]
  const slope = (i: number) => {
    const left = value(i) - value(i - 1)
    const right = value(i + 1) - value(i)
    if (i === 0) return right
    if (i === 23) return left
    return left * right <= 0 ? 0 : 2 * left * right / (left + right)
  }
  const t2 = t * t, t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * value(index) + (t3 - 2 * t2 + t) * slope(index)
    + (-2 * t3 + 3 * t2) * value(index + 1) + (t3 - t2) * slope(index + 1)
}

export function sampleJourney(value: number) {
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  const position = progress * (journeyStops.length - 1)
  const index = Math.min(journeyStops.length - 2, Math.floor(position))
  const mix = (n: number) => sampleTrack(index, position - index, n)
  const spine = windowWeight(progress, .20, .29, .60, .69)
  const machine = windowWeight(progress, .60, .69, .75, .81)
  const scales = windowWeight(progress, .74, .81, .87, .94)
  const core = windowWeight(progress, .20, .28, .88, .96)
  const end = smooth(.86, .97, progress)
  // Restore camera control as the lower forest enters the scale curtain.
  // The same weight gates drag and hover parallax in the mechanical scenes.
  const orbitWeight = 1 - windowWeight(progress, .20, .235, .86, .88)
  const overlay = progress < .1 ? 'entry' : progress < .235 ? 'statement'
    : progress < .65 ? 'work' : progress < .78 ? 'machine'
      : progress < .89 ? 'scales' : 'contact'
  return {
    progress, index: Math.min(23, Math.round(position)),
    radius: mix(0), azimuth: mix(1), elevation: mix(2), exposure: mix(3),
    height: mix(4),
    structureYaw: Math.PI * 4 * smooth(.235, .665, progress),
    // An absolute scroll phase is reversible and exactly still at rest.
    chainPhase: progress * 10,
    orbitWeight, orbitEnabled: orbitWeight > 0,
    spine, machine, scales, core, end, overlay,
    energy: .22 + spine * 1.4 + machine * .75 + scales * .85,
    darkness: smooth(.81, .97, progress),
  }
}
