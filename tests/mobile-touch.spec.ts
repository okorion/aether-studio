import { scrollToProgress } from './scroll'
import { expect, test } from '@playwright/test'

test('native touch pans retain forest and scale response without orbiting or blocking scroll', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Native mobile gesture verification')
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const canvas = page.locator('.scene-canvas')
  await expect(page.locator('.experience')).toHaveAttribute('data-loading-state', 'ready', { timeout: 60_000 })
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', y = 500) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: 125, y, id: 1 }],
  })
  for (const progress of [.03, .84, .97]) {
    await scrollToProgress(page, progress)
    await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-render-progress')) - progress)).toBeLessThan(.002)
    const before = await page.evaluate(() => scrollY)
    const yaw = Number(await canvas.getAttribute('data-orbit-yaw'))
    await send('touchStart')
    await page.waitForTimeout(30)
    await send('touchEnd')
    await expect.poll(async () => Number(await canvas.getAttribute('data-pointer-strength'))).toBeGreaterThan(.02)
    await send('touchStart')
    for (let i = 1; i <= 8; i++) {
      await send('touchMove', 500 - i * 24)
      await page.waitForTimeout(35)
    }
    await send('touchEnd')
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50)
    expect(Number(await canvas.getAttribute('data-orbit-yaw'))).toBeCloseTo(yaw, 3)
  }
  expect(errors).toEqual([])
})
