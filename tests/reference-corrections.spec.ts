import { test, expect } from '@playwright/test'
import { build } from 'vite'
import * as THREE from 'three'
import { createForestGeometry, FOREST_FLOOR_Y } from '../src/ForestGeometry'
import { createForestParticles, sampleForestAssembly, sampleForestArrival } from '../src/ForestAssembly'
import { createSceneForest } from '../src/SceneForest'
import type { probeDryContact, probeStatementHandoff } from './fixtures/reference-corrections-harness'
import type { probeForestLightStability } from './fixtures/scene-flow-harness'

test('@interaction forest foliage does not glitter at rest as time and projected video advance', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/scene-flow-harness.ts', formats: ['iife'], name: 'ForestProbe' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(r => 'output' in r ? r.output : []).find(r => r.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw Error('Forest fixture failed')
  await page.goto('about:blank'); await page.addScriptTag({ content: chunk.code })
  const result = await page.evaluate(() => (window as unknown as { ForestProbe: { probeForestLightStability: typeof probeForestLightStability } }).ForestProbe.probeForestLightStability())
  expect(result.error).toBe(0)
  expect(result.litPixels).toBeGreaterThan(100)
  expect(result.changedPixels).toBe(0)
})

test('@interaction each grove removes two crowded trees and spreads nearby particle arrivals', () => {
  for (const [software, mobile, originalCount] of [[true, false, 5], [false, true, 7], [false, false, 9]] as const) {
    const assets = createForestGeometry(7000, software, mobile)
    const particles = createForestParticles(assets, 7000)
    try {
      expect(assets.treeCount).toBe(originalCount - 2)
      expect(new Set(assets.removedTrees).size).toBe(2)
      const crowding = (ids: number[]) => ids.reduce((sum, i) => sum + Math.min(...ids.filter(j => j !== i).map(j =>
        Math.hypot(assets.treeBases[i][0] - assets.treeBases[j][0], assets.treeBases[i][2] - assets.treeBases[j][2]))), 0) / ids.length
      const all = assets.treeBases.map((_, i) => i)
      expect(crowding(all.filter(i => !assets.removedTrees.includes(i)))).toBeGreaterThan(crowding(all))
      const p = particles.geometry.getAttribute('position'), o = particles.geometry.getAttribute('aOrigin')
      const phase = particles.geometry.getAttribute('aAssemblyPhase'), span = particles.geometry.getAttribute('aAssemblySpan')
      const bands = new Map<number, number[]>()
      for (let i = 0; i < p.count; i++) {
        if (o.getY(i) === p.getY(i)) continue
        const band = Math.floor(p.getY(i) * 5), starts = bands.get(band) ?? []
        starts.push(phase.getX(i) * (1 - span.getX(i))); bands.set(band, starts)
        expect(sampleForestArrival(0, phase.getX(i), span.getX(i))).toBe(0)
        expect(sampleForestArrival(1, phase.getX(i), span.getX(i))).toBe(1)
      }
      // Particles only 0.2 units apart in height still start throughout a
      // substantial interval instead of sharing one sharp horizontal edge.
      for (const starts of bands.values()) if (starts.length > 30) {
        const mean = starts.reduce((s, v) => s + v, 0) / starts.length
        const deviation = Math.sqrt(starts.reduce((s, v) => s + (v - mean) ** 2, 0) / starts.length)
        expect(deviation).toBeGreaterThan(.06)
      }
    } finally { particles.geometry.dispose(); assets.barkGeometry.dispose(); assets.leafGeometry.dispose() }
  }
})

test('@interaction statement keeps full coverage until the diagonal reveals the front monitor and reverses', async ({page}) => {
  const output=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,
    lib:{entry:'tests/fixtures/reference-corrections-harness.ts',formats:['iife'],name:'CorrectionProbe'}}})
  const chunk=(Array.isArray(output)?output:[output]).flatMap(r=>'output' in r?r.output:[]).find(r=>r.type==='chunk')
  if(!chunk||chunk.type!=='chunk')throw Error('Correction fixture failed')
  await page.goto('about:blank');await page.addScriptTag({content:chunk.code})
  for(const mobile of [false,true]){
    const result=await page.evaluate(mobile=>(window as unknown as {CorrectionProbe:{probeStatementHandoff:typeof probeStatementHandoff}}).CorrectionProbe.probeStatementHandoff(mobile),mobile)
    for(const sample of result){
      expect(sample.protectedPixels,`${mobile} ${sample.progress}`).toBeGreaterThan(100)
      expect(sample.leaked,`${mobile} ${sample.progress}`).toBe(0)
      expect(sample.reverseChanged,`${mobile} ${sample.progress}`).toBe(0)
      if(sample.progress>=.255)expect(sample.monitorPixels,`${mobile} ${sample.progress}`).toBeGreaterThan(100)
    }
    await test.info().attach(`statement-handoff-${mobile?'mobile':'desktop'}.json`,{body:JSON.stringify(result),contentType:'application/json'})
  }
})

