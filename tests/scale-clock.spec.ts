import { expect, test } from '@playwright/test'

test('scale wave clock follows wall seconds and pauses for hidden or reduced motion', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas[data-render-state="ready"]')
  await canvas.waitFor()
  await page.evaluate(() => scrollTo({
    top: (document.documentElement.scrollHeight - innerHeight) * .83, behavior: 'instant',
  }))
  await expect.poll(async () => Number(await canvas.getAttribute('data-render-progress')))
    .toBeGreaterThan(.829)

  const start = Number(await canvas.getAttribute('data-scale-time'))
  const wallStart = performance.now()
  await page.waitForTimeout(1500)
  const advanced = Number(await canvas.getAttribute('data-scale-time'))
  const wallSeconds = (performance.now() - wallStart) / 1000
  expect(advanced - start).toBeGreaterThan(wallSeconds * .7)
  expect(advanced - start).toBeLessThan(wallSeconds + .3)

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hidden = Number(await canvas.getAttribute('data-scale-time'))
  await page.waitForTimeout(500)
  expect(Number(await canvas.getAttribute('data-scale-time'))).toBe(hidden)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(async () => Number(await canvas.getAttribute('data-scale-time')))
    .toBeGreaterThan(hidden)
  const resumed = Number(await canvas.getAttribute('data-scale-time'))
  expect(resumed - hidden).toBeLessThan(.3)

  await page.getByRole('button', { name: 'Pause motion' }).click()
  const paused = Number(await canvas.getAttribute('data-scale-time'))
  await page.waitForTimeout(500)
  expect(Number(await canvas.getAttribute('data-scale-time'))).toBe(paused)
})
