import { expect, test, type Page } from '@playwright/test'
import type { createSceneLightVideo } from '../src/SceneLightVideo'

type LightStatus = ReturnType<ReturnType<typeof createSceneLightVideo>['getStatus']>
type LightRecord = { video: HTMLVideoElement; loads: number; playTimes: number[] }
const films = [
  { role: 'light-projection', mediaPath: '/media/light-projection.mp4', statusKey: 'lightVideoState',
    initial: .72, pause: .4, resume: .72, width: 256, height: 160 },
  { role: 'forest-memory', mediaPath: '/media/forest-memory.mp4', statusKey: 'forestVideoState',
    initial: 0, pause: .4, resume: .97, width: 512, height: 288 },
] as const
type FilmCase = typeof films[number]
type MediaRequests = Record<FilmCase['role'], string[]>
const softwareLaunch = () => test.info().project.use.launchOptions?.args?.includes('--use-angle=swiftshader') ?? false

declare global {
  interface Window {
    lightVideoProbe: { records: LightRecord[]; rejections: string[] }
  }
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    window.lightVideoProbe = { records: [], rejections: [] }
    window.addEventListener('unhandledrejection', (event) =>
      window.lightVideoProbe.rejections.push(String(event.reason)),
    )
    const create = document.createElement.bind(document)
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options)
      if (element instanceof HTMLVideoElement) {
        const record: LightRecord = { video: element, loads: 0, playTimes: [] }
        window.lightVideoProbe.records.push(record)
        const load = element.load.bind(element)
        const play = element.play.bind(element)
        element.load = () => { record.loads++; load() }
        element.play = () => { record.playTimes.push(element.currentTime); return play() }
      }
      return element
    }) as typeof document.createElement
  })
}

function watchRequests(page: Page): MediaRequests {
  const requests: MediaRequests = { 'light-projection': [], 'forest-memory': [] }
  page.on('request', (request) => {
    const film = films.find((entry) => new URL(request.url()).pathname === entry.mediaPath)
    if (film) requests[film.role].push(request.url())
  })
  return requests
}

async function videos(page: Page, film: FilmCase) {
  return page.evaluate((role) => window.lightVideoProbe.records.map(({ video, loads, playTimes }, id) => ({
    id, role: video.dataset.mediaRole, src: video.getAttribute('src'), paused: video.paused,
    time: video.currentTime, duration: video.duration, readyState: video.readyState,
    width: video.videoWidth, height: video.videoHeight, loads, playTimes: [...playTimes],
  })).filter((video) => video.role === role), film.role)
}

async function status(page: Page, film: FilmCase): Promise<LightStatus | null> {
  return page.locator('.scene-canvas').evaluate((canvas, key) => {
    const raw = (canvas as HTMLCanvasElement).dataset[key]
    return raw ? JSON.parse(raw) : null
  }, film.statusKey)
}

async function stage(page: Page, progress: number) {
  const expected = await page.evaluate((p) => {
    const maximum = document.documentElement.scrollHeight - innerHeight
    scrollTo({ top: maximum * p, behavior: 'instant' })
    return (scrollY / maximum).toFixed(6)
  }, progress)
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-progress', expected, {
    timeout: softwareLaunch() ? 30_000 : 15_000,
  })
}

async function assertNeverStarted(page: Page, requests: MediaRequests) {
  for (const film of films) {
    const records = await videos(page, film)
    expect(records.length, film.role).toBeGreaterThanOrEqual(1)
    expect(records.every((video) => video.src === null && video.loads === 0 && video.playTimes.length === 0), film.role).toBe(true)
    expect(requests[film.role], film.role).toEqual([])
    await expect.poll(() => status(page, film)).toMatchObject({ active: false, ready: false, attached: false, playing: false, state: 'idle' })
  }
}

async function playing(page: Page, film: FilmCase) {
  await expect.poll(async () => (await videos(page, film)).filter((video) => video.src === film.mediaPath &&
    !video.paused && video.readyState >= 2 && video.width === film.width && video.height === film.height,
  ).length, { timeout: 15_000 }).toBe(1)
  await expect.poll(() => status(page, film)).toMatchObject({ active: true, ready: true, playing: true, state: 'playing' })
  const before = (await videos(page, film)).find((video) => video.src !== null)!
  await expect.poll(async () => {
    const after = (await videos(page, film)).find((video) => video.id === before.id)!
    return (after.time - before.time + after.duration) % after.duration
  }).toBeGreaterThan(.15)
  return (await videos(page, film)).find((video) => video.id === before.id)!
}