test('@interaction production water refracts at the rim, refills the released contact, and settles without late jitter', async ({ page }) => {
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
  expect(result.refill).toBeGreaterThan(.006)
  expect(result.dryAfterStop).toBe(0)
  expect(result.end.energy).toBe(0)
  expect(result.reversals).toBe(0)
  expect(result.increases).toBe(0)
  // After the initial moving wake, recovery cannot build repeated oscillations.
  for (let i = 8; i < result.recovery.length; i++) expect(result.recovery[i]).toBeLessThanOrEqual(result.recovery[i - 1])
  await test.info().attach('water-contact-recovery.json', { body: JSON.stringify(result), contentType: 'application/json' })
})

test('@interaction forest assembly has local arrivals, particle trunks and exact reverse poses', () => {
  const assets = createForestGeometry(7000, true, false)
  const particles = createForestParticles(assets, 7000)
  try {
    expect(particles.barkCount).toBe(Math.floor(particles.leafCount * .34))
    const positions = particles.geometry.getAttribute('position'), origins = particles.geometry.getAttribute('aOrigin')
    let standingLeaves = 0, standingBark = 0, arrivals = 0, localArrivals = 0
    let minLift = Infinity, maxLift = 0, maxDrift = 0, standingDrift = 0
    for (let i = 0; i < positions.count; i++) {
      const lift = origins.getY(i) - positions.getY(i)
      const drift = Math.hypot(origins.getX(i) - positions.getX(i), origins.getZ(i) - positions.getZ(i))
      minLift = Math.min(minLift, lift); maxLift = Math.max(maxLift, lift); maxDrift = Math.max(maxDrift, drift)
      if(lift>0) { arrivals++; if(lift<1.82) localArrivals++ }
      if (i < particles.leafCount) expect(positions.getY(i)).toBeCloseTo(
        FOREST_FLOOR_Y + (assets.leafMatrices[i * 16 + 13] - FOREST_FLOOR_Y) * .25, 4)
      if (origins.getY(i) === positions.getY(i)) {
        standingDrift = Math.max(standingDrift, drift)
        if (i < particles.leafCount) standingLeaves++; else standingBark++
      }
    }
    expect(minLift).toBeGreaterThanOrEqual(0)
    expect(maxLift).toBeGreaterThan(2.6)
    expect(maxLift).toBeLessThan(2.72)
    expect(maxDrift).toBeLessThan(3)
    expect(localArrivals/arrivals).toBeGreaterThan(.79)
    expect(standingDrift).toBe(0)
    // Absolute moving counts are a third of the unpruned baseline, not a
    // third of a smaller tree count and then accidentally reduced twice.
    expect((particles.leafCount - standingLeaves) / (7000 * .85)).toBeCloseTo(1 / 3, 1)
    expect((particles.barkCount - standingBark) / (2380 * .575)).toBeCloseTo(1 / 3, 1)
    for (const lower of [false, true]) {
      const samples = Array.from({ length: 101 }, (_, i) => sampleForestAssembly(i / 100, lower))
      const reverse = Array.from({ length: 101 }, (_, i) => sampleForestAssembly((100 - i) / 100, lower)).reverse()
      expect(reverse).toEqual(samples)
      expect(samples.every(v => v >= 0 && v <= 1)).toBe(true)
    }
    // A height front reaches upper branches before lower branches.
    expect(sampleForestArrival(.45, .15)).toBe(1)
    expect(sampleForestArrival(.45, .85)).toBe(0)
    expect(sampleForestAssembly(0, false)).toBe(0)
    expect(sampleForestAssembly(.14, false)).toBe(1)
    expect(sampleForestAssembly(.855, true)).toBe(1)
    // Old endpoints are only halfway through the doubled height range.
    expect(sampleForestAssembly(.073, false)).toBeCloseTo(.5, 8)
    expect(sampleForestAssembly(.935, true)).toBeCloseTo(.5, 8)
    expect(sampleForestArrival(sampleForestAssembly(.10, false), .9)).toBeLessThan(1)
    expect(sampleForestArrival(sampleForestAssembly(.10, false), .9)).toBeGreaterThan(0)
    expect(sampleForestAssembly(1, true)).toBe(0)
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
