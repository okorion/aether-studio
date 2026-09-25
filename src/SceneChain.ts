import * as THREE from 'three'

const TAU = Math.PI * 2
// The upper terminal remains visible; the lower terminal stays below the
// viewport, including the entry and the wider mobile camera.
export const getChainLinkCount = (mobile: boolean) => mobile ? 52 : 40
export const CHAIN_LINK_PITCH = .43

/** Rounded, straight-sided forged links; Y is the direction of the chain. */
class LinkCurve extends THREE.Curve<THREE.Vector3> {
  constructor() { super() }
  getPoint(t: number, target = new THREE.Vector3()) {
    const arc = Math.PI * .15
    const distance = t * (TAU * .15 + .52)
    if (distance < arc) {
      const angle = distance / .15
      return target.set(Math.cos(angle) * .15, .13 + Math.sin(angle) * .15, 0)
    }
    if (distance < arc + .26) return target.set(-.15, .13 - (distance - arc), 0)
    if (distance < arc * 2 + .26) {
      const angle = Math.PI + (distance - arc - .26) / .15
      return target.set(Math.cos(angle) * .15, -.13 + Math.sin(angle) * .15, 0)
    }
    return target.set(.15, -.13 + distance - arc * 2 - .26, 0)
  }
}

export function createChainGeometry(software: boolean, mobile: boolean) {
  return new THREE.TubeGeometry(new LinkCurve(), software ? 32 : mobile ? 48 : 64,
    .057, software ? 6 : mobile ? 8 : 12, true)
}

const CHAIN_RADIUS = 1.85
// About 52 degrees above horizontal. Each unit of descent also travels .777
// around the column, so the strand visibly feeds along its diagonal links.
const CHAIN_TURN_PER_HEIGHT = -.42
// Follow the strand downward: positive X/Z angle winds clockwise from above.
// The column's shared yaw remains independent of this local handedness.
const chainAngleAtHeight = (y: number) => -1.68 + (y - 3.8) * CHAIN_TURN_PER_HEIGHT
const CHAIN_TRACK_HEIGHT = 20
const CHAIN_ARC_PER_HEIGHT = Math.hypot(1, CHAIN_RADIUS * CHAIN_TURN_PER_HEIGHT)

/** Material links feed along one column-attached helix, including camera framing. */
class ColumnChainCurve extends THREE.Curve<THREE.Vector3> {
  private topY: number
  private readonly phase: number
  constructor(topY: number, phase: number) {
    super()
    this.topY = topY
    this.phase = phase
  }

  setTopHeight(height: number) { this.topY = height }

  getPoint(t: number, target = new THREE.Vector3()) {
    const y = this.topY - t * CHAIN_TRACK_HEIGHT
    const angle = chainAngleAtHeight(y) + this.phase
    return target.set(Math.cos(angle) * CHAIN_RADIUS, y, Math.sin(angle) * CHAIN_RADIUS)
  }

  getPointAt(t: number, target = new THREE.Vector3()) { return this.getPoint(t, target) }

  getTangentAt(t: number, target = new THREE.Vector3()) {
    const angle = chainAngleAtHeight(this.topY - t * CHAIN_TRACK_HEIGHT) + this.phase
    return target.set(Math.sin(angle) * CHAIN_RADIUS * CHAIN_TURN_PER_HEIGHT,
      -1, -Math.cos(angle) * CHAIN_RADIUS * CHAIN_TURN_PER_HEIGHT).normalize()
  }

  getLength() { return CHAIN_TRACK_HEIGHT * CHAIN_ARC_PER_HEIGHT }
}

export function sampleChainPath(progress: number, mobile = false) {
  // One monotone Hermite feed avoids the slowdown/reacceleration between two
  // overlapping ramps. Endpoint tangents continue through the scene curtains.
  // Use the scene's already-damped scroll directly, without another lag filter.
  const start = .29, end = .65, duration = end - start
  const t = THREE.MathUtils.clamp((progress - start) / duration, 0, 1)
  const t2 = t * t, t3 = t2 * t
  const top = (2 * t3 - 3 * t2 + 1) * 4.4
    + (t3 - 2 * t2 + t) * -36 * duration
    + (-2 * t3 + 3 * t2) * -1.85
    + (t3 - t2) * -6 * duration
    - 36 * Math.min(0, progress - start) - 6 * Math.max(0, progress - end)
  return new ColumnChainCurve(top + (mobile ? 4.4 * .38 : 0), 0)
}

export function createChainMaterial(software: boolean) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x426ba5, metalness: software ? .72 : 1, roughness: .22,
    envMapIntensity: 1.4, iridescence: software ? 0 : .52,
    iridescenceIOR: 1.38, iridescenceThicknessRange: [160, 540],
    clearcoat: software ? 0 : .2, clearcoatRoughness: .25, transparent: true,
  })
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vChainSurface;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvChainSurface = position;')
    shader.fragmentShader = 'varying vec3 vChainSurface;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float chainWear = .5 + .5 * sin(vChainSurface.y * 27. + sin(vChainSurface.x * 31.))
        * cos(vChainSurface.z * 37. + vChainSurface.x * 19.);
      float chainGrain = sin(dot(vChainSurface, vec3(211., 97., 173.)))
        * cos(dot(vChainSurface, vec3(137., 239., 83.)));
      float chainFilter = 1. - smoothstep(1., 5.,
        max(length(dFdx(vChainSurface)), length(dFdy(vChainSurface))) * 240.);
      roughnessFactor = clamp(roughnessFactor + chainWear * .12
        + chainGrain * chainFilter * .035, .24, .46);
      vec3 chainDx = dFdx(-vViewPosition), chainDy = dFdy(-vViewPosition);
      vec3 chainRx = cross(chainDy, normal), chainRy = cross(normal, chainDx);
      float chainDet = dot(chainDx, chainRx);
      normal = normalize(max(abs(chainDet), .0000001) * normal
        - sign(chainDet) * (dFdx(chainGrain) * chainRx + dFdy(chainGrain) * chainRy)
        * .00018 * chainFilter);
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `
      #include <lights_physical_fragment>
      #ifdef USE_IRIDESCENCE
        material.iridescenceThickness = mix(iridescenceThicknessMinimum,
          iridescenceThicknessMaximum, chainWear);
      #endif
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 chainR = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);
      vec3 coat = vec3(.16,.46,1.0) * pow(max(0.,dot(chainR,normalize(vec3(.7,.2,.6)))),3.)
        + vec3(.40,.28,.70) * pow(max(0.,dot(chainR,normalize(vec3(-.6,.6,.5)))),3.)
        + vec3(.24,.38,.64) * pow(max(0.,dot(chainR,normalize(vec3(-.7,-.2,-.7)))),4.)
        + vec3(.17,.65,.51) * pow(max(0.,dot(chainR,normalize(vec3(.4,.6,-.6)))),4.);
      float peak=max(outgoingLight.r,max(outgoingLight.g,outgoingLight.b));
      outgoingLight=outgoingLight/(1.+peak*.15) + coat*(.26+chainWear*.16);
      #include <opaque_fragment>
    `)
  }
  material.customProgramCacheKey = () => 'aether-forged-chain-v2'
  return material
}
