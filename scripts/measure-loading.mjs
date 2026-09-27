/* global process, console, URL, window, document, PerformanceObserver, MutationObserver, performance, innerHeight, requestAnimationFrame */
// Run against production previews. The query enables local User Timing only.
// Example: node scripts/measure-loading.mjs --baseline http://127.0.0.1:5188 --candidate http://127.0.0.1:5187 --pairs 5 --output .qa/loading.json
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { installLoadingProfileProbe } from './loading-profile-probe.mjs'
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]])
  return pairs
}, []))
if (!args.baseline || !args.candidate || !args.output) throw new Error('--baseline, --candidate, --output are required')
const pairs = Number(args.pairs ?? 5)
if (!Number.isInteger(pairs) || pairs < 1 || pairs > 30) throw new Error('--pairs must be 1..30')
const mobile = args.profile === 'mobile'
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
const results = []
const launchArgs = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : []
for (let pair = 0; pair < pairs; pair++) {
  // Alternate order. Each build gets a fresh browser, followed by one reload.
  for (const label of pair % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    const browser = await chromium.launch({ headless: true, args: launchArgs })
    try {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      if (args.detail === '1') await page.addInitScript(installLoadingProfileProbe)
      await page.addInitScript(() => {
        const probe = { firstFrame: null, visibleReady: null, longTasks: [] }
        window.__loadingMeasurement = probe
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) probe.longTasks.push({ start: e.startTime, duration: e.duration })
        }).observe({ type: 'longtask', buffered: true })
        new MutationObserver(() => {
          if (probe.firstFrame === null && document.querySelector('.scene-canvas')?.dataset.renderState === 'ready') probe.firstFrame = performance.now()
          if (probe.visibleReady === null && document.querySelector('.experience.is-ready')) probe.visibleReady = performance.now()
        }).observe(document, { childList: true, subtree: true, attributes: true })
      })
      for (const visit of ['fresh', 'reload']) {
        const url = new URL(args[label])
        if (args.trace !== '0') url.searchParams.set('profileLoading', '1')
        if (visit === 'fresh') await page.goto(url.href)
        else await page.reload()
        await page.waitForSelector('.experience.is-ready', { timeout: 120_000 })
        const loading = await page.evaluate(() => {
          const canvas = document.querySelector('.scene-canvas')
          const gl = canvas.getContext('webgl2')
          const debug = gl.getExtension('WEBGL_debug_renderer_info')
          return {
            ...window.__loadingMeasurement,
            renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            profile: canvas.dataset.renderProfile, quality: canvas.dataset.quality,
            measures: performance.getEntriesByType('measure').filter(e => e.name.startsWith('aether:')).map(e => ({ name: e.name, start: e.startTime, duration: e.duration })),
            marks: performance.getEntriesByType('mark').filter(e => e.name.startsWith('aether:')).map(e => ({ name: e.name, start: e.startTime })),
            resources: performance.getEntriesByType('resource').map(e => ({ path: new URL(e.name).pathname, start: e.startTime, end: e.responseEnd, duration: e.duration, transferBytes: e.transferSize, encodedBytes: e.encodedBodySize, decodedBytes: e.decodedBodySize })),
          }
        })
        if (loading.profile !== 'gpu') throw new Error(`Hardware GPU required, got ${loading.renderer}`)
        if (args.detail === '1') {
          const diagnostic = await page.evaluate(() => window.__loadingGL)
          loading.gl = loading.measures.map(phase => {
            const methods = {}
            for (const call of diagnostic.calls) {
              if (call.start < phase.start || call.start >= phase.start + phase.duration) continue
              const stats = methods[call.name] ??= { count: 0, ms: 0, max: 0, bytes: 0 }
              stats.count++; stats.ms += call.duration; stats.max = Math.max(stats.max, call.duration); stats.bytes += call.bytes
            }
            return { phase: phase.name, methods }
          })
          loading.programs = diagnostic.programs.map(({ sources, ...record }) => ({ ...record,
            // Material names do not change shader execution. Preserve all other source text.
            sourceHashes: sources.map(source => createHash('sha256').update(source.replace(/^#define SHADER_NAME .*$/gm, '')).digest('hex')),
          }))
        }
        const scroll = await page.evaluate(async () => {
          const intervals = []; const start = performance.now(); let previous = start
          const height = document.documentElement.scrollHeight - innerHeight
          await new Promise(resolve => {
            const frame = now => {
              intervals.push(now - previous); previous = now
              const t = Math.min(1, (now - start) / 8000)
              window.scrollTo(0, height * (t < .5 ? t * 2 : (1 - t) * 2))
              if (t < 1) requestAnimationFrame(frame); else resolve()
            }
            requestAnimationFrame(frame)
          })
          const sorted = intervals.slice(1).sort((a, b) => a - b)
          return { p95: sorted[Math.ceil(sorted.length * .95) - 1], max: Math.max(...sorted), over33ms: sorted.filter(t => t > 33.5).length, frames: sorted.length, finalQuality: document.querySelector('.scene-canvas').dataset.quality }
        })
        results.push({ pair, label, visit, viewport, loading, scroll, errors: [...errors] })
        console.log(JSON.stringify({ pair, label, visit, ready: loading.visibleReady, atmosphere: loading.measures.find(e => e.name.endsWith(':atmosphere'))?.duration, scroll }))
        await mkdir(dirname(args.output), { recursive: true })
        await writeFile(args.output, JSON.stringify({ browser: browser.version(), platform: process.platform, launchArgs, trace: args.trace !== '0', detail: args.detail === '1', note: 'Local preview; fresh browser does not reset OS/driver shader caches. Reload cache use is recorded per resource. Durations are CPU/wall-clock, not GPU timer queries.', results }, null, 2) + '\n')
      }
    } finally {
      await browser.close()
    }
  }
}
