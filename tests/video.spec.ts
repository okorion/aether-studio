import { expect, test, type Page } from '@playwright/test'
import { build } from 'vite'
import type { SceneVideoStatus } from '../src/SceneVideo'
import type {} from './fixtures/video-harness'

type VideoRecord = { video: HTMLVideoElement; loads: number; playTimes: number[] }
const slowRenderer = () => test.info().project.use.launchOptions?.args?.includes('--use-angle=swiftshader') ?? false

declare global {
  interface Window {
    videoProbe: { records: VideoRecord[]; rejections: string[] }
  }
}

async function installVideoProbe(page: Page, blockPlayback = false) {
  await page.addInitScript((blocked) => {
    window.videoProbe = { records: [], rejections: [] }
    window.addEventListener('unhandledrejection', (event) =>
      window.videoProbe.rejections.push(String(event.reason)),
    )
    const create = document.createElement.bind(document)
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options)
      if (element instanceof HTMLVideoElement) {
        const record: VideoRecord = { video: element, loads: 0, playTimes: [] }
        window.videoProbe.records.push(record)
        const load = element.load.bind(element)
        const play = element.play.bind(element)
        element.load = () => { record.loads++; load() }
        element.play = () => {
          record.playTimes.push(element.currentTime)
          return blocked ? Promise.reject(new DOMException('Test autoplay policy', 'NotAllowedError')) : play()
        }
      }
      return element
    }) as typeof document.createElement
  }, blockPlayback)
}

async function snapshots(page: Page) {
  return page.evaluate(() => window.videoProbe.records
    .filter(({ video }) => video.dataset.mediaRole !== 'light-projection')
    .map(({ video, loads, playTimes }, id) => ({
    id,
    src: video.getAttribute('src'),
    poster: video.getAttribute('poster'),
    time: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    readyState: video.readyState,
    width: video.videoWidth,
    height: video.videoHeight,
    loads,
    playTimes: [...playTimes],
  })))
}

async function attachedVideos(page: Page) {
  return (await snapshots(page)).filter((video) => video.src !== null)
}

async function productionStatus(page: Page): Promise<SceneVideoStatus | null> {
  return page.locator('.scene-canvas').evaluate((canvas) => {
    const status = (canvas as HTMLCanvasElement).dataset.videoState
    return status ? JSON.parse(status) : null
  })
}

async function playingVideos(page: Page) {
  await expect.poll(async () => (await attachedVideos(page)).filter((video) =>
    !video.paused && video.readyState >= 2 && video.width > 0 && video.height > 0,
  ).length, { timeout: slowRenderer() ? 20_000 : 10_000 }).toBe(2)
  const before = await attachedVideos(page)
  // Current time is cyclic; a loop boundary must still count as forward motion.
  await expect.poll(async () => {
    const after = await attachedVideos(page)
    return Math.min(...after.map((video, index) =>
      (video.time - before[index].time + video.duration) % video.duration,
    ))
  }).toBeGreaterThan(.15)
  return attachedVideos(page)
}

async function stoppedVideos(page: Page) {
  await expect.poll(async () => (await attachedVideos(page)).map((video) => video.paused))
    .toEqual([true, true])
  const before = await attachedVideos(page)
  // Observe a real elapsed interval rather than trusting only the paused flag.
  await page.waitForTimeout(350)
  const after = await attachedVideos(page)
  expect(after.map((video) => video.time)).toEqual(before.map((video) => video.time))
  return after
}

function expectResumedFrom(
  before: Awaited<ReturnType<typeof attachedVideos>>,
  after: Awaited<ReturnType<typeof attachedVideos>>,
) {
  expect(after.map((video) => video.id)).toEqual(before.map((video) => video.id))
  after.forEach((video, index) => {
    expect(video.loads).toBe(before[index].loads)
    expect(video.playTimes.length).toBe(before[index].playTimes.length + 1)
    // The exact time at play(), before decode resumes, detects reset-to-zero.
    expect(video.playTimes.at(-1)).toBeCloseTo(before[index].time, 3)
  })
}

