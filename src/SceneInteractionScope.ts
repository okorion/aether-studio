import { sampleLayers } from './SceneLayers'

export type PointerStreakScope = { exit: number; entry: number; visible: boolean }

// A viewport spans [-.1, 1.1] after the forest's diagonal offset. Keep a
// conservative fringe for its .006 soft edge and .003 maximum noise offset.
const fringe = .009

/** Scope only the flying streaks; shared pointer deformation stays active. */
export function samplePointerStreakScope(progress: number): PointerStreakScope {
  const layers = sampleLayers(progress)
  return {
    exit: layers.forestExit,
    entry: layers.forestEntry,
    visible: layers.forestExit < 1.1 + fringe || layers.forestEntry > -.1 - fringe,
  }
}

/** Conservative birth gate. The final, displaced fragment owns exact clipping. */
export function pointerStreakCanSpawn(scope: PointerStreakScope, x: number, y: number) {
  if (!scope.visible || !Number.isFinite(x) || !Number.isFinite(y) ||
    x < -1 || x > 1 || y < -1 || y > 1) return false
  const edge = y * .5 + .5 - x * .1
  return edge + fringe > scope.exit || edge - fringe < scope.entry
}

// Match SceneForest's screen UV, slant, interpolated noise and feather width.
// Clip after the comet's vertex flight so a live head cannot cross the seam.
// No texture, define, extra pass or runtime program variant is required.
export const pointerStreakScopeGLSL = /* glsl */ `
  uniform float uStreakForestExit;
  uniform float uStreakForestEntry;
  varying vec4 vStreakClip;
  float streakScopeHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float streakScopeNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(streakScopeHash(i), streakScopeHash(i + vec2(1., 0.)), f.x),
      mix(streakScopeHash(i + vec2(0., 1.)), streakScopeHash(i + 1.), f.x), f.y);
  }
  float streakForestCoverage() {
    vec2 screen = vStreakClip.xy / vStreakClip.w * .5 + .5;
    float y = screen.y - (screen.x - .5) * .20 + (streakScopeNoise(screen * 230.) - .5) * .006;
    float top = smoothstep(uStreakForestExit - .006, uStreakForestExit + .006, y);
    float bottom = 1. - smoothstep(uStreakForestEntry - .006, uStreakForestEntry + .006, y);
    return max(top, bottom);
  }
`
