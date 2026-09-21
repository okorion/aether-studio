import { expect, test, type Page } from '@playwright/test'
import { build } from 'vite'
import type {} from './fixtures/interaction-harness'

declare global {
  interface Window {
    cameraTestFrames: number
    cameraTestFrozen: boolean
  }
}

async function readyScene(page: Page) {
  await page.goto('/')
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
}

async function settledScene(page: Page) {
  const expectedProgress = await page.evaluate(() =>
    scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight),
  )
  await expect.poll(async () => {
    const rendered = await page.locator('.scene-canvas').getAttribute('data-render-progress')
    return rendered === null ? Infinity : Math.abs(Number(rendered) - expectedProgress)
  }, { timeout: process.env.CI ? 15_000 : 10_000 }).toBeLessThan(.0005)
  const snapshot = await page.locator('.scene-canvas').evaluate((canvas) => {
    const data = (canvas as HTMLCanvasElement).dataset
    return {
      cameraY: Number(data.cameraY),
      targetY: Number(data.targetY),
      modelY: Number(data.modelY),
      viewAzimuth: Number(data.viewAzimuth),
      structureYaw: Number(data.structureYaw),
      ringRoll: Number(data.ringRoll),
      chainPhase: Number(data.chainPhase),
      chamberY: Number(data.chamberY),
    }
  })
  for (const value of Object.values(snapshot)) expect(Number.isFinite(value)).toBe(true)
  return snapshot
}

