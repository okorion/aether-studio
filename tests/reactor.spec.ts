import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeReactor } from './fixtures/reactor-harness'
import { REACTOR } from '../src/Reactor'
import { sampleJourney } from '../src/Journey'

test('@interaction reactor GPU grains leave the real aperture, descend and restore on reverse scroll', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/reactor-harness.ts', formats: ['iife'], name: 'ReactorProbe' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(o => 'output' in o ? o.output : []).find(o => o.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Reactor fixture did not compile')
  await page.goto('about:blank'); await page.addScriptTag({ content: chunk.code })
  for (const mobile of [false, true]) for (const software of [false, true]) {
    const r = await page.evaluate(({ mobile, software }) => (window as unknown as { ReactorProbe: { probeReactor: typeof probeReactor } }).ReactorProbe.probeReactor(mobile, software), { mobile, software })
    expect(r.centreHits).toBe(0)
    expect(r.rimHits).toBeGreaterThan(0)
    expect(r.centre[1]).toBeCloseTo(REACTOR.worldY + REACTOR.apertureY * REACTOR.heightScale, 4)
    expect(sampleJourney(.69).azimuth).toBeCloseTo(Math.PI * 2, 6)
    expect(sampleJourney(.69).elevation).toBe(0)
    expect(r.frozen).toEqual(r.stopped)
    for (const travel of r.continuity) expect(travel).toBeLessThan(.12)
    expect(r.idleSpeed).toBeGreaterThan(.001)
    expect(r.idleSpeed).toBeLessThan(.035)
    const fluidTravel = r.stopped.reduce((sum, p, i) => sum + Math.hypot(...p.map((v, axis) => v - r.mid[i][axis])), 0) / r.mid.length
    expect(fluidTravel).toBeGreaterThan(.15)
    const heights = r.start.map(p => p[1])
    // Initial grains hang in an uneven volume below the bore, never a flat disk.
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(.65)
    const mean = (points: number[][]) => points.reduce((sum, p) => sum + p[1], 0) / points.length
    expect(mean(r.mid)).toBeLessThan(mean(r.start) - .7)
    for (let i = 0; i < r.start.length; i++) {
      const p = r.start[i]
      expect(Math.hypot(p[0] - r.centre[0], p[2] - r.centre[2])).toBeLessThan(r.bore)
      expect(p[1]).toBeLessThan(r.centre[1] + .05)
      expect(p[1]).toBeGreaterThan(r.centre[1] - 1.7)
      expect(r.end[i][1]).toBeLessThan(r.centre[1] - .4)
      expect(Math.hypot(r.end[i][0] / .98, (r.end[i][1] + 40.4) / 1.12)).toBeGreaterThan(.45)
      // The breathing tube has a thicker diffuse rim, still inside the cage.
      expect(Math.hypot(r.end[i][0] / .98, (r.end[i][1] + 40.4) / 1.12)).toBeLessThan(1.8)
      expect(Math.abs(r.projection[i][0] - r.centreProjection[0])).toBeLessThan(mobile ? .8 : .25)
      expect(Math.abs(r.projection[i][1] - r.centreProjection[1])).toBeLessThan(.5)
      for (let axis = 0; axis < 3; axis++) {
        expect(r.reverse[i][axis]).toBeCloseTo(p[axis], 4)
      }
    }
  }
})
