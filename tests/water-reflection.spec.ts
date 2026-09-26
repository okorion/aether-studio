import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type * as Probe from './fixtures/water-reflection-harness'

test('@interaction water preserves reflected object positions and colors through moving ripples', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, minify: false,
    lib: { entry: 'tests/fixtures/water-reflection-harness.ts', formats: ['iife'], name: 'WaterReflectionProbe' },
  } })
  const chunk = (Array.isArray(output) ? output : [output])
    .flatMap(result => 'output' in result ? result.output : []).find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Water reflection fixture failed to compile')
  const pageErrors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  const result = await page.evaluate(() =>
    (window as unknown as { WaterReflectionProbe: typeof Probe }).WaterReflectionProbe.probeWaterReflection())
  expect(result.errors).toEqual([])
  expect(result.frameErrors.every(error => error === 0)).toBe(true)
  for (const view of result.results) {
    const label = `camera ${view.position.join(', ')}`
    for (const patch of view.patches) {
      expect(patch.count, `${label}, channel ${patch.channel}`).toBeGreaterThan(20)
      expect(patch.offset, `${label}, channel ${patch.channel}`).toBeLessThan(11)
    }
    const neutral = view.patches[3]
    expect(Math.max(neutral.red, neutral.green, neutral.blue), label)
      .toBeLessThan(Math.min(neutral.red, neutral.green, neutral.blue)*1.12)
    expect(view.moving, label).toBeGreaterThan(150)
    expect(view.stopped, label).toBe(0)
    expect(view.restored, label).toBe(0)
  }
  expect(result.retainedAtFeatherOverlap).toBe(true)
  expect(result.hiddenAtClosedCurtain).toBe(true)
  expect(result.hiddenBelowFloor).toBe(true)
  expect(result.callbackRestored).toBe(true)
  expect(result.releasedByHelper).toEqual({ geometry: 0, material: 0, target: 0 })
  expect(result.defaultTarget).toBe(true)
  const edge = await page.evaluate(() =>
    (window as unknown as { WaterReflectionProbe: typeof Probe }).WaterReflectionProbe.probeWaterReflectionBoundary())
  expect(edge.errors).toEqual([])
  expect(edge.inside.magenta).toBeGreaterThan(1000)
  for (const sample of [edge.right, edge.left, edge.behind]) {
    expect(sample.magenta).toBe(0)
    expect(sample.glError).toBe(0)
  }
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  const exclusion = await page.evaluate(() =>
    (window as unknown as { WaterReflectionProbe: typeof Probe }).WaterReflectionProbe.probeAdjacentRoomExclusion())
  expect(exclusion.before).toBeGreaterThan(100)
  expect(exclusion.after).toBe(0)
  expect(exclusion.direct).toBeGreaterThan(100)
  expect(exclusion.restored).toBe(true)
  expect(exclusion.hiddenPreserved).toBe(true)
})