test('@interaction production monitor videos load on entry and retain playback across pauses and views', async ({ page }) => {
  test.setTimeout(slowRenderer() ? 150_000 : 75_000)
  const pageErrors: string[] = []
  const mediaRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (/\/media\/(chrome-current|aurora-bloom)\.(mp4|jpg)(?:\?|$)/.test(request.url())) mediaRequests.push(request.url())
  })
  await installVideoProbe(page)
  await page.goto('/')
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  const initial = await snapshots(page)
  expect(initial.length).toBeGreaterThanOrEqual(2)
  expect(initial.every((video) => video.src === null && video.poster === null && video.loads === 0 && video.playTimes.length === 0)).toBe(true)
  expect(mediaRequests).toEqual([])

  const enterMonitors = async () => {
    await page.evaluate(() => scrollTo({
      top: (document.documentElement.scrollHeight - innerHeight) * .4,
      behavior: 'instant',
    }))
    await expect(page.locator('.hero-stage')).toHaveAttribute('data-stage', 'work')
    const playing = await playingVideos(page)
    await expect.poll(async () => (await productionStatus(page))?.ready,
      { timeout: slowRenderer() ? 20_000 : 10_000 }).toEqual([true, true])
    return playing
  }
  const returnHome = async () => {
    await page.getByRole('link', { name: 'Aether Studio home' }).click()
    await expect(page.locator('.experience')).toHaveAttribute('data-view', 'home')
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  }
  await enterMonitors()
  expect(new Set(mediaRequests.filter((url) => url.includes('.mp4')).map((url) => new URL(url).pathname)))
    .toEqual(new Set(['/media/chrome-current.mp4', '/media/aurora-bloom.mp4']))
  const recordCount = (await snapshots(page)).length
  await page.getByRole('button', { name: 'Pause motion' }).click()
  const pausedMotion = await stoppedVideos(page)
  await expect.poll(async () => (await productionStatus(page))?.ready).toEqual([true, true])
  await page.getByRole('button', { name: 'Motion reduced' }).click()
  expectResumedFrom(pausedMotion, await playingVideos(page))
  expect((await snapshots(page)).length).toBe(recordCount)

  // Dispatch the same visibility event as a hidden tab without opening another
  // GPU page or relying on the headless browser's foreground-tab heuristics.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hidden = await stoppedVideos(page)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expectResumedFrom(hidden, await playingVideos(page))

  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await nav.getByRole('link', { name: 'Work', exact: true }).click()
  await expect(page.locator('.experience')).toHaveAttribute('data-view', 'work')
  const work = await stoppedVideos(page)
  await page.getByRole('button', { name: /^Explore / }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const dialog = await stoppedVideos(page)
  expect(dialog.map((video) => video.playTimes)).toEqual(work.map((video) => video.playTimes))
  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await returnHome()
  expectResumedFrom(work, await enterMonitors())

  await nav.getByRole('link', { name: 'Contact', exact: true }).click()
  await expect(page.locator('.experience')).toHaveAttribute('data-view', 'contact')
  const contact = await stoppedVideos(page)
  await returnHome()
  expectResumedFrom(contact, await enterMonitors())
  expect((await snapshots(page)).length).toBe(recordCount)
  expect(pageErrors).toEqual([])
  expect(await page.evaluate(() => window.videoProbe.rejections)).toEqual([])
})

test('@interaction monitor hover persists at rest and clicks exclude drags while preserving playback', async ({ page }) => {
  test.setTimeout(slowRenderer() ? 120_000 : 60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installVideoProbe(page)
  await page.goto('/')
  const canvas = page.locator('.scene-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  const expectedProgress = await page.evaluate(() => {
    const maximum = document.documentElement.scrollHeight - innerHeight
    scrollTo({ top: maximum * .4, behavior: 'instant' })
    return (scrollY / maximum).toFixed(6)
  })
  await expect(canvas).toHaveAttribute('data-render-progress', expectedProgress, {
    timeout: slowRenderer() ? 20_000 : 10_000,
  })
  await expect(canvas).toHaveAttribute('data-orbit-enabled', 'false')
  await playingVideos(page)
  const recordCount = (await snapshots(page)).length
  const scrollBefore = await page.evaluate(() => scrollY)
  // These are actual panel coordinates at 1440x900, verified in the running
  // production scene. Panel 1 is the Pulse Archive screen, linked to Pulse.
  const panel = { x: 420, y: 380 }
  await page.mouse.move(panel.x, panel.y)
  await expect(canvas).toHaveAttribute('data-monitor-hover', '1')
  await expect(page.locator('html')).toHaveClass(/scene-monitor-hover/)

  const nextTelemetry = async () => {
    const before = Number(await canvas.getAttribute('data-render-frame'))
    await expect.poll(async () => Number(await canvas.getAttribute('data-render-frame')), {
      timeout: slowRenderer() ? 20_000 : 10_000,
    }).toBeGreaterThan(before)
  }
  // Get a sample after the move, then allow the transient lighting field to
  // decay. Hover must survive without receiving another pointermove event.
  await nextTelemetry()
  await expect.poll(async () => Number(await canvas.getAttribute('data-pointer-strength')), {
    timeout: slowRenderer() ? 40_000 : 10_000,
  }).toBeLessThan(.02)
  await expect(canvas).toHaveAttribute('data-monitor-hover', '1')
  await expect(page.locator('html')).toHaveClass(/scene-monitor-hover/)
  const viewBefore = Number(await canvas.getAttribute('data-view-azimuth'))
  const yawBefore = Number(await canvas.getAttribute('data-orbit-yaw'))

  await page.mouse.down()
  await page.mouse.move(panel.x + 700, panel.y, { steps: 4 })
  // Return to the original hit before release: this proves drag cancellation
  // rather than relying on a release that merely misses the initial panel.
  await page.mouse.move(panel.x, panel.y, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
  await nextTelemetry()
  expect(Math.abs(Number(await canvas.getAttribute('data-view-azimuth')) - viewBefore)).toBeLessThan(.0002)
  expect(Math.abs(Number(await canvas.getAttribute('data-orbit-yaw')) - yawBefore)).toBeLessThan(.0002)
  await expect(page.getByRole('dialog')).not.toBeVisible()

  await expect(canvas).toHaveAttribute('data-monitor-hover', '1')
  await page.mouse.click(panel.x, panel.y)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.detail-art-title')).toHaveText('Pulse')
  await expect(dialog.getByRole('heading')).toHaveText('A living canvas. A collective rhythm.')
  const paused = await stoppedVideos(page)
  await expect(canvas).toHaveAttribute('data-monitor-hover', '-1')
  await expect(page.locator('html')).not.toHaveClass(/scene-monitor-hover/)
  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(dialog).not.toBeVisible()
  expectResumedFrom(paused, await playingVideos(page))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrollBefore)
  await expect(page.locator('.experience')).toHaveAttribute('data-view', 'home')
  expect((await snapshots(page)).length).toBe(recordCount)

  await page.mouse.move(panel.x, panel.y)
  await expect(canvas).toHaveAttribute('data-monitor-hover', '1')
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Work', exact: true }).hover()
  await expect(canvas).toHaveAttribute('data-monitor-hover', '-1')
  await expect(page.locator('html')).not.toHaveClass(/scene-monitor-hover/)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => window.videoProbe.rejections)).toEqual([])
})

