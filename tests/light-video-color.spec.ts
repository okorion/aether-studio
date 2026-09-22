import { expect, test } from '@playwright/test'
import { build } from 'vite'
import { writeFile } from 'node:fs/promises'
import type {} from './fixtures/light-video-color-harness'

test('@interaction authored VideoTexture needs exactly one sRGB decode in the light shader', async ({ page, baseURL }) => {
  const output = await build({
    configFile: false, logLevel: 'silent',
    build: { write: false, minify: false,
      lib: { entry: 'tests/fixtures/light-video-color-harness.ts', formats: ['iife'], name: 'LightVideoColorFixture' } },
  })
  const chunk = (Array.isArray(output) ? output : [output])
    .flatMap(result => 'output' in result ? result.output : [])
    .find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Video color harness did not compile')
  const pageErrors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  // Serve an empty same-origin fixture so only the real local MP4 is requested.
  await page.route('**/light-video-color-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><body style="margin:0;background:#000"></body>',
  }))
  await page.goto(new URL('/light-video-color-fixture', baseURL).href)
  await page.addScriptTag({ content: chunk.code })
  const result = await page.evaluate(() => window.lightVideoColorHarness.probe('/media/light-projection.mp4'))
  for (const frame of result.results) {
    const label = `paused frame at ${frame.beforeTime.toFixed(3)}s`
    expect(frame.paused, label).toBe(true)
    expect(frame.afterTime, label).toBe(frame.beforeTime)
    expect(frame.referenceDrift, label).toBe(0)
    expect(frame.maxError, label).toBeLessThanOrEqual(2)
    expect(frame.meanError, label).toBeLessThan(.5)
    // Black/white-only frames cannot distinguish gamma paths. The wrong raw
    // sampler must visibly lift a substantial set of actual film midtones.
    expect(frame.midtones, label).toBeGreaterThan(result.pixelCount * 3 * .05)
    expect(frame.meanMidtoneLift, label).toBeGreaterThan(20)
    expect(frame.rawBrighterPixels, label).toBeGreaterThan(result.pixelCount * .05)
  }
  expect(result.videoSize.every(size => size > 0)).toBe(true)
  expect(result.automaticVideoDecode).toBe(true)
  expect(result.uploadFormats.length).toBeGreaterThan(0)
  expect(result.uploadFormats.every(format => format === result.rgba8)).toBe(true)
  expect(result.uploadFormats).not.toContain(result.srgb8Alpha8)
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  const evidencePath = test.info().outputPath('video-color-transfer.json')
  await writeFile(evidencePath, JSON.stringify(result, null, 2))
  await test.info().attach('video-color-transfer.json', { path: evidencePath, contentType: 'application/json' })
})