test('wheel input descends and reverses before 24 settled scroll checkpoints', async ({
  page,
}) => {
  await readyScene(page)
  const startingView = await settledScene(page)
  let previous = startingView
  for (let input = 0; input < 3; input++) {
    const beforeScroll = await page.evaluate(() => scrollY)
    await page.mouse.wheel(0, 900)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeScroll)
    const next = await settledScene(page)
    expect(next.cameraY).toBeLessThan(previous.cameraY - .01)
    expect(next.targetY).toBeLessThan(previous.targetY - .01)
    expect(Math.abs(next.modelY - next.targetY)).toBeLessThan(.001)
    previous = next
  }
  expect(Math.abs(previous.viewAzimuth - startingView.viewAzimuth)).toBeGreaterThan(.01)
  await page.mouse.wheel(0, -2700)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(1)
  const restored = await settledScene(page)
  expect(Math.abs(restored.cameraY - startingView.cameraY)).toBeLessThan(.05)
  expect(Math.abs(restored.targetY - startingView.targetY)).toBeLessThan(.05)

  // Scroll still renders the exact requested state with motion paused. This
  // checks all 24 real scene transforms without 24 software-animation waits.
  await page.getByRole('button', { name: 'Pause motion' }).click()
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
  const expectedStages = [
    'entry', 'entry', 'entry', 'statement', 'statement', 'statement',
    'work', 'work', 'work', 'work', 'work', 'work', 'work', 'work', 'work',
    'machine', 'machine', 'machine', 'scales', 'scales', 'scales',
    'contact', 'contact', 'contact',
  ]
  let previousHeight = startingView.targetY
  let fixedChamberY: number | undefined
  for (let index = 0; index < 24; index++) {
    const fraction = index / 23
    await page.evaluate(
      (progress) =>
        window.scrollTo({
          top: (document.documentElement.scrollHeight - innerHeight) * progress,
          behavior: 'instant',
        }),
      fraction,
    )
    await expect(page.locator('.hero-stage')).toHaveAttribute('data-stage', expectedStages[index])
    await expect(page.locator('.hero-stage')).toHaveAttribute('data-step', String(index + 1))
    await expect(page.locator('.scene-canvas')).toBeInViewport()
    await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
    const rendered = await settledScene(page)
    expect(Math.abs(rendered.modelY - rendered.targetY)).toBeLessThan(.001)
    expect(rendered.targetY).toBeLessThanOrEqual(previousHeight + .001)
    expect(Math.abs(rendered.ringRoll)).toBeLessThan(.001)
    fixedChamberY ??= rendered.chamberY
    expect(Math.abs(rendered.chamberY - fixedChamberY)).toBeLessThan(.001)
    previousHeight = rendered.targetY
    for (const axis of ['x', 'y']) {
      const value = await page.locator('.scene-canvas').getAttribute(`data-focus-${axis}`)
      expect(value).not.toBeNull()
      const centre = Number(value)
      expect(Math.abs(centre)).toBeLessThan(.001)
    }
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
    window.cameraTestFrozen = true
    window.requestAnimationFrame = (callback) =>
      request((timestamp) => {
        window.cameraTestFrames++
        callback(window.cameraTestFrozen ? 1000 : timestamp)
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
  await page.mouse.move(900, 380, { steps: 8 })
  await expect(canvas).toHaveAttribute('data-camera-mode', 'orbit')
  await expect(page.locator('html')).toHaveClass(/scene-dragging/)
  // Allow the temporary click light to expire, leaving only the camera change.
  await expect
    // This counts render frames, not input latency. Linux SwiftShader delivered
    // 32–43 frames in 10s; retain the same 80-frame visual proof on that runner.
    .poll(() => page.evaluate(() => window.cameraTestFrames), {
      timeout: process.env.CI ? 45_000 : 10_000,
    })
    .toBeGreaterThan(framesBefore + 80)
  const held = await page.screenshot({ clip: region })
  expect(held.equals(before)).toBe(false)
  await test.info().attach('camera-before', { body: before, contentType: 'image/png' })
  await test.info().attach('camera-held', { body: held, contentType: 'image/png' })
  await page.mouse.move(950, 440, { steps: 8 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
  await expect(page.locator('html')).not.toHaveClass(/scene-dragging/)
  // A pause rebuilds GPU resources, but must preserve the selected orbit.
  const releaseFrames = await page.evaluate(() => window.cameraTestFrames)
  await expect.poll(() => page.evaluate(() => window.cameraTestFrames), {
    timeout: process.env.CI ? 45_000 : 10_000,
  }).toBeGreaterThan(releaseFrames + 80)
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-orbit-yaw'))))
    .toBeGreaterThan(.2)
  const chosenYaw = Number(await canvas.getAttribute('data-orbit-yaw'))
  await page.getByRole('button', { name: 'Pause motion' }).click()
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-orbit-yaw')) - chosenYaw))
    .toBeLessThan(.08)
  await page.getByRole('button', { name: 'Motion reduced' }).click()
  await expect(canvas).toHaveAttribute('data-render-state', 'ready')
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-orbit-yaw')) - chosenYaw))
    .toBeLessThan(.08)
  await page.evaluate(() => {
    window.cameraTestFrozen = false
    window.scrollTo({
      top: (document.documentElement.scrollHeight - innerHeight) * .45,
      behavior: 'instant',
    })
  })
  const spineView = await settledScene(page)
  await expect(canvas).toHaveAttribute('data-orbit-enabled', 'false')
  const spineYaw = Number(await canvas.getAttribute('data-orbit-yaw'))
  await page.mouse.move(850, 340)
  await page.mouse.down()
  await page.mouse.move(1150, 410, { steps: 8 })
  await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
  await expect(page.locator('html')).not.toHaveClass(/scene-dragging/)
  await page.mouse.up()
  const lockedFrames = await page.evaluate(() => window.cameraTestFrames)
  await expect.poll(() => page.evaluate(() => window.cameraTestFrames), {
    timeout: process.env.CI ? 15_000 : 10_000,
  }).toBeGreaterThan(lockedFrames + 15)
  const retainedSpineView = await settledScene(page)
  expect(Math.abs(retainedSpineView.viewAzimuth - spineView.viewAzimuth)).toBeLessThan(.01)
  expect(Math.abs(Number(await canvas.getAttribute('data-orbit-yaw')) - spineYaw)).toBeLessThan(.001)
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

test('@interaction device and late scales reject pointer camera input until the lower ring', async ({ page }) => {
  // Several sequential scenes and input types are checked in software WebGL.
  // Linux CI reached its previous 90s total budget while still making progress.
  test.setTimeout(process.env.CI ? 150_000 : 60_000)
  await readyScene(page)
  const canvas = page.locator('.scene-canvas')
  const moveToProgress = async (progress: number) => {
    const expected = await page.evaluate((fraction) => {
      const maximum = document.documentElement.scrollHeight - innerHeight
      window.scrollTo({ top: maximum * fraction, behavior: 'instant' })
      return (scrollY / maximum).toFixed(6)
    }, progress)
    // The stricter camera comparison needs the exact settled render position,
    // not just the same chapter or the previous .0005 progress tolerance.
    await expect(canvas).toHaveAttribute('data-render-progress', expected, {
      timeout: process.env.CI ? 15_000 : 10_000,
    })
    return settledScene(page)
  }
  const freshCamera = async () => {
    const before = Number(await canvas.getAttribute('data-render-frame'))
    // Wait for the next actual telemetry sample rather than adding a whole
    // 15-frame interval after every action on the software renderer.
    await expect.poll(async () => Number(await canvas.getAttribute('data-render-frame')), {
      timeout: process.env.CI ? 15_000 : 10_000,
    }).toBeGreaterThan(before)
    return settledScene(page)
  }
  const unchangedCamera = async (before: Awaited<ReturnType<typeof settledScene>>) => {
    const after = await freshCamera()
    expect(Math.abs(after.viewAzimuth - before.viewAzimuth)).toBeLessThan(.0002)
    expect(Math.abs(after.cameraY - before.cameraY)).toBeLessThan(.0002)
    expect(Math.abs(after.targetY - before.targetY)).toBeLessThan(.0002)
  }

  for (const progress of [.72, .83, .90, .95]) {
    const before = await moveToProgress(progress)
    await expect(canvas).toHaveAttribute('data-orbit-enabled', 'false')
    const savedYaw = Number(await canvas.getAttribute('data-orbit-yaw'))
    await page.mouse.move(1100, 340)
    await unchangedCamera(before)
    await page.mouse.down()
    await page.mouse.move(400, 390, { steps: 4 })
    await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
    await expect(page.locator('html')).not.toHaveClass(/scene-dragging/)
    await unchangedCamera(before)
    await page.mouse.up()
    await page.mouse.dblclick(1100, 340)
    await unchangedCamera(before)
    expect(Math.abs(Number(await canvas.getAttribute('data-orbit-yaw')) - savedYaw)).toBeLessThan(.0002)
  }

  const lowerRing = await moveToProgress(1)
  await expect(canvas).toHaveAttribute('data-orbit-enabled', 'true')
  await page.mouse.move(1100, 340)
  await page.mouse.down()
  await page.mouse.move(650, 370, { steps: 4 })
  await expect(canvas).toHaveAttribute('data-camera-mode', 'orbit')
  const turned = await freshCamera()
  expect(Math.abs(turned.viewAzimuth - lowerRing.viewAzimuth)).toBeGreaterThan(.2)

  // Returning into the visible scale curtain cancels an already-held drag.
  const lockedAgain = await moveToProgress(.95)
  await expect(canvas).toHaveAttribute('data-orbit-enabled', 'false')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'idle')
  await expect(page.locator('html')).not.toHaveClass(/scene-dragging/)
  const retainedYaw = Number(await canvas.getAttribute('data-orbit-yaw'))
  await page.mouse.move(1000, 420, { steps: 4 })
  await unchangedCamera(lockedAgain)
  await page.mouse.up()
  await page.mouse.dblclick(1100, 340)
  await unchangedCamera(lockedAgain)
  expect(Math.abs(Number(await canvas.getAttribute('data-orbit-yaw')) - retainedYaw)).toBeLessThan(.0002)
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

  test('movement leaves a trail after 1.6 seconds and completely fades by 3 seconds', async ({
    page,
  }) => {
    const baseline = await page.evaluate(() => window.interactionHarness.step(0))
    expect(baseline.illuminatedPixels).toBe(0)
    await page.mouse.move(180, 210)
    await page.mouse.move(440, 290, { steps: 12 })
    const active = await page.evaluate(() => window.interactionHarness.step(0.15))
    expect(active.illuminatedPixels).toBeGreaterThan(20)
    const lingering = await page.evaluate(() => window.interactionHarness.step(1.45))
    expect(lingering.illuminatedPixels).toBeGreaterThan(0)
    const faded = await page.evaluate(() => window.interactionHarness.step(1.4))
    expect(faded.illuminatedPixels).toBe(0)
  })

  test('drag retains its viewpoint after release, cancel, blur, and hidden tab; double click resets', async ({
    page,
  }) => {
    for (const ending of ['pointerup', 'pointercancel', 'blur', 'hidden'] as const) {
      await page.evaluate(() => window.interactionHarness.reset())
      await page.mouse.move(300, 220)
      await page.mouse.down()
      await page.mouse.move(500, 130, { steps: 6 })
      const orbit = await page.evaluate(() => window.interactionHarness.step(0.8))
      expect(orbit.yaw).toBeLessThan(-0.2)
      expect(orbit.pitch).toBeGreaterThan(0.1)
      expect(orbit.zoom).toBe(0)
      await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'orbit')
      await page.evaluate((ending) => {
        if (ending === 'hidden') {
          Object.defineProperty(document, 'hidden', { value: true, configurable: true })
          document.dispatchEvent(new Event('visibilitychange'))
          Reflect.deleteProperty(document, 'hidden')
        } else window.dispatchEvent(new Event(ending))
      }, ending)
      await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'idle')
      const settled = await page.evaluate(() => window.interactionHarness.step(3))
      expect(settled.yaw).toBeLessThan(-0.2)
      expect(settled.pitch).toBeGreaterThan(0.1)
      expect(settled.zoom).toBe(0)
      const retained = await page.evaluate(() => window.interactionHarness.step(3))
      expect(Math.abs(retained.yaw - settled.yaw)).toBeLessThan(0.001)
      await page.mouse.up()
      await page.mouse.dblclick(320, 200)
      const reset = await page.evaluate(() => window.interactionHarness.step(4))
      expect(Math.abs(reset.yaw)).toBeLessThan(0.001)
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
    await page.locator('#interaction-canvas').dispatchEvent('pointerdown', {
      pointerType: 'touch',
      button: 0,
      pointerId: 2,
      clientX: 300,
      clientY: 200,
    })
    await page.locator('#interaction-canvas').dispatchEvent('pointermove', {
      pointerType: 'touch',
      pointerId: 2,
      clientX: 450,
      clientY: 220,
    })
    await page.getByRole('button', { name: 'UI control' }).dispatchEvent('pointerdown', {
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

  test('orbit locks preserve the chosen view and mechanical scroll can stop and reverse', async ({ page }) => {
    const lockedBoundaries = await page.evaluate(() =>
      [.235, .24, .45, .72, .83, .86, .89, .90, .94, .95, .96]
        .map((progress) => window.interactionHarness.sampleJourney(progress)),
    )
    for (const state of lockedBoundaries) {
      expect(state.orbitEnabled).toBe(false)
      expect(state.orbitWeight).toBe(0)
    }
    const returningOrbit = await page.evaluate(() =>
      [0, .97, 1].map((progress) => window.interactionHarness.sampleJourney(progress)),
    )
    for (const state of returningOrbit) {
      expect(state.orbitEnabled).toBe(true)
      expect(state.orbitWeight).toBeGreaterThan(0)
    }
    expect(returningOrbit[2].orbitWeight).toBe(1)
    for (let turn = 0; turn < 4; turn++) {
      await page.mouse.move(540, 220)
      await page.mouse.down()
      await page.mouse.move(150, 220, { steps: 8 })
      await page.evaluate(() => window.interactionHarness.step(.5))
      await page.mouse.up()
      await page.evaluate(() => window.interactionHarness.step(2))
    }
    const orbit = await page.evaluate(() => window.interactionHarness.step(2))
    expect(orbit.yaw).toBeGreaterThan(Math.PI * 2)
    expect(Math.abs(orbit.pitch)).toBeLessThan(.001)
    expect(orbit.zoom).toBe(0)
    await page.mouse.move(320, 240)
    await page.mouse.move(420, 280, { steps: 6 })
    const trace = await page.evaluate(() => window.interactionHarness.step(.15))
    expect(trace.illuminatedPixels).toBeGreaterThan(20)

    // Disable orbit while held, then try movement, a new drag, and double click.
    // None may queue a hidden yaw change; pointer trails must still be allowed.
    const retained = await page.evaluate(() => window.interactionHarness.step(4))
    await page.mouse.down()
    await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'orbit')
    await page.evaluate(() => window.interactionHarness.setOrbitEnabled(false))
    await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'idle')
    await expect(page.locator('html')).not.toHaveClass(/scene-dragging/)
    await page.mouse.move(160, 190, { steps: 6 })
    await page.mouse.up()
    await page.mouse.down()
    await page.mouse.move(460, 250, { steps: 6 })
    await page.mouse.up()
    await page.mouse.dblclick(320, 240)
    const locked = await page.evaluate(() => window.interactionHarness.step(.15))
    expect(Math.abs(locked.yaw - retained.yaw)).toBeLessThan(.001)
    expect(Math.abs(locked.pitch - retained.pitch)).toBeLessThan(.001)
    expect(locked.illuminatedPixels).toBeGreaterThan(20)
    await page.evaluate(() => window.interactionHarness.setOrbitEnabled(true))
    const unlocked = await page.evaluate(() => window.interactionHarness.step(4))
    expect(Math.abs(unlocked.yaw - retained.yaw)).toBeLessThan(.001)
    await page.mouse.move(460, 240)
    await page.mouse.down()
    await page.mouse.move(300, 240, { steps: 6 })
    const newOrbit = await page.evaluate(() => window.interactionHarness.step(.5))
    expect(newOrbit.yaw).toBeGreaterThan(unlocked.yaw + .2)
    await page.mouse.up()

    // These are the actual InstancedMesh matrices, not another copy of the
    // phase formula. Time advances independently of the scroll position.
    const first = await page.evaluate(() => window.interactionHarness.sampleWorld(10, .4))
    const idle = await page.evaluate(() => window.interactionHarness.sampleWorld(12, .4))
    expect(idle).toEqual(first)
    const forward = await page.evaluate(() => window.interactionHarness.sampleWorld(12, .43))
    expect(forward.chain).not.toEqual(first.chain)
    expect(Math.abs(forward.structureYaw - first.structureYaw)).toBeGreaterThan(.01)
    expect(forward.modelY).toBeLessThan(first.modelY - .01)
    expect(forward.chamberY).toBeCloseTo(first.chamberY, 8)
    const reverse = await page.evaluate(() => window.interactionHarness.sampleWorld(15, .4))
    expect(reverse).toEqual(first)
  })
})
