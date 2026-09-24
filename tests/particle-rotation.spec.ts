import { expect, test } from '@playwright/test'
import { build } from 'vite'

test('@interaction flower grains fall with absolute scroll and retrace without wrapping', async ({ page }) => {
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
    const { start, expected, end, moving, movingStart, movingReverse, reverse, anchors } = samples
    expect(anchors).toEqual([-29.8, -29.8, -29.8])
    // GPU trigonometry varies slightly across drivers; 0.005 world-unit tolerance
    // still rejects stationary anchors and the old, separately rotating path.
    expect(start[3]).toBe(1)
    expect(Math.abs(end[1] - start[1])).toBeLessThan(.005)
    expect(Math.abs(Math.hypot(end[0], end[2]) - Math.hypot(start[0], start[2]))).toBeLessThan(.005)
    // Compare GPU motion with the actual SceneWorlds matter transform, not
    // a second copy of the shader's rotation convention or a fixed sign.
    expect(Math.abs(moving[1] - end[1])).toBeGreaterThan(.1)
    expect(moving[1] - movingStart[1]).toBeCloseTo(-.015 * 45, 3)
    expect(moving[0]).toBeCloseTo(end[0], 3)
    expect(moving[2]).toBeCloseTo(end[2], 3)
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(end[axis] - expected[axis])).toBeLessThan(.005)
      expect(movingReverse[axis]).toBeCloseTo(movingStart[axis], 3)
      expect(reverse[axis]).toBeCloseTo(start[axis], 3)
    }
  }
})
