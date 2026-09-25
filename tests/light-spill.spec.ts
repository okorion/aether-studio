import { expect, test } from '@playwright/test'
import { build } from 'vite'
import * as THREE from 'three'
import { sampleJourney } from '../src/Journey'
import { createLightFilmUniforms } from '../src/SceneLighting'
import { createSceneLightShafts } from '../src/SceneLightShafts'
import type {} from './fixtures/light-spill-harness'

test('@interaction curved forest film remains anchored while camera movement produces real parallax', () => {
  const texture = new THREE.DataTexture(new Uint8Array([180, 120, 60, 255]), 1, 1)
  const scene = new THREE.Scene()
  const spill = createSceneLightShafts(scene, false, false, createLightFilmUniforms(texture))
  const film = scene.getObjectByName('aether-curved-light-film') as THREE.InstancedMesh
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 100)
  const matrix = new THREE.Matrix4(), centre = new THREE.Vector3()
  const saved = film.instanceMatrix.array.slice()
  try {
    const vertices = film.geometry.getAttribute('position')
    let minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < vertices.count; i++) { minZ = Math.min(minZ, vertices.getZ(i)); maxZ = Math.max(maxZ, vertices.getZ(i)) }
    expect(maxZ - minZ).toBeGreaterThan(7)
    for (const [progress, zone] of [[.04, 0], [.975, 1]]) {
      const height = sampleJourney(progress).height
      camera.position.set(0, height, 12); camera.lookAt(0, height, 0)
      spill.update(18, progress, camera)
      film.getMatrixAt(zone, matrix); centre.setFromMatrixPosition(matrix)
      const front = centre.clone().project(camera)
      camera.position.y -= 1; camera.lookAt(0, height - 1, 0)
      spill.update(19, progress + .01, camera)
      expect(centre.clone().project(camera).y).toBeGreaterThan(front.y)
      camera.position.x = 4; camera.lookAt(0, height, 0)
      spill.update(20, progress, camera)
      expect(Math.abs(centre.clone().project(camera).x - front.x)).toBeGreaterThan(.01)
      expect(film.instanceMatrix.array).toEqual(saved)
    }
  } finally { spill.dispose(); texture.dispose() }
})

test('@interaction light spill owns only its geometry and stays hidden in software rendering', () => {
  const texture = new THREE.DataTexture(new Uint8Array([180, 120, 60, 255]), 1, 1)
  const film = createLightFilmUniforms(texture)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 100)
  camera.position.z = 12
  camera.lookAt(0, 0, 0)
  const spill = createSceneLightShafts(scene, true, false, film)
  let externalDisposals = 0
  texture.addEventListener('dispose', () => externalDisposals++)
  const owned = new Set<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh>()
  const uniforms: THREE.ShaderMaterial['uniforms'][] = []
  spill.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    owned.add(object.geometry)
    if (object instanceof THREE.InstancedMesh) owned.add(object)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      owned.add(material)
      if (material instanceof THREE.ShaderMaterial) uniforms.push(material.uniforms)
    }
  })
  const counts = new Map([...owned].map(resource => [resource, 0]))
  for (const resource of owned) {
    const released = () => { counts.set(resource, counts.get(resource)! + 1) }
    if (resource instanceof THREE.BufferGeometry) resource.addEventListener('dispose', released)
    else if (resource instanceof THREE.Material) resource.addEventListener('dispose', released)
    else resource.addEventListener('dispose', released)
  }
  try {
    expect(uniforms.length).toBeGreaterThan(0)
    for (const uniform of uniforms) {
      expect(uniform.uLightFilm).toBe(film.map)
      expect(uniform.uLightFilmReady).toBe(film.ready)
    }
    for (const progress of [.145, .72, .80, .90]) {
      spill.update(18, progress, camera)
      expect(spill.group.visible).toBe(false)
    }
    spill.dispose()
    spill.dispose()
    expect(scene.children).toHaveLength(0)
    expect(externalDisposals).toBe(0)
    expect([...counts.values()].every(count => count === 1)).toBe(true)
  } finally {
    spill.dispose()
    texture.dispose()
  }
  expect(externalDisposals).toBe(1)
})

