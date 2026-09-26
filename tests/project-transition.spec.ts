import { scrollToProgress } from './scroll'
import { expect, test } from '@playwright/test'

test('project film pauses for hidden tabs and reduced motion, then returns focus', async ({ page }) => {
  await page.goto('/#work')
  // This test exercises project media, after the software renderer's first
  // shader preparation has finished; startup interactions are covered apart.
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready', {
    timeout: process.env.CI ? 30_000 : 10_000,
  })
  const card = page.getByRole('button', { name: 'Explore Liminal', exact: true })
  await card.click()
  const film = page.locator('.detail-film')
  await expect.poll(() => film.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => film.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => film.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  // Record media state at the first GPU program allocation during the rebuild.
  // A CI software compile can block browser replies beyond an action timeout;
  // the recorded value still requires the video to pause before that work.
  await page.evaluate(() => {
    for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const createProgram = type.prototype.createProgram
      type.prototype.createProgram = function () {
        const video = document.querySelector<HTMLVideoElement>('.detail-film')
        if (video && matchMedia('(prefers-reduced-motion: reduce)').matches && !video.dataset.pauseAtRebuild) {
          video.dataset.pauseAtRebuild = String(video.paused)
        }
        return createProgram.call(this)
      }
    }
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(film).toHaveAttribute('data-pause-at-rebuild', 'true', {
    timeout: process.env.CI ? 30_000 : 10_000,
  })
  expect(await film.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(card).toBeFocused()
  await expect(film).toHaveCount(0)
})

test('failed detail film leaves readable art and repeated close cannot close a later project', async ({ page }) => {
  await page.route('**/media/*.mp4', route => route.abort())
  await page.goto('/#work')
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready', {
    timeout: process.env.CI ? 30_000 : 10_000,
  })
  const card = page.getByRole('button', { name: 'Explore Liminal', exact: true })
  await card.click()
  await expect(page.locator('.detail-film')).toHaveAttribute('hidden', '')
  await expect(page.getByRole('dialog').getByRole('heading')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await card.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // Wait beyond the previous exit duration to detect a stale completion.
  await page.waitForTimeout(350)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(card).toBeFocused()
})

test('monitor tap preserves scroll and returns focus to the exploration', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready', {
    timeout: process.env.CI ? 30_000 : 10_000,
  })
  await scrollToProgress(page, .367)
  await expect.poll(() => page.locator('.scene-canvas').getAttribute('data-render-progress')).toMatch(/^0\.36/)
  await page.waitForTimeout(300)
  const y = await page.evaluate(() => scrollY)
  const viewport = page.viewportSize()!
  if (isMobile) await page.touchscreen.tap(viewport.width / 2, viewport.height / 2)
  else await page.mouse.click(viewport.width / 2, viewport.height / 2)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.detail-art-title')).toHaveText('Pulse')
  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.hero-stage')).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(y)
})
