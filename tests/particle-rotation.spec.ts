import { expect, test } from '@playwright/test'
import { build } from 'vite'

test('@interaction anchored and moving grains share one rotating spine path', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, minify: false,
    lib: { entry: 'tests/fixtures/particle-rotation-harness.ts', formats: ['iife'], name: 'ParticleRotation' },
  } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(item => 'output' in item ? item.output : []).find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Particle fixture did not compile')
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  const samples = await page.evaluate(() => (window as unknown as {
    ParticleRotation: { sampleRotation(): Record<string, number[]> }
  }).ParticleRotation.sampleRotation())
  const { start, end, moving, matched, reverse } = samples
  // GPU trigonometry varies slightly across drivers; 0.001 world-unit tolerance
  // still rejects stationary anchors and the old, separately rotating path.
  expect(start[3]).toBe(1)
  expect(end[1]).toBeCloseTo(start[1], 3)
  expect(Math.hypot(end[0], end[2])).toBeCloseTo(Math.hypot(start[0], start[2]), 3)
  const angle = Math.atan2(end[2], end[0]) - Math.atan2(start[2], start[0])
  expect(Math.atan2(Math.sin(angle), Math.cos(angle))).toBeCloseTo(.03 * 55 * .20, 3)
  expect(Math.abs(moving[1] - end[1])).toBeGreaterThan(.1)
  for (let axis = 0; axis < 3; axis++) {
    expect(matched[axis]).toBeCloseTo(end[axis], 3)
    expect(reverse[axis]).toBeCloseTo(start[axis], 3)
  }
})

