import { test, expect } from '@playwright/test'
import { build } from 'vite'
import type { probeHeightAssembly } from './fixtures/height-assembly-harness'

test('@interaction flowers reinforce by camera height, preserve baseline, reverse and clear the monitor glass', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/height-assembly-harness.ts', formats: ['iife'], name: 'HeightProbe' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(r => 'output' in r ? r.output : []).find(r => r.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw Error('Height fixture failed')
  await page.goto('about:blank'); await page.addScriptTag({ content: chunk.code })
  const r = await page.evaluate(() => (window as unknown as { HeightProbe: { probeHeightAssembly: typeof probeHeightAssembly } }).HeightProbe.probeHeightAssembly())
  expect(r.error).toBe(0); expect(r.upper).toEqual(r.reverse)
  expect(r.baseline.every(p => p.every((v, i) => v === r.baseline[0][i]))).toBe(true)
  expect(r.upper[0][1] - r.upper.at(-1)![1]).toBeGreaterThan(1.8)
  expect(r.lower[0][1] - r.lower.at(-1)![1]).toBeGreaterThan(1.8)
  for (const poses of [r.upper, r.lower]) for (let i = 1; i < poses.length; i++) {
    expect(poses[i][1]).toBeLessThanOrEqual(poses[i-1][1])
    expect(poses[i-1][1] - poses[i][1]).toBeLessThan(.34)
    expect(poses[i][0]).toBe(poses[0][0]); expect(poses[i][2]).toBe(poses[0][2])
  }
  expect(r.local[2]).toBeLessThanOrEqual(-r.clearance + .00001)
  expect(r.count).toBe(9000); expect(r.extra).toBe(3600)
  // Lower ring material alpha stays constant through both directions of the cut.
  for (const values of r.opacities) expect(values.slice(0, 2)).toEqual([1, 1])
  await test.info().attach('height-assembly.json', { body: JSON.stringify(r), contentType: 'application/json' })
})
