import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { sampleJourney } from '../src/Journey'
import { createSpineAssembly } from '../src/SceneSpine'
import { createAtmosphere } from '../src/Atmosphere'
import { createSceneForest } from '../src/SceneForest'

// No page or browser fixture: these inspect the production scene objects and
// camera projections on the CPU. Shader pixels remain part of visual GPU QA.
test('@interaction lower descent restores orbit continuously after the locked gallery', () => {
  for (const p of [.24, .34, .64, .76, .90, .94]) {
    expect(sampleJourney(p).orbitEnabled).toBe(false)
    expect(sampleJourney(p).orbitWeight).toBe(0)
  }
  let previous = sampleJourney(.94)
  for (let i = 1; i <= 35; i++) {
    const current = sampleJourney(.94 + i * .001)
    expect(current.orbitEnabled).toBe(true)
    expect(current.orbitWeight).toBeGreaterThan(previous.orbitWeight)
    expect(current.orbitWeight - previous.orbitWeight).toBeLessThan(.05)
    expect(current.height).toBeLessThan(previous.height)
    previous = current
  }
  expect(sampleJourney(.975).orbitWeight).toBe(1)
  expect(sampleJourney(1).orbitWeight).toBe(1)
})

test('@interaction spine links wrap in front and behind the bones and reverse without drift', () => {
  const assembly = createSpineAssembly(true, false)
  const bones = assembly.group.getObjectByName('aether-spine-vertebrae') as THREE.InstancedMesh
  const chains = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
  const snapshot = () => ({
    bones: Array.from(bones.instanceMatrix.array),
    chains: Array.from(chains.instanceMatrix.array),
  })
  try {
    assembly.update(.4, 1, 1)
    assembly.group.updateMatrixWorld(true)
    const initial = snapshot()
    for (let i = 0; i < 120; i++) assembly.update(.4, 1, 1)
    expect(snapshot()).toEqual(initial)
    assembly.update(.425, 1, 1)
    expect(snapshot().chains).not.toEqual(initial.chains)
    expect(snapshot().bones).not.toEqual(initial.bones)
    assembly.update(.4, 1, 1)
    expect(snapshot()).toEqual(initial)

    const matrix = new THREE.Matrix4()
    const boneAxis = new THREE.Box3()
    for (let i = 0; i < bones.count; i++) {
      bones.getMatrixAt(i, matrix)
      boneAxis.expandByPoint(new THREE.Vector3().setFromMatrixPosition(matrix))
    }
    const scale = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    // Check each actual strand independently; parallel hanging chains fail
    // even if one is placed in front and the other behind the whole spine.
    for (let strand = 0; strand < 2; strand++) {
      const centres: THREE.Vector3[] = []
      for (let i = strand * chains.count / 2; i < (strand + 1) * chains.count / 2; i++) {
        const position = new THREE.Vector3()
        chains.getMatrixAt(i, matrix)
        matrix.decompose(position, quaternion, scale)
        if (scale.length() > .1) centres.push(position)
      }
      expect(Math.max(...centres.map(p => p.z))).toBeGreaterThan(boneAxis.max.z + .5)
      expect(Math.min(...centres.map(p => p.z))).toBeLessThan(boneAxis.min.z - .5)
      expect(new Set(centres.map(p => `${Math.sign(p.x)},${Math.sign(p.z)}`)).size).toBe(4)
      centres.sort((a, b) => a.y - b.y)
      let turn = 0
      for (let i = 1; i < centres.length; i++) {
        const delta = Math.atan2(centres[i].z, centres[i].x) - Math.atan2(centres[i - 1].z, centres[i - 1].x)
        turn += Math.atan2(Math.sin(delta), Math.cos(delta))
      }
      expect(Math.abs(turn)).toBeGreaterThan(Math.PI * 2)
    }
    assembly.update(.4, 0, 1)
    expect(assembly.group.visible).toBe(false)
  } finally {
    assembly.dispose()
  }
})