test.describe('@interaction isolated monitor video failure lifecycle', () => {
  let harnessCode = ''
  test.beforeAll(async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      build: { write: false, minify: false, lib: {
        entry: 'tests/fixtures/video-harness.ts', formats: ['iife'], name: 'VideoFixture',
      } },
    })
    const bundles = Array.isArray(output) ? output : [output]
    const chunk = bundles.flatMap((result) => ('output' in result ? result.output : []))
      .find((item) => item.type === 'chunk')
    if (!chunk || chunk.type !== 'chunk') throw new Error('Video harness did not compile')
    harnessCode = chunk.code
  })

  async function openHarness(page: Page, blocked: boolean) {
    await installVideoProbe(page, blocked)
    await page.route('**/__video-harness', (route) => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Video lifecycle fixture</title>',
    }))
    await page.goto('/__video-harness')
    await page.addScriptTag({ content: harnessCode })
  }

  async function verifyTerminalFallback(page: Page, state: 'blocked' | 'error') {
    await expect.poll(() => page.evaluate(() => window.videoHarness.status().state)).toEqual([state, state])
    expect(await page.evaluate(() => window.videoHarness.status().ready)).toEqual([false, false])
    const before = await snapshots(page)
    await page.evaluate(() => {
      for (let index = 0; index < 12; index++) {
        window.videoHarness.update(true, false)
        window.videoHarness.update(false, false)
        window.videoHarness.update(true, true)
        window.videoHarness.update(true, false)
      }
    })
    const after = await snapshots(page)
    expect(after.map((video) => [video.loads, video.playTimes.length]))
      .toEqual(before.map((video) => [video.loads, video.playTimes.length]))
    expect(after.every((video) => video.paused)).toBe(true)
    expect(await page.evaluate(() => window.videoHarness.status().errors.every(Boolean))).toBe(true)
    await page.evaluate(() => { window.videoHarness.dispose(); window.videoHarness.dispose() })
    expect(await page.evaluate(() => window.videoHarness.textureDisposals)).toEqual([1, 1])
    expect(await page.evaluate(() => window.videoHarness.status().state)).toEqual(['disposed', 'disposed'])
    expect((await snapshots(page)).every((video) => video.src === null && video.poster === null && video.paused)).toBe(true)
    expect(await page.evaluate(() => window.videoProbe.rejections)).toEqual([])
  }

  test('missing video responses fall back without repeated requests or leaked resources', async ({ page }) => {
    let requests = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/media/*.mp4', (route) => { requests++; return route.abort('failed') })
    await openHarness(page, false)
    expect(requests).toBe(0)
    await page.evaluate(() => window.videoHarness.update(true, false))
    await verifyTerminalFallback(page, 'error')
    expect(requests).toBe(2)
    expect(errors).toEqual([])
  })

  test('autoplay denial retains fallback across repeated activation without unhandled promises', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openHarness(page, true)
    await page.evaluate(() => window.videoHarness.update(true, false))
    await verifyTerminalFallback(page, 'blocked')
    expect((await snapshots(page)).map((video) => video.playTimes.length)).toEqual([1, 1])
    expect(errors).toEqual([])
  })
})
