import * as THREE from 'three'
import { sampleJourney, smooth } from './Journey'

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

/** A finite strand, measured from its free lower end. No link ever wraps. */
export function sampleChainPath(progress: number) {
  const descent = smooth(.27, .65, progress)
  const yaw = sampleJourney(progress).structureYaw
  const endY = -2.5 - descent * .45
  // With x = cos(a), z = sin(a), a Y rotation subtracts its yaw.
  // Let the free end hang below the foreground screens, then drift to the
  // open left side as the last screen descends. It remains in front of the bone.
  const endAngle = 1.5 + smooth(.50, .60, progress) * .6 + yaw
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 80; i++) {
    const height = i * .25
    const coil = Math.max(0, height - 1.5)
    const angle = endAngle - coil * .48 * smooth(0, 2.5, coil)
    const radius = 2.08 - smooth(0, 3, height) * .38
    points.push(new THREE.Vector3(Math.cos(angle) * radius,
      endY + height, Math.sin(angle) * radius))
  }
  return new THREE.CatmullRomCurve3(points)
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
