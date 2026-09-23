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
  for (const mobile of [false, true]) for (const progress of [.30, .36, .4, .49, .55, .58]) {
    const samples = await page.evaluate(({ progress, mobile }) => (window as unknown as {
      ParticleRotation: { sampleRotation(progress: number, mobile: boolean): Record<string, number[]> }
    }).ParticleRotation.sampleRotation(progress, mobile), { progress, mobile })
    const { start, expected, end, moving, matched, reverse } = samples
    // GPU trigonometry varies slightly across drivers; 0.005 world-unit tolerance
    // still rejects stationary anchors and the old, separately rotating path.
    expect(start[3]).toBe(1)
    expect(Math.abs(end[1] - start[1])).toBeLessThan(.005)
    expect(Math.abs(Math.hypot(end[0], end[2]) - Math.hypot(start[0], start[2]))).toBeLessThan(.005)
    // Compare GPU motion with the actual SceneWorlds matter transform, not
    // a second copy of the shader's rotation convention or a fixed sign.
    expect(Math.abs(moving[1] - end[1])).toBeGreaterThan(.1)
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(end[axis] - expected[axis])).toBeLessThan(.005)
      expect(Math.abs(matched[axis] - end[axis])).toBeLessThan(.005)
      expect(reverse[axis]).toBeCloseTo(start[axis], 3)
    }
  }
})
