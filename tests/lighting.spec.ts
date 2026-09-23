import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createLightFilmUniforms, sampleLightChoreography } from '../src/SceneLighting'
import { createSceneForest } from '../src/SceneForest'

test('@interaction light choreography stays bounded, evolves slowly, and freezes with scene time', () => {
  const channels = ['keyHue', 'rimHue', 'warmHue', 'keyIntensity', 'rimIntensity', 'warmIntensity', 'cloudStrength'] as const
  for (const progress of [0, .4, .72, .98]) {
    for (const time of [0, 4, 19, 40, 87, 3600]) {
      const value = sampleLightChoreography(time, progress)
      expect(Object.values(value).every(Number.isFinite)).toBe(true)
      for (const hue of ['keyHue', 'rimHue', 'warmHue'] as const) {
        expect(value[hue]).toBeGreaterThanOrEqual(0)
        expect(value[hue]).toBeLessThanOrEqual(1)
      }
      for (const intensity of ['keyIntensity', 'rimIntensity', 'warmIntensity'] as const) {
        expect(value[intensity]).toBeGreaterThan(.65)
        expect(value[intensity]).toBeLessThan(1.2)
      }
      const next = sampleLightChoreography(time + 1 / 60, progress)
      for (const channel of channels) expect(Math.abs(value[channel] - next[channel])).toBeLessThan(.002)
      expect(sampleLightChoreography(time, progress)).toEqual(value)
    }
    const before = sampleLightChoreography(4, progress)
    const after = sampleLightChoreography(24, progress)
    expect(Math.abs(before.keyIntensity - after.keyIntensity)
      + Math.abs(before.rimIntensity - after.rimIntensity)
      + Math.abs(before.warmIntensity - after.warmIntensity)).toBeGreaterThan(.2)
  }
  const safe = sampleLightChoreography(0, 0)
  for (const invalid of [NaN, Infinity, -Infinity, -3])
    expect(sampleLightChoreography(invalid, invalid)).toEqual(safe)
})

test('@interaction projected forest light preserves geometry and is independent of pointer input', () => {
  const scene = new THREE.Scene()
  const forest = createSceneForest(scene, true, false)
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 90)
  camera.position.set(0, -61.5, 12)
  camera.lookAt(0, -61.5, 0)
  camera.updateMatrixWorld()
  const group = scene.getObjectByName('aether-forest')!
  const bark = scene.getObjectByName('aether-forest-lower')!
    .getObjectByName('aether-forest-branches-roots') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  const uniforms = bark.material.uniforms
  const lighting = () => ({
    time: uniforms.uTime.value as number,
    depth: uniforms.uLightDepth.value as number,
    strength: uniforms.uLightStrength.value as number,
  })
  try {
    forest.update(18, .98, camera, undefined, 1)
    scene.updateMatrixWorld(true)
    const paused = lighting()
    const worldMatrix = bark.matrixWorld.toArray()
    const instances = Array.from(bark.instanceMatrix.array)
    for (let i = 0; i < 20; i++) forest.update(18, .98, camera, undefined, 1)
    expect(lighting()).toEqual(paused)
    forest.update(18, .98, camera, { ndc: new THREE.Vector2(.3, -.2), strength: 1, aspect: 1.6 }, 1)
    expect(lighting()).toEqual(paused)
    expect(uniforms.uPointerStrength.value).toBe(1)
    forest.update(38, .98, camera, undefined, 1)
    expect(lighting().time).toBe(38)
    expect(lighting().depth).toBe(paused.depth)
    expect(bark.matrixWorld.toArray()).toEqual(worldMatrix)
    expect(Array.from(bark.instanceMatrix.array)).toEqual(instances)
    expect(group.visible).toBe(true)
    const lights: THREE.Object3D[] = []
    scene.traverse(object => { if (object instanceof THREE.Light) lights.push(object) })
    expect(lights).toHaveLength(0)
  } finally { forest.dispose() }
  expect(scene.children).toHaveLength(0)
})

