import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeEmblemMaterial } from './fixtures/emblem-material-harness'

test('@interaction glass and preserved silver compile with their glyph, ribbon and curtain shaders', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/emblem-material-harness.ts', formats: ['iife'], name: 'EmblemMaterial' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(result => 'output' in result ? result.output : []).find(result => result.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Emblem material fixture did not compile')
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  for (const variant of ['glass', 'silver'] as const) for (const mobile of [false, true]) {
    const result = await page.evaluate(({ variant, mobile }) => (window as unknown as {
      EmblemMaterial: { probeEmblemMaterial: typeof probeEmblemMaterial }
    }).EmblemMaterial.probeEmblemMaterial(variant, mobile), { variant, mobile })
    expect(result.errors).toEqual([])
    expect(result.programs).toBeGreaterThan(0)
    expect(result.changed).toBeGreaterThan(50)
    expect(result.status.capture).toBe(variant === 'glass' ? 'ready' : 'disabled')
  }
})
