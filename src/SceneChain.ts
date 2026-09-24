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
    .047, software ? 6 : mobile ? 8 : 10, true)
}

const CHAIN_RADIUS = 1.85
// About 52 degrees above horizontal. Each unit of descent also travels .777
// around the column, so the strand visibly feeds along its diagonal links.
const CHAIN_TURN_PER_HEIGHT = .42
// Descending links turn in the same direction as the common parent yaw.
// The opposite winding cancelled part of that rotation and read as a drop.
const chainAngleAtHeight = (y: number) => -1.68 + (y - 3.8) * CHAIN_TURN_PER_HEIGHT
const CHAIN_TRACK_HEIGHT = 20
const CHAIN_ARC_PER_HEIGHT = Math.hypot(1, CHAIN_RADIUS * CHAIN_TURN_PER_HEIGHT)

/** A finite interval travelling on one fixed column-local helix. */
class ColumnChainCurve extends THREE.Curve<THREE.Vector3> {
  private readonly topY: number
  constructor(topY: number) {
    super()
    this.topY = topY
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const y = this.topY - t * CHAIN_TRACK_HEIGHT
    // Absolute local height anchors the winding to the column. Advancing the
    // strand moves each link along this track, not sideways off the track.
    const angle = chainAngleAtHeight(y)
    return target.set(Math.cos(angle) * CHAIN_RADIUS, y, Math.sin(angle) * CHAIN_RADIUS)
  }

  getPointAt(t: number, target = new THREE.Vector3()) { return this.getPoint(t, target) }

  getTangentAt(t: number, target = new THREE.Vector3()) {
    const angle = chainAngleAtHeight(this.topY - t * CHAIN_TRACK_HEIGHT)
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
  return new ColumnChainCurve(top * (mobile ? 1.38 : 1))
}

export function createChainMaterial(software: boolean) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x526b9b, metalness: software ? .72 : 1, roughness: .29,
    envMapIntensity: 1.35, iridescence: software ? 0 : .9,
    iridescenceIOR: 1.38, iridescenceThicknessRange: [240, 430],
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
  }
  material.customProgramCacheKey = () => 'aether-forged-chain-v1'
  return material
}