test('@interaction forest shares film updates without owning the external texture or recompiling materials', () => {
  const scene = new THREE.Scene()
  const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  const nextFrame = new THREE.DataTexture(new Uint8Array([32, 170, 150, 255]), 1, 1)
  const film = createLightFilmUniforms(fallback)
  const forest = createSceneForest(scene, true, false, film)
  let externalDisposals = 0
  fallback.addEventListener('dispose', () => { externalDisposals++ })
  nextFrame.addEventListener('dispose', () => { externalDisposals++ })
  const materials = new Set<THREE.ShaderMaterial>()
  scene.traverse(object => {
    if ((object instanceof THREE.Mesh || object instanceof THREE.Points)
      && object.material instanceof THREE.ShaderMaterial) materials.add(object.material)
  })
  const versions = [...materials].map(material => material.version)
  try {
    expect(materials.size).toBeGreaterThan(0)
    for (const material of materials) {
      expect(material.uniforms.uLightFilm).toBe(film.map)
      expect(material.uniforms.uLightFilmReady).toBe(film.ready)
      expect(material.uniforms.uLightFilmReady.value).toBe(0)
    }
    film.map.value = nextFrame
    film.ready.value = 1
    for (const material of materials) {
      expect(material.uniforms.uLightFilm.value).toBe(nextFrame)
      expect(material.uniforms.uLightFilmReady.value).toBe(1)
    }
    expect([...materials].map(material => material.version)).toEqual(versions)
  } finally {
    forest.dispose()
    expect(externalDisposals).toBe(0)
    fallback.dispose()
    nextFrame.dispose()
  }

  const isolatedScene = new THREE.Scene()
  const isolatedForest = createSceneForest(isolatedScene, true, false)
  const bark = isolatedScene.getObjectByName('aether-forest-branches-roots') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  let ownDisposals = 0
  ;(bark.material.uniforms.uLightFilm.value as THREE.Texture).addEventListener('dispose', () => { ownDisposals++ })
  isolatedForest.dispose()
  isolatedForest.dispose()
  expect(ownDisposals).toBe(1)
})

test('@interaction short forest plants stay at both transition shelves and fade outside them', () => {
  const scene = new THREE.Scene()
  const forest = createSceneForest(scene, false, false)
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 90)
  camera.position.set(0, -8, 11)
  camera.lookAt(0, -8, 0)
  const upper = scene.getObjectByName('aether-forest-upper')!
  const lower = scene.getObjectByName('aether-forest-lower')!
  const edge = (grove: THREE.Object3D) =>
    grove.getObjectByName('aether-forest-boundary-plants-motes-mist') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const plants = edge(upper)
  const kinds = plants.geometry.getAttribute('aKind') as THREE.BufferAttribute
  const positions = plants.geometry.getAttribute('position') as THREE.BufferAttribute
  try {
    expect(edge(lower).geometry).toBe(plants.geometry)
    expect(plants.position.y).toBe(-8.7)
    expect(edge(lower).position.y).toBe(6.8)
    expect(kinds.count).toBeGreaterThan(5000)
    expect(Array.from({ length: kinds.count }, (_, i) => kinds.getX(i)).filter(kind => kind === 1).length)
      .toBeGreaterThan(3000)
    expect(Array.from({ length: positions.count }, (_, i) => positions.getY(i))
      .every(value => value > -2 && value < 3)).toBe(true)
    const strength = () => plants.material.uniforms.uBoundaryStrength.value as number
    for (const [p,minimum,maximum] of [[0,0,0],[.15,.99,1],[.2,0,1],
      [.91,.99,1],[1,0,0]] as const) {
      forest.update(2,p,camera,undefined,1)
      expect(strength()).toBeGreaterThanOrEqual(minimum)
      expect(strength()).toBeLessThanOrEqual(maximum)
    }
    forest.update(2,.5,camera,undefined,1)
    expect(scene.getObjectByName('aether-forest')!.visible).toBe(false)
    forest.update(2,.17,camera,{ndc:new THREE.Vector2(.1,.2),strength:.8,aspect:1.6},1)
    expect(plants.material.uniforms.uPointerStrength.value).toBe(.8)
  } finally { forest.dispose() }
  expect(scene.children).toHaveLength(0)
})
