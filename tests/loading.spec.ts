import { expect, test } from '@playwright/test'

const sceneModule = /\/(?:Scene-[^/?]+\.js|src\/Scene\.tsx)(?:\?.*)?$/

test('loading stays at zero while the module is pending and does not block navigation', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(sceneModule, async route => { await gate; await route.continue() })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const meter = page.getByRole('progressbar', { name: 'Scene preparation' })
  await expect(meter).toHaveAttribute('aria-valuenow', '0')
  await page.waitForTimeout(1000)
  await expect(meter).toHaveAttribute('aria-valuenow', '0')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Work', exact: true }).click()
  await expect(meter).not.toBeVisible()
  await page.getByRole('button', { name: 'Explore Liminal', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close project' }).click()
  release()
  await expect(page.locator('.experience')).toHaveAttribute('data-loading-state', 'ready', { timeout: 60_000 })
  await page.getByRole('link', { name: 'Aether Studio home' }).click()
  await expect(meter).not.toBeVisible()
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
})

test('cold and cached preparation reaches 100 only after a rendered frame; motion changes rebuild safely', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { loadingViolations: violations })
    new MutationObserver(() => {
      const app = document.querySelector<HTMLElement>('.experience')
      if (app?.dataset.loadingState === 'ready' && app.dataset.loadingProgress === '100' &&
        document.querySelector('.scene-canvas')?.getAttribute('data-render-state') !== 'ready') {
        violations.push('100 before frame')
      }
    }).observe(document, { subtree: true, attributes: true, childList: true })
  })
  for (let visit = 0; visit < 2; visit++) {
    if (visit === 0) await page.goto('/')
    else await page.reload()
    await expect(page.locator('.experience')).toHaveAttribute('data-loading-state', 'ready', { timeout: 60_000 })
    await expect(page.locator('.scene-canvas')).toHaveAttribute('data-preparation', 'ready')
    await expect(page.locator('.experience')).toHaveAttribute('data-loading-progress', '100')
    expect(await page.evaluate(() => Reflect.get(window, 'loadingViolations'))).toEqual([])
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.experience')).toHaveClass(/motion-paused/)
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  await expect(page.locator('.loading-glyphs i').first()).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.scene-canvas')).toHaveCount(1)
})

test('a stalled module times out to the fallback without claiming 100 percent', async ({ page }) => {
  await page.clock.install()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(sceneModule, async route => { await gate; await route.abort() })
  await page.goto('/#work', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Explore Liminal', exact: true })).toBeVisible()
  await page.clock.fastForward(60_001)
  await expect(page.locator('.experience')).toHaveAttribute('data-loading-state', 'unavailable')
  await expect(page.locator('.experience')).toHaveAttribute('data-loading-progress', '0')
  await expect(page.getByRole('progressbar')).not.toBeVisible()
  release()
  await page.getByRole('link', { name: 'Aether Studio home' }).click()
  await expect(page.locator('.scene-fallback')).toBeVisible()
})

test('@fallback unavailable WebGL exits loading without reporting success', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.experience')).toHaveAttribute('data-loading-state', 'unavailable')
  await expect(page.locator('.experience')).not.toHaveAttribute('data-loading-progress', '100')
  await expect(page.getByRole('progressbar')).not.toBeVisible()
  await expect(page.locator('.loading-status')).toContainText('3D unavailable')
})
