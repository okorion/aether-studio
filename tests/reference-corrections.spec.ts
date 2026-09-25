import { test, expect } from '@playwright/test'
import { build } from 'vite'
import * as THREE from 'three'
import { createForestGeometry } from '../src/ForestGeometry'
import { createForestParticles, sampleForestAssembly } from '../src/ForestAssembly'
import { createSceneForest } from '../src/SceneForest'
import type { probeDryContact } from './fixtures/reference-corrections-harness'

test('@interaction production water protects the contact centre while its rim refracts and settles', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/reference-corrections-harness.ts', formats: ['iife'], name: 'CorrectionProbe' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(r => 'output' in r ? r.output : []).find(r => r.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw Error('Correction fixture failed')
  await page.goto('about:blank'); await page.addScriptTag({ content: chunk.code })
  const result = await page.evaluate(() => (window as unknown as { CorrectionProbe: { probeDryContact: typeof probeDryContact } }).CorrectionProbe.probeDryContact())
  expect(result.error).toBe(0)
  expect(result.contact.dryPixels).toBeGreaterThan(6)
  expect(result.contact.dryMax).toBeLessThan(.000001)
  expect(result.contact.rimMax).toBeGreaterThan(.025)
  expect(result.end.energy).toBe(0)
  // After the initial moving wake, recovery cannot build repeated oscillations.
  for (let i = 5; i < result.recovery.length; i++) expect(result.recovery[i]).toBeLessThan(result.recovery[3] * .8)
  await test.info().attach('water-contact-recovery.json', { body: JSON.stringify(result), contentType: 'application/json' })
})

test('@interaction forest assembly has sparse arrivals, particle trunks and exact reverse poses', () => {
  const assets = createForestGeometry(7000, true, false)
  const particles = createForestParticles(assets, 7000)
  try {
    expect(particles.barkCount).toBeGreaterThan(2000)
    const positions = particles.geometry.getAttribute('position'), origins = particles.geometry.getAttribute('aOrigin')
    let near = 0
    for (let i = 0; i < positions.count; i++) {
      expect(origins.getY(i)).toBeGreaterThan(positions.getY(i))
      if (origins.getY(i) < 12) near++
    }
    // A small foreground population is visible at arrival; the dense forest
    // remains above the frame until scroll brings it down.
    expect(near / positions.count).toBeGreaterThan(.005)
    expect(near / positions.count).toBeLessThan(.03)
    for (const lower of [false, true]) {
      const samples = Array.from({ length: 101 }, (_, i) => sampleForestAssembly(i / 100, lower))
      const reverse = Array.from({ length: 101 }, (_, i) => sampleForestAssembly((100 - i) / 100, lower)).reverse()
      expect(reverse).toEqual(samples)
      expect(samples.every(v => v >= 0 && v <= 1)).toBe(true)
    }
    expect(sampleForestAssembly(0, false)).toBe(0)
    expect(sampleForestAssembly(.14, false)).toBe(1)
    expect(sampleForestAssembly(.89, true)).toBe(1)
  } finally { particles.geometry.dispose(); assets.barkGeometry.dispose(); assets.leafGeometry.dispose() }
  const scene = new THREE.Scene(), forest = createSceneForest(scene, true, false)
  try {
    const bank = scene.getObjectByName('aether-forest-boundary-plants-motes-mist') as THREE.Points
    const p = bank.geometry.getAttribute('position')
    let central = 0
    for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) < 2.5) central++
    expect(central).toBeGreaterThan(60)
    expect(scene.getObjectByName('aether-forest-branches-roots')).toBeUndefined()
  } finally { forest.dispose() }
})
