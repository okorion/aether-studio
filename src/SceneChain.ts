import * as THREE from 'three'
import { smooth } from './Journey'

const TAU = Math.PI * 2
export const CHAIN_LINK_COUNT = 42
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
// About 63 degrees above horizontal: a steep wrap, not a shallow coil.
const CHAIN_TURN_PER_HEIGHT = .28
const CHAIN_TRACK_HEIGHT = 20
const CHAIN_ARC_PER_HEIGHT = Math.hypot(1, CHAIN_RADIUS * CHAIN_TURN_PER_HEIGHT)

/** A finite interval travelling on one fixed column-local helix. */
class ColumnChainCurve extends THREE.Curve<THREE.Vector3> {
  private readonly endY: number
  constructor(endY: number) {
    super()
    this.endY = endY
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const y = this.endY + t * CHAIN_TRACK_HEIGHT
    // Absolute local height anchors the winding to the column. Advancing the
    // strand moves each link along this track, not sideways off the track.
    const angle = -.7 - y * CHAIN_TURN_PER_HEIGHT
    return target.set(Math.cos(angle) * CHAIN_RADIUS, y, Math.sin(angle) * CHAIN_RADIUS)
  }

  getPointAt(t: number, target = new THREE.Vector3()) { return this.getPoint(t, target) }

  getTangentAt(t: number, target = new THREE.Vector3()) {
    const angle = -.7 - (this.endY + t * CHAIN_TRACK_HEIGHT) * CHAIN_TURN_PER_HEIGHT
    return target.set(Math.sin(angle) * CHAIN_RADIUS * CHAIN_TURN_PER_HEIGHT,
      1, -Math.cos(angle) * CHAIN_RADIUS * CHAIN_TURN_PER_HEIGHT).normalize()
  }

  getLength() { return CHAIN_TRACK_HEIGHT * CHAIN_ARC_PER_HEIGHT }
}

export function sampleChainPath(progress: number) {
  // The complete strand feeds down the helix; neither endpoint wraps or scales.
  // Its common parent still supplies the column's world rotation and descent.
  // Start higher so the faster feed still leaves the complete free end in view.
  return new ColumnChainCurve(1.65 - smooth(.27, .65, progress) * 4.4)
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
