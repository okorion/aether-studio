import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type {sampleRotation} from './fixtures/particle-rotation-harness'

test('@interaction flowers stay still at rest while a sparse distant belt orbits; close non-flower grains are hidden', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, minify: false,
    lib: { entry: 'tests/fixtures/particle-rotation-harness.ts', formats: ['iife'], name: 'ParticleRotation' },
  } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(item => 'output' in item ? item.output : []).find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Particle fixture did not compile')
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  const turns=await page.evaluate(()=>{
    const probe=(window as unknown as {ParticleRotation:{sampleRotation:typeof sampleRotation}}).ParticleRotation
    return [.27,.27+1/3.8].map(t=>probe.sampleRotation(.4,false,.12,t).start)
  })
  const [upper,lower]=turns
  expect(upper[1]-lower[1]).toBeGreaterThan(11)
  expect(upper[1]-lower[1]).toBeLessThan(14)
  const heading=(p:number[])=>Math.atan2(p[2],p[0])
  expect(Math.abs(Math.sin(heading(upper)-heading(lower)))).toBeLessThan(.03)
  for(const point of turns)expect(Math.hypot(point[0],point[2])).toBeGreaterThan(23)
  // One nearby flower lane and two lanes of the distant, shallow helix.
  for (const mobile of [false, true]) for (const progress of [.30, .36, .4, .49, .55, .58]) for (const lane of progress === .4 ? [.3, .12, .28] : [.3]) {
    const samples = await page.evaluate(({ progress, mobile, lane }) => (window as unknown as {
      ParticleRotation: { sampleRotation(progress: number, mobile: boolean, lane: number): Record<string, number[]> }
    }).ParticleRotation.sampleRotation(progress, mobile, lane), { progress, mobile, lane })
    const { start, expected, end, moving, movingStart, movingReverse, reverse, anchors, idle, idleReverse, movingIdle,
      bokeh, thinned, reactorMoving, reactorBokeh, forestMoving, forestBokeh } = samples
    const belt = lane !== .3
    const radius = (point: number[]) => Math.hypot(point[0], point[2])
    expect(anchors).toEqual([-29.8, -29.8, -29.8])
    // GPU trigonometry varies slightly across drivers; 0.005 world-unit tolerance
    // still rejects stationary anchors and the old, separately rotating path.
    expect(start[3]).toBeGreaterThan(0)
    expect(Math.abs(end[1] - start[1])).toBeLessThan(.005)
    expect(Math.abs(radius(end) - radius(start))).toBeLessThan(.005)
    // Compare GPU motion with the actual SceneWorlds matter transform, not
    // a second copy of the shader's rotation convention or a fixed sign.
    expect(Math.hypot(...moving.slice(0, 3).map((v, i) => v - end[i]))).toBeGreaterThan(.1)
    expect(moving[1] - movingStart[1]).toBeCloseTo(-.015 * 45, 3)
    // Close non-flower grains disappear only in this scene. Their shared
    // buffer must still render in the forest and reactor.
    for (const sample of [movingStart, moving, movingIdle, bokeh]) expect(sample[3]).toBe(0)
    for (const sample of [reactorMoving, reactorBokeh, forestMoving, forestBokeh]) expect(sample[3]).toBeGreaterThan(0)
    const idleTravel = Math.hypot(idle[0] - start[0], idle[2] - start[2])
    if (belt) expect(idleTravel).toBeGreaterThan(1)
    else expect(idleTravel).toBeLessThan(.005)
    expect(Math.abs(idle[1] - start[1])).toBeLessThan(.005)
    expect(Math.abs(radius(idle) - radius(start))).toBeLessThan(.005)
    if (belt) {
      for(const sample of [start,end,idle]) {
        // The entire orbit clears the camera path and monitor/flower volume.
        expect(radius(sample)).toBeGreaterThan(22)
      }
      expect(thinned[3]).toBe(0)
    } else {
      // The density mask never removes a flower seed.
      expect(thinned[3]).toBeGreaterThan(0)
    }
    for (let axis = 0; axis < 3; axis++) {
      if (!belt) expect(Math.abs(end[axis] - expected[axis])).toBeLessThan(.005)
      expect(movingReverse[axis]).toBeCloseTo(movingStart[axis], 3)
      expect(reverse[axis]).toBeCloseTo(start[axis], 3)
      expect(idleReverse[axis]).toBeCloseTo(start[axis], 3)
      expect(movingIdle[axis]).toBeCloseTo(movingStart[axis], 3)
    }
  }
})
