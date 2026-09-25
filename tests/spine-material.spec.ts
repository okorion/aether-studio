import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeSpineMaterial } from './fixtures/spine-material-harness'
import { createSpineAssembly, sampleSpineExposure } from '../src/SceneSpine'
import * as THREE from 'three'

test('@interaction adjacent vertebrae keep a gradual height twist independently of scroll rotation', () => {
  const assembly = createSpineAssembly(false, false)
  const bones = assembly.group.getObjectByName('aether-spine-vertebrae') as THREE.InstancedMesh
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
  const euler = new THREE.Euler()
  try {
    for (const p of [.32, .46, .58]) {
      assembly.update(p, 1, 1)
      const levels = []
      for (let i = 0; i < bones.count; i++) {
        bones.getMatrixAt(i, matrix)
        matrix.decompose(position, rotation, scale)
        if (scale.x < .1) continue
        euler.setFromQuaternion(rotation)
        levels.push({ y: position.y, yaw: euler.y })
      }
      levels.sort((a, b) => a.y - b.y)
      expect(levels.length).toBeGreaterThanOrEqual(8)
      expect(levels.at(-1)!.yaw - levels[0].yaw).toBeGreaterThan(1.8)
      for (let i = 1; i < levels.length; i++) {
        const turn = levels[i].yaw - levels[i - 1].yaw
        expect(turn).toBeGreaterThan(.20)
        expect(turn).toBeLessThan(.31)
      }
      const snapshot = Array.from(bones.instanceMatrix.array)
      assembly.update(p + .06, 1, 1)
      assembly.update(p, 1, 1)
      expect(Array.from(bones.instanceMatrix.array)).toEqual(snapshot)
    }
  } finally { assembly.dispose() }
})

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
