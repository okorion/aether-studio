import { expect, test, type Page } from '@playwright/test'
import { build } from 'vite'
import type {} from './fixtures/interaction-harness'

declare global {
  interface Window {
    cameraTestFrames: number
  }
}

async function readyScene(page: Page) {
  await page.goto('/')
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
}

test('five scroll checkpoints keep the immersive scene visible and content views separate', async ({
  page,
}) => {
  await readyScene(page)
  const expectedStages = ['entry', 'work', 'work', 'machine', 'contact']
  for (const [index, fraction] of [0, 0.25, 0.5, 0.75, 1].entries()) {
    await page.evaluate(
      (progress) =>
        window.scrollTo({
          top: (document.documentElement.scrollHeight - innerHeight) * progress,
          behavior: 'instant',
        }),
      fraction,
    )
    await expect(page.locator('.hero-stage')).toHaveAttribute('data-stage', expectedStages[index])
    await expect(page.locator('.scene-canvas')).toBeInViewport()
    await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
    await expect(page.locator('#work')).toBeHidden()
    await expect(page.locator('#contact')).toBeHidden()
    const sizes = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(sizes.document).toBeLessThanOrEqual(sizes.width)
  }
  await page.getByRole('link', { name: 'Start a conversation' }).click()
  await expect(page.locator('.experience')).toHaveAttribute('data-view', 'contact')
  await page.goBack()
  await expect(page.locator('.experience')).toHaveAttribute('data-view', 'home')
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await page.goForward()
  await expect(page.locator('.experience')).toHaveAttribute('data-view', 'contact')
  await page.goto('/#work')
  await expect(page.locator('#work')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Worlds worth entering.' })).toBeInViewport()
})

test('@interaction production scene accepts background drag and excludes navigation buttons', async ({
  page,
}) => {
  // Freeze ambient animation time while allowing input and camera interpolation
  // to render. A changed image can then be attributed to the held camera.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window)
    window.cameraTestFrames = 0
    window.requestAnimationFrame = (callback) =>
      request(() => {
        window.cameraTestFrames++
        callback(1000)
      })
  })
  await readyScene(page)
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  })
  const canvas = page.locator('.scene-canvas')
  await page.mouse.move(1100, 350)
  await page.waitForTimeout(250)
  // Exclude the pointer's trail/burst area from the comparison.
  const region = { x: 80, y: 100, width: 650, height: 650 }
  const before = await page.screenshot({ clip: region })
  expect(await page.screenshot({ clip: region })).toEqual(before)
  const framesBefore = await page.evaluate(() => window.cameraTestFrames)
  await page.mouse.down()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'orbit')
  await expect(page.locator('html')).toHaveClass(/scene-dragging/)
  // Allow the temporary click light to expire, leaving only the camera change.
  await expect
    .poll(() => page.evaluate(() => window.cameraTestFrames))
    .toBeGreaterThan(framesBefore + 80)
  const held = await page.screenshot({ clip: region })
  expect(held.equals(before)).toBe(false)
  await test.info().attach('camera-before', { body: before, contentType: 'image/png' })
  await test.info().attach('camera-held', { body: held, contentType: 'image/png' })
  await page.mouse.move(950, 440, { steps: 8 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
  await expect(page.locator('html')).not.toHaveClass(/scene-dragging/)
  const sound = page.getByRole('button', { name: 'Enable ambient sound' })
  const bounds = await sound.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.down()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
  await page.mouse.up()
  await page.getByRole('navigation').getByRole('link', { name: 'Work', exact: true }).click()
  await page.mouse.move(700, 300)
  await page.mouse.down()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
  await page.mouse.up()
})