test('@interaction real film spill pixels change with the shared frame, not elapsed time', async ({ page }) => {
  const output = await build({
    configFile: false, logLevel: 'silent',
    build: { write: false, minify: false,
      lib: { entry: 'tests/fixtures/light-spill-harness.ts', formats: ['iife'], name: 'LightSpillFixture' } },
  })
  const chunk = (Array.isArray(output) ? output : [output])
    .flatMap(result => 'output' in result ? result.output : [])
    .find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Light spill harness did not compile')
  const pageErrors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.goto('about:blank')
  await page.setContent('<body style="margin:0;background:#000"></body>')
  await page.addScriptTag({ content: chunk.code })
  try {
    const results = await page.evaluate(() => [.145, .72, .80, .90]
      .map(progress => window.lightSpillHarness.probe(progress)))
    for (const result of results) {
      const label = `progress ${result.progress}`
      expect(result.black.nonBlackPixels, label).toBe(0)
      if (result.progress === .72 || result.progress === .80) {
        // Chamber surfaces receive video light, but no visible fan or ray.
        expect(result.white.nonBlackPixels, label).toBe(0)
        expect(result.colorChanges, label).toBe(0)
        expect(result.calls.every(calls => calls === 0), label).toBe(true)
        expect(result.errors, label).toEqual([0, 0, 0, 0, 0, 0])
        continue
      }
      expect(result.white.brightPixels, label).toBeGreaterThan(result.pixelCount * .001)
      expect(result.white.total, label).toBeGreaterThan(result.pixelCount)
      expect(result.warm.red, label).toBeGreaterThan(result.warm.blue * 3)
      expect(result.cool.blue, label).toBeGreaterThan(result.cool.red * 3)
      expect(result.colorChanges, label).toBeGreaterThan(result.pixelCount * .001)
      expect(result.whiteRepeatChanges, label).toBe(0)
      expect(result.blackRestoreChanges, label).toBe(0)
      expect(result.calls.every(calls => calls > 0 && calls <= 2), label).toBe(true)
      expect(result.frameDeltas, label).toEqual([1, 1, 1, 1, 1, 1])
      expect(new Set(result.programs).size, label).toBe(1)
      expect(result.programs[0], label).toBeGreaterThan(0)
      expect(result.framebuffers, label).toBe(0)
      expect(result.defaultTarget, label).toBe(true)
      expect(result.errors, label).toEqual([0, 0, 0, 0, 0, 0])
    }
    // Use fully separated journey windows: transition overlap is intentional.
    const isolated = await page.evaluate(() => [.10, .72, .80, .97].map(progress => ({
      progress,
      forest: window.lightSpillHarness.probe(progress, 'forest'),
      chamber: window.lightSpillHarness.probe(progress, 'chamber'),
    })))
    for (const result of isolated) {
      const label = `independent films at progress ${result.progress}`
      const forestWindow = result.progress < .2 || result.progress > .95
      if (!forestWindow) {
        expect(result.forest.white.nonBlackPixels, label).toBe(0)
        expect(result.chamber.white.nonBlackPixels, label).toBe(0)
        continue
      }
      const visible = forestWindow ? result.forest : result.chamber
      const hidden = forestWindow ? result.chamber : result.forest
      expect(visible.white.total, label).toBeGreaterThan(visible.pixelCount)
      expect(visible.warm.red, label).toBeGreaterThan(visible.warm.blue * 3)
      expect(visible.cool.blue, label).toBeGreaterThan(visible.cool.red * 3)
      expect(hidden.white.nonBlackPixels, label).toBe(0)
      expect(hidden.warm.nonBlackPixels, label).toBe(0)
      expect(hidden.cool.nonBlackPixels, label).toBe(0)
      expect(visible.errors, label).toEqual([0, 0, 0, 0, 0, 0])
      expect(hidden.errors, label).toEqual([0, 0, 0, 0, 0, 0])
    }
    const cleanup = await page.evaluate(() => window.lightSpillHarness.releaseHelper())
    expect(cleanup.sceneChildren).toBe(0)
    expect(Object.values(cleanup.externalDisposals)).toEqual([0, 0, 0, 0])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  } finally {
    await page.evaluate(() => window.lightSpillHarness?.dispose())
  }
})
