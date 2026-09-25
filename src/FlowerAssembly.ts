import { MathUtils } from 'three'

export const FLOWER_WORLD_Y = -29.8

/** Upper heads fill as the descending camera reaches them; lower heads empty. */
export function sampleFlowerAssembly(cameraY: number, localY: number, seed: number) {
  const distance = cameraY - (FLOWER_WORLD_Y + localY)
  const shift = (seed - .5) * .65
  return localY >= 0
    ? 1 - MathUtils.smoothstep(distance, 1 + shift, 8 + shift)
    : MathUtils.smoothstep(distance, -1 + shift, 5 + shift)
}

export const flowerAssemblyGLSL = /* glsl */ `
  float flowerAssembly(float cameraY, float localY, float seed) {
    float distance = cameraY - (${FLOWER_WORLD_Y.toFixed(1)} + localY);
    float shift = (seed - .5) * .65;
    return localY >= 0.
      ? 1. - smoothstep(1. + shift, 8. + shift, distance)
      : smoothstep(-1. + shift, 5. + shift, distance);
  }
`
