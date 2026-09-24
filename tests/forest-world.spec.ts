import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeForestGround } from './fixtures/forest-world-harness'

test('@interaction real forest ground keeps its projection when only the wrapper edge moves', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/forest-world-harness.ts', formats: ['iife'], name: 'ForestWorld' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(o => 'output' in o ? o.output : []).find(o => o.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Forest fixture did not compile')
  await page.goto('about:blank'); await page.addScriptTag({ content: chunk.code })
  for (const lower of [false, true]) {
    const p = await page.evaluate(lower => (window as unknown as { ForestWorld: { probeForestGround: typeof probeForestGround } }).ForestWorld.probeForestGround(lower), lower)
    expect(p.initial[3]).toBe(1)
    expect(p.wrapperMoved).toEqual(p.initial)
    expect(p.restored).toEqual(p.initial)
    expect(Math.abs(p.cameraMoved[0] - p.initial[0])).toBeGreaterThan(.01)
    expect(p.initial[2]).toBeCloseTo(lower ? -51.6 : -9.9, 1)
  }
})
