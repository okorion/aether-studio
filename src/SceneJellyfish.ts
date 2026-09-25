import * as THREE from 'three'
import { bindGroupCurtain, createCurtainBounds } from './SceneCurtains'
import { sampleLayers } from './SceneLayers'

const TAU = Math.PI * 2
const RADIUS = .23
const SEGMENTS = 24
const smooth = (value: number) => {
  const x = THREE.MathUtils.clamp(value, 0, 1)
  return x * x * (3 - 2 * x)
}

/** A short power stroke followed by a long, soft refill. Absolute scene time
 * keeps the pose deterministic across pauses, scrolls and context restoration. */
export function sampleJellyStroke(time: number, phase: number, period: number) {
  const cycle = time / period + phase
  const fraction = cycle - Math.floor(cycle)
  const contraction = fraction < .24
    ? smooth(fraction / .24)
    : 1 - smooth((fraction - .24) / .76)
  // Zero net displacement per beat: a bounded current carries the animal,
  // while the power stroke adds a forward surge and a slow settling phase.
  const surge = smooth(fraction / .38) - fraction
  return { contraction, surge }
}

/** Small, independently phased swimmers in the existing forest clearings.
 * Geometry is allocated once; only the short bell/filament buffers change. */
export function createSceneJellyfish(
  scene: THREE.Scene, software: boolean, mobile: boolean, chrome: THREE.Material,
) {
  const group = new THREE.Group()
  group.name = 'aether-forest-creatures'
  scene.add(group)
  const curtain = createCurtainBounds()
  const bellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6b9b9e, metalness: software ? .1 : .65,
    roughness: software ? .6 : .18, transparent: true, opacity: .42,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.7,
    emissive: software ? 0x152927 : 0x000000,
  })
  const lipMaterial = chrome.clone()
  const threadMaterial = new THREE.LineBasicMaterial({
    color: 0x70b8ad, transparent: true, opacity: .27,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const lipGeometry = new THREE.TorusGeometry(RADIUS, .006, 5, 40)
  const anchors = [[3.2, 1.3, -3], [-3.5, -2, -2], [5.5, -3.8, -5], [-4.4, 3.1, -8]]
  const perForest = software ? 1 : mobile ? 2 : 4
  const creatures = Array.from({ length: perForest * 2 }, (_, index) => {
    const root = new THREE.Group()
    root.name = `aether-bell-creature-${index}`
    const anchor = new THREE.Vector3(...anchors[index % perForest])
    if (index >= perForest) anchor.y -= 61.5
    root.scale.setScalar(index % perForest === 0 ? 1 : .7 + (index * .137) % .4)
    const geometry = new THREE.SphereGeometry(RADIUS, software ? 16 : 24, 12, 0, TAU, 0, Math.PI / 2)
    const bellPositions = geometry.attributes.position as THREE.BufferAttribute
    const rest = Float32Array.from(bellPositions.array)
    bellPositions.setUsage(THREE.DynamicDrawUsage)
    // All poses fit this bound; deformation must not pop at a frustum edge.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), .4)
    const bell = new THREE.Mesh(geometry, bellMaterial)
    bell.name = 'bell'
    const lip = new THREE.Mesh(lipGeometry, lipMaterial)
    lip.name = 'rim'
    lip.rotation.x = Math.PI / 2
    root.add(bell, lip)
    const strands = Array.from({ length: software ? 4 : 8 }, (_, strand) => {
      const theta = strand / (software ? 4 : 8) * TAU
      // Choose length per filament, never per vertex (which creates kinks).
      const length = .68 + .24 * (.5 + .5 * Math.sin(strand * 2.4 + index))
      const geometry = new THREE.BufferGeometry()
      const positions = new THREE.Float32BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3)
      positions.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute('position', positions)
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -.45, 0), .85)
      const line = new THREE.Line(geometry, threadMaterial)
      line.name = `tentacle-${strand}`
      root.add(line)
      return { theta, length, geometry, positions }
    })
    group.add(root)
    return { root, anchor, bell, rest, lip, strands, phase: (index * .381966) % 1, period: 2.7 + (index % 4) * .23 }
  })
  bindGroupCurtain(group, curtain)
  let disposed = false

  function update(time: number, progress: number) {
    if (disposed) return
    const t = Number.isFinite(time) ? Math.max(0, time) : 0
    const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0
    const layers = sampleLayers(p)
    curtain.upper.value = p < .5 ? 1.5 : layers.forestEntry
    curtain.lower.value = p < .5 ? layers.forestExit : -.5
    group.visible = p < .20 || p > .855
    for (const [index, creature] of creatures.entries()) {
      const { root, anchor, phase, period, bell, rest, lip, strands } = creature
      root.visible = (index < perForest) === (p < .5)
      if (!group.visible || !root.visible) continue
      const { contraction, surge } = sampleJellyStroke(t, phase, period)
      const drift = t * .13 + phase * TAU
      const tiltX = Math.sin(drift * .83) * .16
      const tiltZ = Math.cos(drift) * .22
      root.position.set(
        anchor.x + Math.sin(drift) * .55 - Math.sin(tiltZ) * surge * .3,
        anchor.y + Math.sin(drift * .71) * .48 + surge * .38,
        anchor.z + Math.cos(drift * .83) * .38 + Math.sin(tiltX) * surge * .3,
      )
      root.rotation.set(tiltX, Math.sin(drift * .6) * .22, tiltZ)
      const rimRadius = 1 - contraction * .30
      const rimY = -.016 * contraction
      lip.scale.set(rimRadius, rimRadius, 1)
      lip.position.y = rimY
      const positions = bell.geometry.attributes.position as THREE.BufferAttribute
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const offset = vertex * 3
        const height = rest[offset + 1] / RADIUS
        const skirt = 1 - height
        const radial = 1 - contraction * (.12 + .18 * skirt * skirt)
        positions.setXYZ(vertex, rest[offset] * radial,
          rest[offset + 1] * (.64 + contraction * .30) + rimY,
          rest[offset + 2] * radial)
      }
      positions.needsUpdate = true
      bell.geometry.computeVertexNormals()
      for (const strand of strands) {
        for (let vertex = 0; vertex <= SEGMENTS; vertex++) {
          const depth = vertex / SEGMENTS
          const delayed = sampleJellyStroke(t - depth * .48, phase, period).contraction
          const wave = (t / period + phase) * TAU - depth * 4.8 + strand.theta
          const envelope = depth * depth
          const spread = RADIUS * rimRadius + depth * .035 * (1 - delayed)
          // The root is exactly on the animated rim; the wave and current
          // grow toward the free tip, lagging behind each power stroke.
          strand.positions.setXYZ(vertex,
            Math.cos(strand.theta) * spread + envelope * (Math.sin(wave) * .075 - Math.cos(drift) * .13),
            rimY - depth * strand.length * (1 + delayed * .10) + Math.sin(wave) * .022 * envelope,
            Math.sin(strand.theta) * spread + envelope * (Math.cos(wave * .91 + strand.theta) * .07 + Math.sin(drift * .83) * .1),
          )
        }
        strand.positions.needsUpdate = true
      }
    }
  }
  update(0, 0)
  return {
    group, curtain, update,
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      for (const creature of creatures) {
        creature.bell.geometry.dispose()
        creature.strands.forEach(strand => strand.geometry.dispose())
      }
      lipGeometry.dispose()
      bellMaterial.dispose()
      lipMaterial.dispose()
      threadMaterial.dispose()
      group.clear()
    },
  }
}
