import * as THREE from 'three'

export type SurfaceFlowInput = { flowTexture?: THREE.Texture; aspect: number }

/** Shared RG velocity / B density contract. Neutral bytes have no UV offset. */
export const surfaceFlowGLSL = /* glsl */ `
  uniform sampler2D uSurfaceFlow;
  uniform vec2 uFlowTexel;
  uniform float uFlowAspect;
  vec2 surfaceDisplacement(vec2 uv) {
    vec3 field = texture2D(uSurfaceFlow, uv).rgb;
    vec2 velocity = (field.rg - vec2(128. / 255.)) * (255. / 127.);
    vec2 gradient = vec2(
      texture2D(uSurfaceFlow, uv + vec2(uFlowTexel.x, 0.)).b
        - texture2D(uSurfaceFlow, uv - vec2(uFlowTexel.x, 0.)).b,
      texture2D(uSurfaceFlow, uv + vec2(0., uFlowTexel.y)).b
        - texture2D(uSurfaceFlow, uv - vec2(0., uFlowTexel.y)).b);
    vec2 offset = velocity * .065 + gradient * .018;
    offset *= min(1., .035 / max(length(offset), .00001));
    return offset / vec2(max(uFlowAspect, .25), 1.);
  }
`

export function createSurfaceFlowUniforms() {
  const neutral = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1)
  neutral.needsUpdate = true
  const uniforms = {
    uSurfaceFlow: { value: neutral as THREE.Texture },
    uFlowTexel: { value: new THREE.Vector2(1 / 64, 1 / 40) },
    uFlowAspect: { value: 1 },
  }
  return {
    uniforms,
    update(input?: SurfaceFlowInput) {
      uniforms.uSurfaceFlow.value = input?.flowTexture ?? neutral
      uniforms.uFlowAspect.value = input?.aspect ?? 1
      const size = input?.flowTexture?.image as { width?: number; height?: number } | undefined
      uniforms.uFlowTexel.value.set(1 / (size?.width || 64), 1 / (size?.height || 40))
    },
    dispose() { neutral.dispose() },
  }
}
