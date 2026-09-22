import { expect, test } from '@playwright/test'
import { build } from 'vite'
import * as THREE from 'three'
import { createLightFilmUniforms } from '../src/SceneLighting'
import { createSceneLightShafts } from '../src/SceneLightShafts'
import type {} from './fixtures/light-spill-harness'

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
    const cleanup = await page.evaluate(() => window.lightSpillHarness.releaseHelper())
    expect(cleanup.sceneChildren).toBe(0)
    expect(Object.values(cleanup.externalDisposals)).toEqual([0, 0, 0, 0])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  } finally {
    await page.evaluate(() => window.lightSpillHarness?.dispose())
  }
})
