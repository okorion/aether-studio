import * as THREE from 'three'

export type SurfaceFlowInput = { flowTexture?: THREE.Texture; waterTexture?: THREE.Texture; hazeTexture?: THREE.Texture; aspect: number }

/** RG velocity, B water height, inverse A stationary dry contact. */
export const surfaceFlowGLSL = /* glsl */ `
  uniform sampler2D uSurfaceFlow;
  uniform vec2 uFlowTexel;
  uniform float uFlowAspect;
  // Explicit bilinear filtering also supports devices without float-linear.
  vec4 surfaceSample(vec2 uv) {
    vec2 p = uv / uFlowTexel - .5, f = fract(p);
    vec2 a = (floor(p) + .5) * uFlowTexel;
    return mix(mix(texture2D(uSurfaceFlow, a), texture2D(uSurfaceFlow, a + vec2(uFlowTexel.x, 0.)), f.x),
      mix(texture2D(uSurfaceFlow, a + vec2(0., uFlowTexel.y)), texture2D(uSurfaceFlow, a + uFlowTexel), f.x), f.y);
  }
  vec2 surfaceDisplacement(vec2 uv) {
    vec3 field = surfaceSample(uv).rgb;
    vec2 velocity = (field.rg - vec2(128. / 255.)) * (255. / 127.);
    vec2 gradient = vec2(
      surfaceSample(uv + vec2(uFlowTexel.x, 0.)).b
        - surfaceSample(uv - vec2(uFlowTexel.x, 0.)).b,
      surfaceSample(uv + vec2(0., uFlowTexel.y)).b
        - surfaceSample(uv - vec2(0., uFlowTexel.y)).b);
    vec2 offset = velocity * .065 + gradient * .018;
    offset *= min(1., .035 / max(length(offset), .00001));
    return offset / vec2(max(uFlowAspect, .25), 1.);
  }
  // A shallow film refracts through a continuous height gradient around the
  // dry contact, without adding an oscillating spatial or temporal carrier.
  vec3 surfaceWater(vec2 uv) {
    vec4 field = surfaceSample(uv);
    vec2 slope = vec2(
      surfaceSample(uv + vec2(uFlowTexel.x, 0.)).b - surfaceSample(uv - vec2(uFlowTexel.x, 0.)).b,
      surfaceSample(uv + vec2(0., uFlowTexel.y)).b - surfaceSample(uv - vec2(0., uFlowTexel.y)).b);
    float wet = 1. - smoothstep(.055, .28, 1. - field.a);
    vec2 normal = slope * wet;
    return vec3(normal, field.b);
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
    update(input?: SurfaceFlowInput, texture = input?.waterTexture ?? input?.flowTexture) {
      uniforms.uSurfaceFlow.value = texture ?? neutral
      uniforms.uFlowAspect.value = input?.aspect ?? 1
      const size = texture?.image as { width?: number; height?: number } | undefined
      uniforms.uFlowTexel.value.set(1 / (size?.width || 64), 1 / (size?.height || 40))
    },
    dispose() { neutral.dispose() },
  }
}
