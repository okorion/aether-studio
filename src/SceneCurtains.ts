import * as THREE from 'three'

export type CurtainBounds = { upper: { value: number }; lower: { value: number } }

/** A common camera-space edge lets real geometry read as one sliding page. */
export function createCurtainBounds(upper = 1.5, lower = -.5): CurtainBounds {
  return { upper: { value: upper }, lower: { value: lower } }
}

export const curtainGLSL = /* glsl */ `
  uniform float uCurtainUpper;
  uniform float uCurtainLower;
  varying vec4 vCurtainClip;
  float curtainMask() {
    vec2 screen = vCurtainClip.xy / vCurtainClip.w * .5 + .5;
    float grain = fract(sin(dot(floor(screen * vec2(1800.,1100.)),vec2(12.9898,78.233))) * 43758.5453);
    float edge = screen.y - (screen.x - .5) * .20 + (grain - .5) * .009;
    return (1. - smoothstep(uCurtainUpper - .006, uCurtainUpper + .006, edge))
      * smoothstep(uCurtainLower - .006, uCurtainLower + .006, edge);
  }
`

/** Extend existing shader hooks without cloning materials or adding a pass. */
export function bindCurtain(material: THREE.Material, bounds: CurtainBounds) {
  const previous = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.uniforms.uCurtainUpper = bounds.upper
    shader.uniforms.uCurtainLower = bounds.lower
    shader.vertexShader = 'varying vec4 vCurtainClip;\n' + shader.vertexShader
    if (shader.vertexShader.includes('#include <project_vertex>')) {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvCurtainClip = gl_Position;')
    } else {
      const end = shader.vertexShader.lastIndexOf('}')
      shader.vertexShader = shader.vertexShader.slice(0, end) + '\nvCurtainClip = gl_Position;\n' + shader.vertexShader.slice(end)
    }
    shader.fragmentShader = curtainGLSL + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,
      `void main() {
        float screenCurtain = curtainMask();
        if (screenCurtain < .003) discard;
      `)
    // Discarding before the material writes depth is essential at the seam.
    // A small stochastic fringe avoids a hard ruler edge on metal surfaces.
    shader.fragmentShader = shader.fragmentShader.replace('if (screenCurtain < .003) discard;',
      'if (screenCurtain < .003 || screenCurtain < fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233))) * 43758.5453)) discard;')
  }
  material.customProgramCacheKey = () => `${previousKey}-spatial-curtain-v1`
  material.needsUpdate = true
}

export function bindGroupCurtain(group: THREE.Object3D, bounds: CurtainBounds) {
  const bound = new Set<THREE.Material>()
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (bound.has(material)) continue
      bound.add(material)
      bindCurtain(material, bounds)
    }
  })
}
