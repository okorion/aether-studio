/* global process, console, document, window, innerHeight */
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const url = process.argv[2] ?? 'https://aether-studio-nu.vercel.app/'
const out = process.argv[3] ?? 'docs/evidence/loading-transfer-2026-09-28'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const records = []; const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', error => errors.push(error.message))
  const ready = () => page.waitForFunction(() => document.querySelector('.scene-canvas')?.dataset.renderState === 'ready', {}, { timeout: 120000 })
  const snapshot = async label => records.push({ label, state: await page.locator('.scene-canvas').evaluate(canvas => ({ ...canvas.dataset,
    backingWidth: canvas.width, backingHeight: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
    visibility: document.visibilityState, overflow: document.documentElement.scrollWidth > window.innerWidth,
  })) })
  await page.goto(url)
  await page.waitForSelector('.experience.is-ready', { timeout: 120000 })
  await page.waitForFunction(() => JSON.parse(document.querySelector('.scene-canvas').dataset.forestVideoState ?? '{}').playing === true, {}, { timeout: 30000 })
  await snapshot('portrait-normal-video-playing')
  await page.screenshot({ path: `${out}/mobile-portrait.png` })
  await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * .4))
  await page.waitForTimeout(2000)
  await snapshot('column-after-first-scroll')
  await page.setViewportSize({ width: 844, height: 390 })
  await page.waitForTimeout(1500)
  await snapshot('landscape-viewport-only')
  await page.screenshot({ path: `${out}/mobile-landscape.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.experience')?.classList.contains('motion-paused'))
  await ready()
  await page.waitForFunction(() => JSON.parse(document.querySelector('.scene-canvas').dataset.forestVideoState ?? '{}').playing === false)
  await snapshot('manual-motion-paused')
  await page.getByRole('button', { name: 'Motion reduced', exact: true }).click()
  await ready()
  await page.waitForFunction(() => JSON.parse(document.querySelector('.scene-canvas').dataset.forestVideoState ?? '{}').playing === true, {}, { timeout: 30000 })
  await snapshot('manual-motion-resumed')
  const old = await page.locator('.scene-canvas').elementHandle()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(canvas => !canvas.isConnected, old)
  await old.dispose(); await ready(); await snapshot('recreated-reduced-motion')
  const reduced = await page.locator('.scene-canvas').elementHandle()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(canvas => !canvas.isConnected, reduced)
  await reduced.dispose(); await ready(); await snapshot('recreated-normal-motion')
  await page.reload(); await ready(); await snapshot('reload')
  if (records.some(r => r.state.overflow || r.state.renderState !== 'ready')) throw new Error('overflow or render state regression')
  if (errors.length) throw new Error('browser errors')
} finally {
  await writeFile(`${out}/mobile-smoke.json`, JSON.stringify({ url, checkedAt: new Date().toISOString(), browser: browser.version(),
    note: 'Desktop Chromium emulation; viewport rotation only. No physical phone, OS background return, thermal or long-duration memory verification.', records, errors }, null, 2) + '\n')
  await browser.close()
}
console.log(JSON.stringify({ states: records.map(r => r.label), errors }))
