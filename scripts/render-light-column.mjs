/* global process, window, Buffer, console */
// Offline first-party column footage; run before generate-light-video.py.
import { build } from 'vite'
import { chromium } from '@playwright/test'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const directory = process.argv[2] || '.qa/light-column-frames'
await mkdir(directory, { recursive: true })
const output = await build({ configFile: false, logLevel: 'silent', build: {
  write: false, minify: false,
  lib: { entry: 'scripts/render-light-column.ts', formats: ['iife'], name: 'ColumnFilm' },
} })
const chunk = (Array.isArray(output) ? output : [output])
  .flatMap(item => item.output ?? []).find(item => item.type === 'chunk')
if (!chunk) throw new Error('Column film fixture did not compile')
const browser = await chromium.launch({ args: process.env.CI
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
try {
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  for (let i = 0; i <= 168; i++) {
    const data = await page.evaluate(time => window.ColumnFilm.frame(time), i / 12)
    await writeFile(`${directory}/${String(i).padStart(3, '0')}.png`, Buffer.from(data, 'base64'))
    if (i % 42 === 0) console.log('column frame', i)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  const sources = {}
  for (const path of ['scripts/render-light-column.ts', 'src/SceneSpine.ts']) {
    sources[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  await writeFile(`${directory}/source.json`, JSON.stringify({
    authorship: 'Aether bone column geometry and physical materials, rendered locally; no reference footage',
    sources, frames: 168, fps: 12, width: 256, height: 160, seconds: 14, endpointFrame: 168, errors,
  }, null, 2))
} finally {
  await browser.close()
}
