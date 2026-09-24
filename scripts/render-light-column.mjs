/* global process, window, Buffer, console */
// Offline first-party column footage; run before generate-light-video.py.
import { build } from 'vite'
import { chromium } from '@playwright/test'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { relative, resolve } from 'node:path'

const directory = process.argv[2] || '.qa/light-column-frames'
await mkdir(directory, { recursive: true })
// An interrupted replacement capture must never retain a valid old manifest.
await rm(`${directory}/source.json`, { force: true })
const output = await build({ configFile: false, logLevel: 'silent', build: {
  write: false, minify: false,
  lib: { entry: 'scripts/render-light-column.ts', formats: ['iife'], name: 'ColumnFilm' },
} })
const chunk = (Array.isArray(output) ? output : [output])
  .flatMap(item => item.output ?? []).find(item => item.type === 'chunk')
if (!chunk) throw new Error('Column film fixture did not compile')
// Record every physical module bundled by Vite, including Three.js and the
// timeline helpers. The capture driver and dependency lock are inputs too.
const inputs = [...new Set([...Object.keys(chunk.modules).filter(id => !id.startsWith('\0')),
  'scripts/render-light-column.mjs', 'package-lock.json'])]
const hashInputs = async () => {
  const hashes = {}
  for (const input of inputs) {
    const name = relative(process.cwd(), resolve(input)).replaceAll('\\', '/')
    if (name.startsWith('../')) throw new Error(`Rendering input outside repository: ${name}`)
    hashes[name] = createHash('sha256').update(await readFile(input)).digest('hex')
  }
  return hashes
}
const sources = await hashInputs()
const bundleSha256 = createHash('sha256').update(chunk.code).digest('hex')
const browser = await chromium.launch({ args: process.env.CI
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11'] })
const page = await browser.newPage()
const errors = []
const frameSha256 = {}
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
try {
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  for (let i = 0; i <= 168; i++) {
    const data = await page.evaluate(time => window.ColumnFilm.frame(time), i / 12)
    const name = `${String(i).padStart(3, '0')}.png`
    const bytes = Buffer.from(data, 'base64')
    frameSha256[name] = createHash('sha256').update(bytes).digest('hex')
    await writeFile(`${directory}/${name}`, bytes)
    if (i % 42 === 0) console.log('column frame', i)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  if (JSON.stringify(sources) !== JSON.stringify(await hashInputs()))
    throw new Error('Rendering inputs changed during capture; frames were not verified')
  await writeFile(`${directory}/source.json`, JSON.stringify({
    schemaVersion: 3,
    authorship: 'Aether bone column geometry and physical materials, rendered locally; no reference footage',
    sources, bundleSha256, frameSha256, frames: 168, fps: 12, width: 256, height: 160, seconds: 14, endpointFrame: 168, errors,
  }, null, 2))
} finally {
  await browser.close()
}
