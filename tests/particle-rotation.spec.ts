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
  // The three lanes cover a dense flower, an inner belt and the wide outer belt.
  for (const mobile of [false, true]) for (const progress of [.30, .36, .4, .49, .55, .58]) for (const lane of progress === .4 ? [.3, .12, .28] : [.3]) {
    const samples = await page.evaluate(({ progress, mobile, lane }) => (window as unknown as {
      ParticleRotation: { sampleRotation(progress: number, mobile: boolean, lane: number): Record<string, number[]> }
    }).ParticleRotation.sampleRotation(progress, mobile, lane), { progress, mobile, lane })
    const { start, expected, end, moving, movingStart, movingReverse, reverse, anchors, idle, idleReverse, movingIdle } = samples
    expect(anchors).toEqual([-29.8, -29.8, -29.8])
    // GPU trigonometry varies slightly across drivers; 0.005 world-unit tolerance
    // still rejects stationary anchors and the old, separately rotating path.
    expect(start[3]).toBe(1)
    expect(Math.abs(end[1] - start[1])).toBeLessThan(.005)
    expect(Math.abs(Math.hypot(end[0], end[2]) - Math.hypot(start[0], start[2]))).toBeLessThan(.005)
    // Compare GPU motion with the actual SceneWorlds matter transform, not
    // a second copy of the shader's rotation convention or a fixed sign.
    expect(Math.hypot(...moving.slice(0, 3).map((v, i) => v - end[i]))).toBeGreaterThan(.1)
    expect(moving[1] - movingStart[1]).toBeCloseTo(-.015 * 45, 3)
    // The falling population hugs the column independently of the flowers.
    expect(Math.hypot(moving[0], moving[2])).toBeLessThan(mobile ? 1.6 : 2.6)
    // Resting flowers orbit continuously without a height drift or breathing
    // radius. Falling seeds retain their scroll-only path when time changes.
    expect(Math.hypot(idle[0] - start[0], idle[2] - start[2])).toBeGreaterThan(.15)
    expect(Math.abs(idle[1] - start[1])).toBeLessThan(.005)
    expect(Math.abs(Math.hypot(idle[0], idle[2]) - Math.hypot(start[0], start[2]))).toBeLessThan(.005)
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(end[axis] - expected[axis])).toBeLessThan(.005)
      expect(movingReverse[axis]).toBeCloseTo(movingStart[axis], 3)
      expect(reverse[axis]).toBeCloseTo(start[axis], 3)
      expect(idleReverse[axis]).toBeCloseTo(start[axis], 3)
      expect(movingIdle[axis]).toBeCloseTo(movingStart[axis], 3)
    }
  }
})
