import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeSpineMaterial } from './fixtures/spine-material-harness'
import { createSpineAssembly, sampleSpineExposure } from '../src/SceneSpine'
import * as THREE from 'three'

test('@interaction column exposure fades at both ends without altering chain lighting or transforms', () => {
  const assembly = createSpineAssembly(false, false)
  const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>
  const chainIntensity = chain.material.envMapIntensity
  try {
    const middle = sampleSpineExposure(.46)
    expect(sampleSpineExposure(.285)).toBeLessThan(middle * .35)
    expect(sampleSpineExposure(.645)).toBeLessThan(middle * .35)
    for (const p of [NaN, -2, 0, .3, .4, .5, .6, 1, 2]) {
      expect(Number.isFinite(sampleSpineExposure(p))).toBe(true)
      expect(sampleSpineExposure(p)).toBeGreaterThanOrEqual(.22)
      expect(sampleSpineExposure(p)).toBeLessThanOrEqual(1)
    }
    assembly.update(.4, 1, 1)
    const original = Array.from(chain.instanceMatrix.array)
    assembly.update(.64, 1, 1)
    expect(chain.material.envMapIntensity).toBe(chainIntensity)
    assembly.update(.4, 1, 1)
    expect(Array.from(chain.instanceMatrix.array)).toEqual(original)
    expect(assembly.group.userData.surfaceExposure).toBe(sampleSpineExposure(.4))
  } finally { assembly.dispose() }
})

test('@interaction physical spine material compiles with its boundary and surface hooks together', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/spine-material-harness.ts', formats: ['iife'], name: 'SpineMaterial' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(o => 'output' in o ? o.output : []).find(o => o.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Spine material fixture did not compile')
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  for (const mobile of [false, true]) {
    const result = await page.evaluate(mobile => (window as unknown as { SpineMaterial: { probeSpineMaterial: typeof probeSpineMaterial } }).SpineMaterial.probeSpineMaterial(mobile), mobile)
    expect(result.errors).toEqual([])
    expect(result.programs).toBeGreaterThan(0)
    expect(result.litPixels).toBeGreaterThan(10)
  }
})
