import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeMaterialDetail } from './fixtures/material-detail-harness'

test('@interaction detailed metal reflects the environment and keeps rigid tile normals', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/material-detail-harness.ts', formats: ['iife'], name: 'MaterialDetail' } } })
  const chunk = (Array.isArray(output) ? output : [output])
    .flatMap(result => 'output' in result ? result.output : []).find(result => result.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Material detail fixture did not compile')
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  const result = await page.evaluate(() => (window as unknown as {
    MaterialDetail: { probeMaterialDetail: typeof probeMaterialDetail }
  }).MaterialDetail.probeMaterialDetail())
  expect(result.errors).toEqual([])
  for (const material of [result.column, result.scale, result.artwork]) {
    expect(material.baseline.covered).toBeGreaterThan(5000)
    expect(material.baseline.median).toBeGreaterThan(12)
    expect(material.baseline.p95).toBeGreaterThan(material.baseline.median + 8)
    expect(material.baseline.clipped).toBeLessThan(.08)
    expect(material.baseline.neutralHighlights).toBeGreaterThan(20)
    expect(material.light.changed).toBeGreaterThan(1000)
    expect(material.view.changed).toBeGreaterThan(1000)
    expect(material.roughness.changed).toBeGreaterThan(500)
    expect(material.repeat.changed).toBe(0)
    expect(material.restored.changed).toBe(0)
  }
  expect(result.artworkTransition.waiting.changed).toBe(0)
  expect(result.artworkTransition.loaded.changed).toBeGreaterThan(1000)
  expect(result.artworkTransition.fallback.changed).toBe(0)
  expect(result.normals.pixels).toBeGreaterThan(5000)
  expect(result.normals.meanAmplifiedError).toBeLessThan(.01)
  expect(result.normals.badFraction).toBeLessThan(.005)
})
