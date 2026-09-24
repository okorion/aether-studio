import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeBubbleSize } from './fixtures/bubble-size-harness'

test('@interaction bubble CSS diameter remains stable across DPR and reduced render passes', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/bubble-size-harness.ts', formats: ['iife'], name: 'BubbleSize' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(o => 'output' in o ? o.output : []).find(o => o.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Bubble fixture did not compile')
  await page.goto('about:blank'); await page.addScriptTag({ content: chunk.code })
  for (const [ratio, passScale] of [[1, 1], [1.5, 1], [1.5, .5]]) {
    const diameter = await page.evaluate(([ratio, passScale]) => (window as unknown as { BubbleSize: { probeBubbleSize: typeof probeBubbleSize } }).BubbleSize.probeBubbleSize(ratio, passScale), [ratio, passScale])
    expect(diameter).toBeGreaterThan(18)
    expect(diameter).toBeLessThanOrEqual(22)
  }
})
