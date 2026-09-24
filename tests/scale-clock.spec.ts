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
  // Capture the first advancing frame inside the browser: another protocol
  // round trip can otherwise include normal animation time after resuming.
  const resumed = await canvas.evaluate((element, hiddenTime) => new Promise<{
    time: number; wallSeconds: number
  }>((resolve, reject) => {
    const resumeStart = performance.now()
    const observer = new MutationObserver(() => {
      const time = Number(element.getAttribute('data-scale-time'))
      if (time <= hiddenTime) return
      observer.disconnect()
      clearTimeout(timeout)
      resolve({ time, wallSeconds: (performance.now() - resumeStart) / 1000 })
    })
    const timeout = setTimeout(() => {
      observer.disconnect()
      reject(new Error('Scale clock did not resume within 10 seconds'))
    }, 10000)
    observer.observe(element, { attributes: true, attributeFilter: ['data-scale-time'] })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  }), hidden)
  expect(resumed.time).toBeGreaterThan(hidden)
  expect(resumed.time - hidden, `First resumed frame observed after ${resumed.wallSeconds}s`)
    .toBeLessThan(.3)

  await page.getByRole('button', { name: 'Pause motion' }).click()
  const paused = Number(await canvas.getAttribute('data-scale-time'))
  await page.waitForTimeout(500)
  expect(Number(await canvas.getAttribute('data-scale-time'))).toBe(paused)
})
