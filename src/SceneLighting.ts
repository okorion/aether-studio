import { smooth, windowWeight } from './Journey'
import type * as THREE from 'three'

/** The media lifecycle owns the texture; materials only share these references. */
export type LightFilmUniforms = {
  map: { value: THREE.Texture }
  ready: { value: number }
}

export function createLightFilmUniforms(fallback: THREE.Texture): LightFilmUniforms {
  return { map: { value: fallback }, ready: { value: 0 } }
}

/** Slow light motion uses the scene's preserved elapsed time, never wall time. */
export function sampleLightChoreography(time: number, progress: number) {
  const elapsed = Number.isFinite(time) ? Math.max(0, time) : 0
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  const depth = smooth(.81, .97, p)
  const machine = windowWeight(p, .60, .69, .79, .88)
  const spine = windowWeight(p, .20, .29, .60, .69)
  // Unequal periods (roughly 47–76 seconds) avoid a synchronized light pulse.
  // These multipliers accompany the spatial projection; they do not replace it.
  return {
    time: elapsed, depth, machine,
    keyHue: .47 + depth * .055 + Math.sin(elapsed * .133) * .032,
    rimHue: .57 + spine * .16 + depth * .07 + Math.sin(elapsed * .117 + 1.3) * .055,
    warmHue: .11 + spine * .61 + depth * .04 + Math.sin(elapsed * .083 + 3.4) * .035,
    keyIntensity: .95 + Math.sin(elapsed * .133 + .7) * .14,
    rimIntensity: .90 + Math.sin(elapsed * .117 + 2.3) * .19,
    warmIntensity: .94 + Math.sin(elapsed * .083 + 4.1) * .22,
    cloudStrength: 1 + machine * .18 - depth * .12,
  }
}

/** Linear radiance, evaluated at a fixed world position. No texture or new pass. */
export const lightChoreographyGLSL = /* glsl */ `
  #ifdef AETHER_LIGHT_FILM
    uniform sampler2D uLightFilm;
    uniform float uLightFilmReady;
  #endif
  vec3 aetherLightCloud(vec3 worldPosition, vec3 worldNormal, float time, float depth) {
    // Different depths intersect different parts of the same slowly drifting
    // field. Domain warping interrupts straight, evenly spaced light stripes.
    vec3 q = worldPosition * vec3(.26, .19, .23);
    float warp = sin(q.z * 1.7 + q.y * .51 + time * .063) * .62
      + sin(q.x * .83 - q.z * .47 - time * .047) * .37;
    float a = dot(q, vec3(1., .37, .58)) + warp - time * .14;
    float b = dot(q, vec3(-.54, .62, 1.)) - warp * .65 + time * .091 + 2.1;
    float c = dot(q, vec3(.24, -.68, .75))
      + sin(q.x * 1.13 + q.y * .73) * .48 - time * .073 + 4.3;
    float cyanCloud = smoothstep(.12, .88, .5 + .5 * sin(a));
    float goldCloud = smoothstep(.30, .92, .5 + .5 * sin(b));
    float violetCloud = smoothstep(.22, .90, .5 + .5 * sin(c));
    // A sparse brighter fold passes through broad pools, retaining dark gaps.
    float fold = 1. - smoothstep(.045, .20, abs(sin(a * 1.63 + sin(b) * .62)));
    fold *= smoothstep(.28, .80, .5 + .5 * sin(c + b * .4));
    vec3 n = normalize(worldNormal);
    float coolFacing = .20 + .80 * max(0., dot(n, vec3(-.45, .78, .43)));
    float warmFacing = .18 + .82 * max(0., dot(n, vec3(.65, .39, -.65)));
    vec3 cyan = vec3(.065, .53, .43) * cyanCloud * coolFacing;
    vec3 gold = vec3(.62, .36, .065) * goldCloud * warmFacing;
    vec3 violet = vec3(.30, .10, .53) * violetCloud * (.38 + coolFacing * .62);
    vec3 light = cyan + gold * (1. - cyanCloud * .46) + violet * (1. - goldCloud * .38);
    light += mix(vec3(.12, .43, .36), vec3(.58, .35, .09), goldCloud) * fold * .65;
    #ifdef AETHER_LIGHT_FILM
      // A single small authored film projects onto world XZ, not the viewport.
      // Smooth mirrored coordinates avoid seams where repeat tiles would meet.
      // Readiness swaps uniforms only; the shader variant stays fixed.
      if (uLightFilmReady > .5) {
        vec2 filmUv = .5 + .5 * sin(worldPosition.xz * vec2(.115, .13)
          + vec2(.8, 2.3) + worldPosition.y * .018);
        vec3 filmSrgb = texture2D(uLightFilm, filmUv).rgb;
        vec3 filmLinear = mix(filmSrgb / 12.92,
          pow((filmSrgb + .055) / 1.055, vec3(2.4)), step(vec3(.04045), filmSrgb));
        float filmLuminance = dot(filmLinear, vec3(.2126, .7152, .0722));
        light = light * (.68 + filmLuminance * .55)
          + filmLinear * .50 * (.45 + coolFacing * .55);
      }
    #endif
    return light * mix(1., .84, clamp(depth, 0., 1.));
  }
`
