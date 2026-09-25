import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { sampleJourney } from '../src/Journey'
import { createSpineAssembly } from '../src/SceneSpine'
import { createAtmosphere } from '../src/Atmosphere'
import { createSceneForest } from '../src/SceneForest'

// No page or browser fixture: these inspect the production scene objects and
// camera projections on the CPU. Shader pixels remain part of visual GPU QA.
test('@interaction lower descent restores orbit continuously after the locked gallery', () => {
  for (const p of [.24, .34, .64, .76, .85, .86]) {
    expect(sampleJourney(p).orbitEnabled).toBe(false)
    expect(sampleJourney(p).orbitWeight).toBe(0)
  }
  let previous = sampleJourney(.86)
  for (let i = 1; i <= 20; i++) {
    const current = sampleJourney(.86 + i * .001)
    expect(current.orbitEnabled).toBe(true)
    expect(current.orbitWeight).toBeGreaterThan(previous.orbitWeight)
    expect(current.orbitWeight - previous.orbitWeight).toBeLessThan(.08)
    expect(current.height).toBeLessThan(previous.height)
    previous = current
  }
  expect(sampleJourney(.88).orbitWeight).toBe(1)
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
    const twists: { y: number; yaw: number }[] = []
    for (let i = 0; i < bones.count; i++) {
      const position = new THREE.Vector3()
      bones.getMatrixAt(i, matrix)
      matrix.decompose(position, quaternion, scale)
      if (scale.length() < .1) continue
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
      twists.push({ y: position.y, yaw: Math.atan2(facing.x, facing.z) })
    }
    twists.sort((a, b) => a.y - b.y)
    // Each successive vertebra turns gradually along the column, independently
    // of the parent assembly's scroll-driven rotation.
    let totalTurn = 0
    for (let i = 1; i < twists.length; i++) {
      const difference = twists[i].yaw - twists[i - 1].yaw
      const turn = Math.atan2(Math.sin(difference), Math.cos(difference))
      totalTurn += turn
      expect(turn).toBeGreaterThan(.40)
      expect(turn).toBeLessThan(.50)
    }
    expect(totalTurn).toBeGreaterThan(3.1)
    expect(totalTurn).toBeLessThan(4.6)
    // Inspect the whole finite strand. Its lower end hangs freely; dividing
    // these links in half would invent two chains that no longer exist.
    const centres: THREE.Vector3[] = []
    for (let i = 0; i < chains.count; i++) {
      const position = new THREE.Vector3()
      chains.getMatrixAt(i, matrix)
      matrix.decompose(position, quaternion, scale)
      centres.push(position)
    }
    expect(Math.max(...centres.map(p => p.z))).toBeGreaterThan(boneAxis.max.z + .5)
    expect(Math.min(...centres.map(p => p.z))).toBeLessThan(boneAxis.min.z - .5)
    expect(new Set(centres.map(p => `${Math.sign(p.x)},${Math.sign(p.z)}`)).size).toBeGreaterThanOrEqual(2)
    let turn = 0
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i].y).toBeLessThan(centres[i - 1].y)
      const delta = Math.atan2(centres[i].z, centres[i].x) - Math.atan2(centres[i - 1].z, centres[i - 1].x)
      turn += Math.atan2(Math.sin(delta), Math.cos(delta))
    }
    // The shorter strand wraps across the front and back without making a
    // complete coil; its upper terminal now leads the visible stage length.
    expect(Math.abs(turn)).toBeGreaterThan(2)
    expect(Math.abs(turn)).toBeLessThan(Math.PI * 2)
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
    const baseCount = particles.userData.baseCount as number
    const movingFraction = roles.slice(0, baseCount).filter(role => role === 1).length / baseCount
    expect(movingFraction).toBeGreaterThan(.18)
    expect(movingFraction).toBeLessThanOrEqual(.2)
    expect(roles.length).toBeGreaterThan(baseCount)
    for (let i = baseCount; i < roles.length; i++) {
      expect(roles[i]).toBe(0)
      expect(bokeh.getW(i)).toBe(-1)
      expect((bokeh.getX(i) * 7.13) % 1).toBeLessThan(.22)
    }
    for (let i = 0; i < roles.length; i++) if (bokeh.getW(i) > .5) expect(roles[i]).toBe(0)
    atmosphere.update(10, .4, 1, pointer)
    expect(particles.geometry.drawRange.count).toBe(baseCount)
    const flowers = scene.getObjectByName('aether-flower-petal-surfaces') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
    expect(flowers.visible).toBe(true)
    expect(flowers.geometry.index!.count).toBeGreaterThan(roles.length - baseCount)
    expect(flowers.material.depthWrite).toBe(true)
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
    expect(flowers.visible).toBe(false)
    expect(particles.geometry.drawRange.count).toBe(baseCount)
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
      const branches = groves[index].getObjectByName('aether-forest-microfoliage') as THREE.Points
      const beforeWorld = branches.matrixWorld.toArray()
      const beforeInstances = Array.from(branches.geometry.getAttribute('position').array)
      const points = Array.from({ length: Math.min(80, branches.geometry.getAttribute('position').count) }, (_, i) => {
        return new THREE.Vector3().fromBufferAttribute(branches.geometry.getAttribute('position'), i).applyMatrix4(branches.matrixWorld)
      })
      const initialProjection = points.map(point => point.clone().project(camera))
      const initialCamera = camera.position.clone()
      camera.position.copy(focus).add(new THREE.Vector3(Math.sin(.7) * 12, 0, Math.cos(.7) * 12))
      camera.lookAt(focus)
      camera.updateMatrixWorld()
      forest.update(4, p, camera, { ndc: new THREE.Vector2(.4, .2), strength: 1, aspect: 1.6 }, 1.5)
      scene.updateMatrixWorld(true)
      expect(branches.matrixWorld.toArray()).toEqual(beforeWorld)
      expect(Array.from(branches.geometry.getAttribute('position').array)).toEqual(beforeInstances)
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
