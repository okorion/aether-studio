import { test, expect } from '@playwright/test'
import { build } from 'vite'
import * as THREE from 'three'
import { createForestGeometry } from '../src/ForestGeometry'
import { createForestParticles, sampleForestAssembly } from '../src/ForestAssembly'
import { createSceneForest } from '../src/SceneForest'
import type { probeDryContact, probeStatementHandoff } from './fixtures/reference-corrections-harness'

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

test('@interaction forest assembly has sparse arrivals, particle trunks and exact reverse poses', () => {
  const assets = createForestGeometry(7000, true, false)
  const particles = createForestParticles(assets, 7000)
  try {
    expect(particles.barkCount).toBeGreaterThan(2000)
    const positions = particles.geometry.getAttribute('position'), origins = particles.geometry.getAttribute('aOrigin')
    let standingLeaves = 0, standingBark = 0, arrivals = 0, localArrivals = 0
    let minLift = Infinity, maxLift = 0, maxDrift = 0, standingDrift = 0
    for (let i = 0; i < positions.count; i++) {
      const lift = origins.getY(i) - positions.getY(i)
      const drift = Math.hypot(origins.getX(i) - positions.getX(i), origins.getZ(i) - positions.getZ(i))
      minLift = Math.min(minLift, lift); maxLift = Math.max(maxLift, lift); maxDrift = Math.max(maxDrift, drift)
      if(lift>0) { arrivals++; if(lift<1.41) localArrivals++ }
      if (origins.getY(i) === positions.getY(i)) {
        standingDrift = Math.max(standingDrift, drift)
        if (i < 7000) standingLeaves++; else standingBark++
      }
    }
    expect(minLift).toBeGreaterThanOrEqual(0)
    expect(maxLift).toBeLessThanOrEqual(3.21)
    expect(maxDrift).toBeLessThan(.82)
    expect(localArrivals/arrivals).toBeGreaterThan(.79)
    expect(standingDrift).toBe(0)
    // The standing silhouette stays intact while nearby seeds reinforce it.
    expect(standingLeaves / 7000).toBeGreaterThan(.29)
    expect(standingLeaves / 7000).toBeLessThan(.35)
    expect(standingBark / particles.barkCount).toBeGreaterThan(.50)
    expect(standingBark / particles.barkCount).toBeLessThan(.58)
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