async function paused(page: Page, film: FilmCase) {
  await expect.poll(async () => (await videos(page, film)).filter((video) => video.src !== null).map((video) => video.paused))
    .toEqual([true])
  const before = (await videos(page, film)).find((video) => video.src !== null)!
  await page.waitForTimeout(350)
  const after = (await videos(page, film)).find((video) => video.id === before.id)!
  expect(after.time).toBe(before.time)
  return after
}

function expectResume(before: Awaited<ReturnType<typeof paused>>, after: Awaited<ReturnType<typeof playing>>) {
  expect(after.id).toBe(before.id)
  expect(after.loads).toBe(before.loads)
  expect(after.playTimes.length).toBe(before.playTimes.length + 1)
  expect(after.playTimes.at(-1)).toBeCloseTo(before.time, 3)
}

for (const film of films) {
test(`@interaction production ${film.role} follows scene and motion activity, with no software media requests`, async ({ page }) => {
  test.setTimeout(softwareLaunch() ? 120_000 : 75_000)
  const requests = watchRequests(page)
  await installProbe(page)
  await page.goto('/')
  const canvas = page.locator('.scene-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  const profile = await canvas.getAttribute('data-render-profile')
  expect(['gpu', 'software']).toContain(profile)
  if (softwareLaunch()) expect(profile).toBe('software')
  if (profile === 'software') {
    test.info().annotations.push({ type: 'coverage', description: 'Software profile: media exclusion; GPU playback is checked only on a hardware profile.' })
    for (const progress of [0, film.pause, .72, .97]) {
      await stage(page, progress)
      await assertNeverStarted(page, requests)
    }
    return
  }

  await stage(page, film.initial)
  await playing(page, film)
  expect(requests[film.role].length).toBeGreaterThan(0)
  const count = (await videos(page, film)).length
  await stage(page, film.pause)
  const monitorPause = await paused(page, film)
  await expect.poll(() => status(page, film)).toMatchObject({ active: false, ready: true, playing: false, state: 'paused' })
  await stage(page, film.resume)
  expectResume(monitorPause, await playing(page, film))
  await page.getByRole('button', { name: 'Pause motion' }).click()
  const motionPause = await paused(page, film)
  await expect(page.getByRole('button', { name: 'Motion reduced' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Motion reduced' }).click()
  expectResume(motionPause, await playing(page, film))
  expect((await videos(page, film)).length).toBe(count)
  expect(await page.evaluate(() => window.lightVideoProbe.rejections)).toEqual([])
})

test(`@interaction reduced initial ${film.role} stays unloaded and a missing film keeps a terminal procedural fallback`, async ({ page }) => {
  test.setTimeout(softwareLaunch() ? 120_000 : 75_000)
  const requests = watchRequests(page)
  await page.route(`**${film.mediaPath}`, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Missing test film' }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installProbe(page)
  await page.goto('/')
  const canvas = page.locator('.scene-canvas')
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  await expect(page.getByRole('button', { name: 'Motion reduced' })).toBeDisabled()
  await assertNeverStarted(page, requests)
  for (const progress of [film.pause, .72, .97, film.initial]) {
    await stage(page, progress)
    await assertNeverStarted(page, requests)
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.getByRole('button', { name: 'Pause motion' })).toBeEnabled()
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  const profile = await canvas.getAttribute('data-render-profile')
  expect(['gpu', 'software']).toContain(profile)
  if (softwareLaunch()) expect(profile).toBe('software')
  if (profile === 'software') {
    test.info().annotations.push({ type: 'coverage', description: 'Software profile remains unloaded after reduced motion is disabled; GPU missing-media fallback is not exercised.' })
    await assertNeverStarted(page, requests)
    return
  }

  await expect.poll(() => status(page, film), { timeout: 15_000 }).toMatchObject({
    state: 'error', active: false, ready: false, playing: false, attached: false,
  })
  expect(requests[film.role].length).toBeGreaterThan(0)
  const failed = await videos(page, film)
  const requestCount = requests[film.role].length
  // A missing media response may log a browser network error. The contract is
  // no unhandled play rejection, no re-entry retry, and continued scene renders.
  const frameBefore = Number(await canvas.getAttribute('data-render-frame'))
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-frame'))).toBeGreaterThan(frameBefore)
  await stage(page, film.pause)
  await stage(page, film.resume)
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  await expect.poll(() => status(page, film)).toMatchObject({ state: 'error', ready: false })
  const after = await videos(page, film)
  expect(after.map((video) => [video.id, video.loads, video.playTimes.length]))
    .toEqual(failed.map((video) => [video.id, video.loads, video.playTimes.length]))
  expect(after.every((video) => video.src === null && video.paused)).toBe(true)
  expect(requests[film.role]).toHaveLength(requestCount)
  expect(await page.evaluate(() => window.lightVideoProbe.rejections)).toEqual([])
})
}