test.describe('@interaction isolated rendered trail and input lifecycle', () => {
  let harnessCode = ''

  test.beforeAll(async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: {
          entry: 'tests/fixtures/interaction-harness.ts',
          formats: ['iife'],
          name: 'InteractionFixture',
        },
      },
    })
    const bundles = Array.isArray(output) ? output : [output]
    const chunk = bundles
      .flatMap((result) => ('output' in result ? result.output : []))
      .find((item) => item.type === 'chunk')
    if (!chunk || chunk.type !== 'chunk') throw new Error('Interaction harness did not compile')
    harnessCode = chunk.code
  })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 480 })
    await page.goto('about:blank')
    await page.setContent(
      '<body style="margin:0"><button style="position:fixed;left:5px;top:5px">UI control</button></body>',
    )
    await page.addScriptTag({ content: harnessCode })
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => window.interactionHarness?.dispose())
  })

  test('movement produces luminous trail pixels that completely fade while idle', async ({
    page,
  }) => {
    const baseline = await page.evaluate(() => window.interactionHarness.step(0))
    expect(baseline.illuminatedPixels).toBe(0)
    await page.mouse.move(180, 210)
    await page.mouse.move(440, 290, { steps: 12 })
    const active = await page.evaluate(() => window.interactionHarness.step(0.15))
    expect(active.illuminatedPixels).toBeGreaterThan(20)
    const faded = await page.evaluate(() => window.interactionHarness.step(1.6))
    expect(faded.illuminatedPixels).toBe(0)
  })

  test('hold and drag changes the orbit, then cancel, blur, and hidden tab restore it', async ({
    page,
  }) => {
    for (const ending of ['pointercancel', 'blur', 'hidden'] as const) {
      await page.evaluate(() => window.interactionHarness.reset())
      await page.mouse.move(300, 220)
      await page.mouse.down()
      await page.mouse.move(500, 130, { steps: 6 })
      const orbit = await page.evaluate(() => window.interactionHarness.step(0.8))
      expect(orbit.yaw).toBeGreaterThan(0.2)
      expect(orbit.pitch).toBeGreaterThan(0.1)
      expect(orbit.zoom).toBeGreaterThan(0.8)
      await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'orbit')
      await page.evaluate((ending) => {
        if (ending === 'hidden') {
          Object.defineProperty(document, 'hidden', { value: true, configurable: true })
          document.dispatchEvent(new Event('visibilitychange'))
          Reflect.deleteProperty(document, 'hidden')
        } else window.dispatchEvent(new Event(ending))
      }, ending)
      await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'idle')
      const restored = await page.evaluate(() => window.interactionHarness.step(3))
      expect(Math.abs(restored.yaw)).toBeLessThan(0.001)
      expect(Math.abs(restored.pitch)).toBeLessThan(0.001)
      expect(restored.zoom).toBeLessThan(0.001)
      await page.mouse.up()
    }
  })

  test('reduced motion, touch input, and UI controls never begin an orbit or trail', async ({
    page,
  }) => {
    await page.evaluate(() => window.interactionHarness.reset(true))
    await page.mouse.move(320, 240)
    await page.mouse.down()
    await page.mouse.move(480, 160, { steps: 4 })
    const reduced = await page.evaluate(() => window.interactionHarness.step(0.5))
    expect(reduced).toEqual({ yaw: 0, pitch: 0, zoom: 0, burst: 0, illuminatedPixels: 0 })
    await page.mouse.up()
    await page.evaluate(() => window.interactionHarness.reset())
    await page
      .locator('#interaction-canvas')
      .dispatchEvent('pointerdown', {
        pointerType: 'touch',
        button: 0,
        pointerId: 2,
        clientX: 300,
        clientY: 200,
      })
    await page
      .locator('#interaction-canvas')
      .dispatchEvent('pointermove', {
        pointerType: 'touch',
        pointerId: 2,
        clientX: 450,
        clientY: 220,
      })
    await page
      .getByRole('button', { name: 'UI control' })
      .dispatchEvent('pointerdown', {
        pointerType: 'mouse',
        button: 0,
        pointerId: 1,
        clientX: 20,
        clientY: 15,
      })
    const excluded = await page.evaluate(() => window.interactionHarness.step(0.5))
    expect(excluded).toEqual({ yaw: 0, pitch: 0, zoom: 0, burst: 0, illuminatedPixels: 0 })
    await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'idle')
  })
})
