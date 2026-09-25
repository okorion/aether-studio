import * as THREE from 'three'
import { sampleJourney } from './Journey'
import type { createForestGeometry } from './ForestGeometry'
import { FOREST_FLOOR_Y } from './ForestGeometry'

/** Absolute scroll poses, shared by both directions of travel. */
export function sampleForestAssembly(progress: number, lower: boolean) {
  const start = sampleJourney(lower ? 1 : .008).height
  const end = sampleJourney(lower ? .935 : .073).height
  return THREE.MathUtils.clamp((sampleJourney(progress).height - start) / (end - start), 0, 1)
}

export function sampleForestArrival(assembly: number, heightPhase: number) {
  return THREE.MathUtils.smoothstep(assembly, heightPhase * .68, heightPhase * .68 + .32)
}

export function createForestParticles(assets: ReturnType<typeof createForestGeometry>, count: number) {
  const barkCount = Math.floor(count * .34)
  const total = count + barkCount
  const positions = new Float32Array(total * 3), origins = new Float32Array(total * 3)
  const seeds = new Float32Array(total * 3), sizes = new Float32Array(total)
  const assemblyPhases = new Float32Array(total)
  let state = 0x51a745
  const random = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296)
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3()
  const areas: number[] = []
  let area = 0
  for (let i = 0; i < assets.barkMatrices.length; i += 16) {
    const m = assets.barkMatrices
    area += Math.hypot(m[i], m[i + 1], m[i + 2]) * Math.hypot(m[i + 4], m[i + 5], m[i + 6])
    areas.push(area)
  }
  let branch = 0
  for (let i = 0; i < total; i++) {
    if (i < count) {
      const start = i * 16
      point.fromArray(assets.leafMatrices, start + 12)
      sizes[i] = .038 + random() ** 3 * .055
      seeds.set(assets.leafColors.subarray(i * 3, i * 3 + 3), i * 3)
    } else {
      // Stratified surface-area sampling keeps fine forks connected and fills
      // thick trunks without retaining an opaque cylinder underneath them.
      const target = (i - count + .5) / barkCount * area
      while (branch < areas.length - 1 && areas[branch] < target) branch++
      matrix.fromArray(assets.barkMatrices, branch * 16)
      const angle = random() * Math.PI * 2, y = random() - .5
      const radius = .87 - y * .26
      point.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius).applyMatrix4(matrix)
      sizes[i] = .032 + random() * .024
      seeds.set([.32 + random() * .45, random(), .64 + random() * .36], i * 3)
    }
    point.y = FOREST_FLOOR_Y + (point.y - FOREST_FLOOR_Y) * .25
    point.toArray(positions, i * 3)
    const seed = random(), angle = random() * Math.PI * 2
    // Each moving seed waits close to its own shortened branch.
    const local = seed < .82
    const radius = .06 + random() ** 1.7 * (local ? .38 : .75)
    const lift = local ? .18 + (seed / .82) ** 1.6 * .70 : .9 + ((seed - .82) / .18) * .45
    // Higher branches settle first as the camera descends; narrow overlapping
    // height bands replace a scene-wide simultaneous interpolation.
    assemblyPhases[i] = THREE.MathUtils.clamp(1 - (point.y - FOREST_FLOOR_Y) / 7 + (seed - .5) * .12, 0, 1)
    origins.set([point.x + Math.cos(angle) * radius, point.y + lift,
      point.z + Math.sin(angle) * radius], i * 3)
    // A standing forest is already legible on entry. The remaining population
    // descends into these same branches; reversing scroll removes only that fill.
    if (random() < (i < count ? .66 : .77)) point.toArray(origins, i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aAssemblyPhase', new THREE.BufferAttribute(assemblyPhases, 1))
  return { geometry, barkCount, total }
}