test('@interaction particle flow keeps anchors separate and stops its scroll driver at rest', () => {
  const scene = new THREE.Scene()
  const atmosphere = createAtmosphere(scene, true, false)
  const particles = scene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const uniforms = particles.material.uniforms
  const pointer = { ndc: new THREE.Vector2(.2, -.1), strength: 1, aspect: 1.6 }
  const seeds = Array.from(particles.geometry.getAttribute('position').array)
  const roles = Array.from(particles.geometry.getAttribute('aAdvected').array)
  const bokeh = particles.geometry.getAttribute('aDust')
  const current = () => ({
    phase: uniforms.uScroll.value as number,
    step: uniforms.uScrollStep.value as number,
    weights: (uniforms.uWeights.value as THREE.Vector4).toArray(),
    y: particles.getWorldPosition(new THREE.Vector3()).y,
  })
  try {
    expect(roles.some(role => role === 0)).toBe(true)
    expect(roles.some(role => role === 1)).toBe(true)
    expect(roles.every(role => role === 0 || role === 1)).toBe(true)
    for (let i = 0; i < roles.length; i++) if (bokeh.getW(i) > .5) expect(roles[i]).toBe(0)
    atmosphere.update(10, .4, 1, pointer)
    const initial = current()
    atmosphere.update(40, .4, 1, pointer)
    expect(current()).toEqual(initial)
    expect(uniforms.uTime.value).toBe(40)
    atmosphere.update(41, .41, 1, pointer)
    expect(current().step).toBeGreaterThan(0)
    atmosphere.update(42, .4, 1, pointer)
    expect(current().step).toBeLessThan(0)
    atmosphere.update(43, .4, 1, pointer)
    expect(current()).toEqual(initial)
    expect(Array.from(particles.geometry.getAttribute('position').array)).toEqual(seeds)

    // Descent moves the camera; the device's circular particle field has
    // already reached one fixed world-space anchor at both of these stops.
    atmosphere.update(44, .70, 1, pointer)
    const device = current()
    atmosphere.update(50, .75, 1, pointer)
    expect(current().y).toBeCloseTo(device.y, 8)
    expect(current().y).toBeCloseTo(-40.4, 8)
    expect(current().weights[1]).toBe(1)
    atmosphere.update(60, .75, 1, pointer)
    expect(current().step).toBe(0)
  } finally {
    atmosphere.dispose()
  }
  expect(scene.children).toHaveLength(0)
})

test('@interaction forest anchors stay in the world while orbit changes their projection', () => {
  const scene = new THREE.Scene()
  const forest = createSceneForest(scene, true, false)
  const group = scene.getObjectByName('aether-forest')!
  const groves = ['aether-forest-upper', 'aether-forest-lower'].map(name => scene.getObjectByName(name)!)
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 90)
  const matrix = new THREE.Matrix4()
  try {
    for (const [index, p] of [0, .98].entries()) {
      const focus = new THREE.Vector3(0, sampleJourney(p).height, 0)
      camera.position.copy(focus).add(new THREE.Vector3(0, 0, 12))
      camera.lookAt(focus)
      camera.updateMatrixWorld()
      forest.update(1, p, camera, undefined, 1)
      scene.updateMatrixWorld(true)
      expect(group.visible).toBe(true)
      expect(groves[index].visible).toBe(true)
      expect(groves[1 - index].visible).toBe(false)
      const branches = groves[index].getObjectByName('aether-forest-branches-roots') as THREE.InstancedMesh
      const beforeWorld = branches.matrixWorld.toArray()
      const beforeInstances = Array.from(branches.instanceMatrix.array)
      const points = Array.from({ length: Math.min(80, branches.count) }, (_, i) => {
        branches.getMatrixAt(i, matrix)
        return new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(branches.matrixWorld)
      })
      const initialProjection = points.map(point => point.clone().project(camera))
      const initialCamera = camera.position.clone()
      camera.position.copy(focus).add(new THREE.Vector3(Math.sin(.7) * 12, 0, Math.cos(.7) * 12))
      camera.lookAt(focus)
      camera.updateMatrixWorld()
      forest.update(4, p, camera, { ndc: new THREE.Vector2(.4, .2), strength: 1, aspect: 1.6 }, 1.5)
      scene.updateMatrixWorld(true)
      expect(branches.matrixWorld.toArray()).toEqual(beforeWorld)
      expect(Array.from(branches.instanceMatrix.array)).toEqual(beforeInstances)
      expect(points.every(point => point.clone().project(camera).toArray().every(Number.isFinite))).toBe(true)
      const motion = points.map((point, i) => point.clone().project(camera).distanceTo(initialProjection[i]))
      expect(Math.max(...motion)).toBeGreaterThan(.05)
      expect(Math.max(...motion) - Math.min(...motion)).toBeGreaterThan(.02)
      camera.position.copy(initialCamera)
      camera.lookAt(focus)
      camera.updateMatrixWorld()
      forest.update(7, p, camera, undefined, 1)
      points.forEach((point, i) => expect(point.clone().project(camera).distanceTo(initialProjection[i])).toBeLessThan(1e-10))
    }
    forest.update(8, .5, camera, undefined, 1)
    expect(group.visible).toBe(false)
  } finally {
    forest.dispose()
  }
  expect(scene.children).toHaveLength(0)
})
