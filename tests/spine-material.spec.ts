import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeSpineMaterial } from './fixtures/spine-material-harness'

test('@interaction physical spine material compiles with its boundary and surface hooks together', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/spine-material-harness.ts', formats: ['iife'], name: 'SpineMaterial' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(o => 'output' in o ? o.output : []).find(o => o.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Spine material fixture did not compile')
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  for (const mobile of [false, true]) {
    const result = await page.evaluate(mobile => (window as unknown as { SpineMaterial: { probeSpineMaterial: typeof probeSpineMaterial } }).SpineMaterial.probeSpineMaterial(mobile), mobile)
    expect(result.errors).toEqual([])
    expect(result.programs).toBeGreaterThan(0)
    expect(result.litPixels).toBeGreaterThan(10)
  }
})
