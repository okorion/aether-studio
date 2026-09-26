import { expect, test, type Page } from '@playwright/test'
import { build } from 'vite'
import { SCALE_WAVE_INTERVAL_SECONDS, SCALE_WAVE_TRAVEL_SECONDS } from '../src/SceneScaleSurface'
import type {} from './fixtures/interaction-harness'
import { scrollToProgress } from './scroll'
import { scrollToScene } from '../src/ScrollTimeline'
import { sampleJourney } from '../src/Journey'
import { sampleScaleOffset, SCALE_CEILING_Y } from '../src/ScaleStage'

declare global {
  interface Window {
    cameraTestFrames: number
    cameraTestFrozen: boolean
    cameraTestMediaPending: number
    cameraTestCapture?: () => void
  }
}

async function readyScene(page: Page) {
  await page.goto('/')
  // CI compiles all warm-up shader variants with software WebGL before the
  // first frame. Give that one-time preparation its own bounded wait.
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready', {
    timeout: process.env.CI ? 30_000 : 10_000,
  })
}

async function settledScene(page: Page) {
  const expectedProgress = scrollToScene(await page.evaluate(() =>
    scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight),
  ))
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
      forestYaw: Number(data.forestYaw),
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
  // This journey includes two GPU preparations and 24 settled views. Keep
  // individual action limits while allowing their measured cumulative cost.
  test.setTimeout(process.env.CI ? 90_000 : 60_000)
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
  expect(Math.abs(previous.forestYaw - startingView.forestYaw)).toBeGreaterThan(.01)
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
    'statement', 'statement', 'work', 'work', 'work', 'work', 'work', 'work', 'work',
    'machine', 'machine', 'scales', 'scales', 'scales', 'scales',
    'contact', 'contact', 'contact',
  ]
  let previousHeight = startingView.targetY
  let fixedChamberY: number | undefined
  for (let index = 0; index < 24; index++) {
    const fraction = index / 23
    await scrollToProgress(page, fraction)
    await expect(page.locator('.hero-stage')).toHaveAttribute('data-stage', expectedStages[index])
    await expect(page.locator('.hero-stage')).toHaveAttribute('data-step', String(index + 1))
    await expect(page.locator('.scene-canvas')).toBeInViewport()
    await expect(page.locator('.scene-canvas')).toHaveAttribute('data-render-state', 'ready')
    const rendered = await settledScene(page)
    if (expectedStages[index] === 'scales') {
      // Canvas text is aria-hidden: the active DOM equivalent must remain in
      // the accessibility tree even when its visual presentation is transparent.
      expect(await page.locator('.journey-scales').ariaSnapshot()).toContain('MATTER / IN CONSTANT CHANGE')
      await expect(page.locator('.journey-scales')).toHaveCSS('opacity', '0')
    }
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
  // Two full GPU rebuilds and 175+ render frames exceeded the old total 45s
  // budget; each frame wait and input action retains its existing timeout.
  test.setTimeout(process.env.CI ? 150_000 : 75_000)
  // Freeze ambient animation time while allowing input and camera interpolation
  // to render. A changed image can then be attributed to the held camera.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window)
    window.cameraTestFrames = 0
    window.cameraTestFrozen = true
    window.cameraTestMediaPending = 0
    // GPU renderers also project real video. Hold its first decoded frame so
    // the exact-pixel camera assertion does not compare different film frames.
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (!window.cameraTestFrozen) return play.call(this)
      window.cameraTestMediaPending++
      return play.call(this).then(() => { this.pause() }).finally(() => {
        window.cameraTestMediaPending--
      })
    }
    window.requestAnimationFrame = (callback) =>
      request((timestamp) => {
        window.cameraTestFrames++
        const capture = window.cameraTestCapture
        const beforeFrame = capture ? document.querySelector('.scene-canvas')?.getAttribute('data-render-frame') : null
        callback(window.cameraTestFrozen ? 1000 : timestamp)
        if (capture && beforeFrame !== document.querySelector('.scene-canvas')?.getAttribute('data-render-frame')) capture()
      })
  })
  await readyScene(page)
  await expect(page.locator('.scene-loading')).toHaveAttribute('data-state', 'ready')
  await expect.poll(() => page.evaluate(() => window.cameraTestMediaPending)).toBe(0)
  const readyFrames = await page.evaluate(() => window.cameraTestFrames)
  await expect.poll(() => page.evaluate(() => window.cameraTestFrames)).toBeGreaterThan(readyFrames + 6)
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  })
  const canvas = page.locator('.scene-canvas')
  // Exclude the pointer's trail/burst area from the comparison.
  const region = { x: 80, y: 100, width: 650, height: 650 }
  const captureCamera = async () => {
    // Read the completed production WebGL frame before presentation clears its
    // buffer. This avoids the Linux CDP frozen-frame capture stall while keeping
    // the actual scene, crop, frozen clock, and strict pixel equality intact.
    const png = await page.evaluate((crop) => new Promise<string>((resolve, reject) => {
      const surface = document.querySelector<HTMLCanvasElement>('.scene-canvas')!
      const previousFrame = surface.dataset.renderFrame
      const timer = window.setTimeout(() => {
        window.cameraTestCapture = undefined
        reject(new Error('No completed WebGL frame became available for camera capture'))
      }, 15_000)
      window.cameraTestCapture = () => {
        // Scene diagnostics advance after rendering. Other RAF callbacks must
        // not capture a previously presented/cleared drawing buffer.
        if (surface.dataset.renderFrame === previousFrame) return
        window.cameraTestCapture = undefined
        clearTimeout(timer)
        try {
          const gl = surface.getContext('webgl2')!
          const bounds = surface.getBoundingClientRect()
          const ratioX = gl.drawingBufferWidth / bounds.width
          const ratioY = gl.drawingBufferHeight / bounds.height
          const x = Math.round((crop.x - bounds.x) * ratioX)
          const y = Math.round((crop.y - bounds.y) * ratioY)
          const width = Math.round(crop.width * ratioX)
          const height = Math.round(crop.height * ratioY)
          if (gl.isContextLost() || gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null)
            throw new Error('Camera capture requires a live default framebuffer')
          if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > gl.drawingBufferWidth || y + height > gl.drawingBufferHeight)
            throw new Error('Camera crop falls outside the drawing buffer')
          const pixels = new Uint8Array(width * height * 4)
          gl.readPixels(x, gl.drawingBufferHeight - y - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          if (gl.getError() !== gl.NO_ERROR || !pixels.some((value, index) => index % 4 !== 3 && value > 16))
            throw new Error('Camera capture returned invalid or empty scene pixels')
          const output = document.createElement('canvas')
          output.width = width; output.height = height
          const context = output.getContext('2d')!
          const image = context.createImageData(width, height)
          for (let row = 0; row < height; row++)
            image.data.set(pixels.subarray((height - 1 - row) * width * 4, (height - row) * width * 4), row * width * 4)
          context.putImageData(image, 0, 0)
          resolve(output.toDataURL('image/png').split(',')[1])
        } catch (error) { reject(error) }
      }
    }), region)
    return Buffer.from(png, 'base64')
  }
  const before = await captureCamera()
  expect((await captureCamera()).equals(before), 'the frozen camera baseline must be pixel-identical').toBe(true)
  // Establish the still baseline before hover starts the damped lighting field.
  await page.mouse.move(1100, 350)
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
  const held = await captureCamera()
  expect(held.equals(before)).toBe(false)
  await test.info().attach('camera-before', { body: before, contentType: 'image/png' })
  await test.info().attach('camera-held', { body: held, contentType: 'image/png' })
  // Continue in the same direction so release momentum cannot cancel the
  // selected orbit before the pause/rebuild preservation assertions below.
  await page.mouse.move(850, 440, { steps: 8 })
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
  test.setTimeout(150_000)
  await readyScene(page)
  const canvas = page.locator('.scene-canvas')
  const moveToProgress = async (progress: number) => {
    const expected = await scrollToProgress(page, progress)
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

  // Keep browser probes inside the band: integer scroll pixels can round the
  // exact .925 boundary into the first frame of the returning orbit.
  for (const progress of [.72, .80, .90, .92]) {
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

  const lowerRing = await moveToProgress(.95)
  await expect(canvas).toHaveAttribute('data-orbit-enabled', 'true')
  await page.mouse.move(1100, 340)
  await page.mouse.down()
  await page.mouse.move(650, 370, { steps: 4 })
  await expect(canvas).toHaveAttribute('data-camera-mode', 'orbit')
  const turned = await freshCamera()
  expect(Math.abs(turned.forestYaw - lowerRing.forestYaw)).toBeGreaterThan(.2)

  // Returning into the visible scale curtain cancels an already-held drag.
  const lockedAgain = await moveToProgress(.85)
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

  test('pointer lighting survives orbit locks, decays, and clears on excluded input', async ({ page }) => {
    const result = await page.evaluate(() => {
      const harness = window.interactionHarness
      const canvas = document.getElementById('interaction-canvas')!
      const move = (target: Element = canvas, pointerType = 'mouse', x=480) => target.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerType, clientX: x, clientY: 120 }),
      )
      const activate = () => {
        harness.reset()
        harness.setOrbitEnabled(false)
        move()
        harness.stepField(1/60)
        move(canvas,'mouse',510)
        return harness.stepField(.2)
      }
      const active = activate()
      const idle = harness.stepField(3)
      const cleared = []
      for (const reason of ['ui', 'touch', 'leave', 'cancel', 'blur', 'hidden', 'hash', 'dialog']) {
        const before = activate()
        let dialog: HTMLDialogElement | undefined
        if (reason === 'ui') move(document.querySelector('button')!)
        if (reason === 'touch') move(canvas, 'touch')
        if (reason === 'leave') document.dispatchEvent(new Event('pointerleave'))
        if (reason === 'cancel') canvas.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}))
        if (reason === 'blur') window.dispatchEvent(new Event('blur'))
        if (reason === 'hidden') {
          Object.defineProperty(document, 'hidden', { value: true, configurable: true })
          document.dispatchEvent(new Event('visibilitychange'))
        }
        if (reason === 'hash') {
          history.replaceState(null, '', '#work')
          window.dispatchEvent(new HashChangeEvent('hashchange'))
        }
        if (reason === 'dialog') {
          dialog = document.createElement('dialog')
          document.body.appendChild(dialog)
          dialog.showModal()
        }
        const after = harness.stepField(.1)
        cleared.push({ reason, before, after, settled: harness.stepField(3) })
        if (reason === 'hidden') Reflect.deleteProperty(document, 'hidden')
        if (reason === 'hash') {
          history.replaceState(null, '', '#home')
          window.dispatchEvent(new HashChangeEvent('hashchange'))
        }
        dialog?.close()
        dialog?.remove()
      }
      harness.reset(true)
      move()
      return { active, idle, cleared, reduced: harness.stepField(.2) }
    })
    expect(result.active.strength).toBeGreaterThan(.4)
    expect(result.active.active).toBe(true)
    expect(result.active.flowEnergy).toBeGreaterThan(0)
    expect(result.idle.flowEnergy).toBe(0)
    expect(result.reduced.flowEnergy).toBe(0)
    for(const entry of result.cleared){
      expect(entry.before.flowEnergy,entry.reason).toBeGreaterThan(0)
      if (entry.reason === 'leave' || entry.reason === 'blur') {
        expect(entry.after.flowEnergy, entry.reason).toBeGreaterThan(0)
        expect(entry.settled.flowEnergy, entry.reason).toBe(0)
      } else expect(entry.after.flowEnergy,entry.reason).toBe(0)
    }
    expect(result.active.strength).toBeLessThanOrEqual(1)
    expect(result.active.ndc[0]).toBeGreaterThan(.4)
    expect(result.active.ndc[1]).toBeGreaterThan(.4)
    expect(result.active.aspect).toBeCloseTo(4 / 3)
    expect(result.active.yaw).toBe(0)
    expect(result.active.pitch).toBe(0)
    expect(result.idle.strength).toBeLessThan(result.active.strength / 10)
    for (const sample of result.cleared) {
      expect(sample.after.active, sample.reason).toBe(false)
      expect(sample.before.strength, sample.reason).toBeGreaterThan(.4)
      if (sample.reason === 'leave' || sample.reason === 'blur') {
        expect(sample.after.strength, sample.reason).toBeGreaterThan(0)
        expect(sample.after.strength, sample.reason).toBeLessThan(sample.before.strength)
        expect(sample.settled.strength, sample.reason).toBeLessThan(.0001)
      } else expect(sample.after.strength, sample.reason).toBe(0)
      expect(sample.after.yaw, sample.reason).toBe(0)
    }
    expect(result.reduced.strength).toBe(0)
  })

  test('layer wipes are finite and reversible while device, floor, and scales keep separate heights', async ({ page }) => {
    const result = await page.evaluate(() => {
      const harness = window.interactionHarness
      const states = Array.from({ length: 201 }, (_, i) => harness.sampleLayers(i / 200))
      const invalid = [NaN, Infinity, -Infinity, -1].map(value => harness.sampleLayers(value))
      const first = harness.sampleEditorial(.125)
      const same = harness.sampleEditorial(.125)
      const forward = harness.sampleEditorial(.175)
      const reverse = harness.sampleEditorial(.125)
      const fixed = [.70, .76, .82, .86, .93, .82].map(progress => harness.sampleWorld(10, progress))
      return { states, invalid, end: harness.sampleLayers(2), first, same, forward, reverse, fixed }
    })
    for (const state of result.states) {
      expect(Object.values(state).every(Number.isFinite)).toBe(true)
      expect(state.statement).toBeGreaterThanOrEqual(0)
      expect(state.statement).toBeLessThanOrEqual(1)
      expect(state.scaleCopy).toBeGreaterThanOrEqual(0)
      expect(state.scaleCopy).toBeLessThanOrEqual(1)
    }
    for (const edge of ['forestExit', 'forestEntry', 'monitorEntry', 'monitorExit', 'deviceExit'] as const) {
      expect(result.states[0][edge]).toBeLessThan(0)
      expect(result.states.at(-1)![edge]).toBeGreaterThan(1)
      for (let i = 1; i < result.states.length; i++)
        expect(result.states[i][edge]).toBeGreaterThanOrEqual(result.states[i - 1][edge])
    }
    for (const invalid of result.invalid) expect(invalid).toEqual(result.states[0])
    expect(result.end).toEqual(result.states.at(-1))
    expect(result.same).toEqual(result.first)
    expect(result.forward[0].matrix).toEqual(result.first[0].matrix)
    expect(result.forward[0].inkOffset).not.toEqual(result.first[0].inkOffset)
    expect(result.reverse).toEqual(result.first)
    expect(result.first[0].visible).toBe(true)
    for (const [index, state] of result.fixed.entries()) {
      expect(state.fixed.machineY).toBeCloseTo(-40.4, 8)
      expect(state.fixed.floorY).toBeCloseTo(-43.212, 8)
      const p = [.70, .76, .82, .86, .93, .82][index]
      expect(state.fixed.scaleY).toBeCloseTo(sampleJourney(p).height + sampleScaleOffset(p), 8)
      expect(state.scaleTiles).toEqual(result.fixed[0].scaleTiles)
    }
    expect(result.fixed[0].fixed.machineVisible).toBe(true)
    expect(result.fixed[1].fixed.machineVisible).toBe(true)
    expect(result.fixed[2].fixed.machineVisible).toBe(false)
    expect(result.fixed[2].fixed.scaleVisible).toBe(true)
    expect(result.fixed[5]).toEqual(result.fixed[2])

    const surfaces = await page.evaluate(() => window.interactionHarness.probeWorldSurfaceDepth())
    const contact = surfaces.contact
    // The footing intersects the real displaced floor, and the annular lid
    // overlaps the socket while preserving the central particle passage.
    expect(contact.plinthBottom).toBeLessThan(contact.floorMin)
    expect(contact.floorMin - contact.plinthBottom).toBeLessThan(.06)
    expect(contact.floorMax - contact.floorMin).toBeGreaterThan(.02)
    expect(contact.capBottom).toBeLessThan(contact.socketTop)
    expect(contact.capTop).toBeGreaterThan(contact.socketTop)
    expect(contact.capTop).toBeCloseTo(-37.9072, 5)
    // StandardMaterial.clone resets custom defines unless explicitly restored.
    expect(contact.capFilmDefine).toBe(1)
    expect(contact.ceilingY).toBeCloseTo(contact.capTop, 5)
    expect(contact.ceilingTop - contact.ceilingY).toBeCloseTo(.18 * .76, 5)
    expect(contact.ceilingVisible).toBe(false)
    expect(contact.scaleCorePresent).toBe(false)
    expect(contact.ceilingWidth).toBeCloseTo(64, 5)
    expect(contact.undersideY).toBeCloseTo(SCALE_CEILING_Y, 5)
    expect(contact.undersideWidth).toBeCloseTo(192, 5)
    expect(surfaces.visibility[0]).toMatchObject({ machine: true, ruins: true, upperStructure: true, underside: false })
    // The partial wrapper overlap retains the upper room after the eye has
    // crossed its floor; only the shared screen edge decides its coverage.
    expect(surfaces.visibility[1]).toMatchObject({ machine: true, ruins: true, upperStructure: true })
    expect(surfaces.visibility[2]).toMatchObject({ machine: false, ruins: false, upperStructure: false, underside: true })
    expect(surfaces.visibility[2].eyeY).toBeLessThan(-44.13)
    expect(surfaces.visibility[3]).toEqual(surfaces.visibility[0])
    expect(surfaces.cases).toHaveLength(3)
    for (const surface of surfaces.cases) {
      expect(surface.effectivelyVisible, surface.name).toBe(true)
      expect(surface.depthWrite, surface.name).toBe(true)
      expect(surface.markerPixels, surface.name).toBeGreaterThan(40)
      expect(surface.checkedOccluded, surface.name).toBeGreaterThanOrEqual(40)
      expect(surface.checkedOccluded + surface.exposedMarker + surface.outsideCurtain, surface.name).toBe(surface.markerPixels)
      expect(surface.leakedPixels, `${surface.name}: depth gaps ${surface.leakedDepthGaps}`).toBe(0)
    }
  })

  test('monitors follow a reversible diagonal orbit while the central screen stays ahead of chains', async ({ page }) => {
    const result = await page.evaluate(() => window.interactionHarness.probeMonitorMotion())
    const initial = result.scroll[0]
    for (const sample of result.scroll) for (const [index, panel] of sample.entries()) {
      expect(panel.scale).toEqual(initial[index].scale)
      expect(panel.position.every(Number.isFinite)).toBe(true)
      expect(panel.quaternion.every(Number.isFinite)).toBe(true)
    }
    expect(result.scroll[1][1].quaternion).not.toEqual(initial[1].quaternion)
    expect(result.scroll[1][1].position[0]).not.toBe(initial[1].position[0])
    expect(initial.some(panel => panel.position[2] < 0)).toBe(true)
    expect(initial.some(panel => panel.position[2] > 0)).toBe(true)
    expect(result.scroll[1][1].position[1]).not.toBe(initial[1].position[1])
    expect(result.scroll.at(-1)).toEqual(initial)
    for (const sample of result.hover) {
      expect(sample.selected).toBe(sample.index)
      expect(sample.after.quaternion).toEqual(sample.before.quaternion)
      // Hover at the frontmost point expands the helix toward the eye.
      expect(sample.after.position[2] - sample.before.position[2]).toBeGreaterThan(.1)
      expect(sample.after.position[1]).toBe(sample.before.position[1])
      expect(sample.restored).toEqual(sample.before)
    }
    expect(result.chainDepth.reduce((sum, sample) => sum + sample.overlaps, 0)).toBeGreaterThan(5)
    for (const sample of result.chainDepth) {
      expect(sample.inFront, `scroll ${sample.progress}`).toBe(sample.overlaps)
      if (sample.overlaps) expect(sample.minimumGap!).toBeGreaterThan(0)
    }
  })

  test('production bone, device and scale shaders obey their own adjacent screen regions', async ({ page }) => {
    const cases = await page.evaluate(() => window.interactionHarness.probeProductionBoundaryPixels())
    expect(cases).toHaveLength(13)
    for (const result of cases) {
      const label = `${result.name} at ${result.progress}`
      expect(result.checkedOutside, label).toBeGreaterThan(1000)
      expect(result.leakedOutside, label).toBe(0)
      expect(result.missingInside, label).toBe(0)
      if (result.progress !== .82) expect(result.checkedInside, label).toBeGreaterThan(500)
      else expect(result.checkedInside, label).toBe(0)
    }
  })

  test('outgoing bone grains orbit above the chamber and retrace scroll at fixed time', async ({ page }) => {
    const result = await page.evaluate(() => window.interactionHarness.probeOutgoingBonePixels())
    expect(result.geometryShared).toBe(true)
    expect(result.flowerGeometryShared).toBe(true)
    expect(result.cases).toHaveLength(3)
    for (const sample of result.cases) {
      const label = `outgoing grains at ${sample.progress}`
      expect(sample.visibleAbove, label).toBeGreaterThan(20)
      expect(sample.changedAbove, label).toBe(0)
      expect(sample.leakedBelow, label).toBe(0)
    }
    // The later curtain cut must remove visible parts of the flower/belt field.
    expect(result.cases[2].hiddenBaseline).toBeGreaterThan(20)
    expect(result.idleChanged).toBeGreaterThan(100)
    expect(result.forwardChanged).toBeGreaterThan(100)
    expect(result.reverseChanged).toBe(0)
    expect(result.closed).toEqual([false, false])

    const transforms = await page.evaluate(() => {
      const harness = window.interactionHarness
      const first = harness.sampleWorld(10, .635)
      const idle = harness.sampleWorld(12, .635)
      const forward = harness.sampleWorld(12, .67)
      const reverse = harness.sampleWorld(15, .635)
      const exited = harness.sampleWorld(15, .70)
      return { first, idle, forward, reverse, exited }
    })
    expect(transforms.idle).toEqual(transforms.first)
    expect(transforms.reverse).toEqual(transforms.first)
    for (const state of [transforms.first, transforms.forward]) {
      expect(state.boneLocalY).toBeCloseTo(0, 8)
      expect(state.boneWorldY).toBeCloseTo(state.modelY, 8)
      expect(state.boneVisible).toBe(true)
    }
    expect(transforms.forward.boneWorldY).toBeLessThan(transforms.first.boneWorldY)
    expect(transforms.forward.vertebrae).not.toEqual(transforms.first.vertebrae)
    expect(transforms.exited.boneVisible).toBe(false)
  })

  test('screen curtains clip standard and custom shaders at the same edge without hidden depth leaks', async ({ page }) => {
    const cases = await page.evaluate(() => window.interactionHarness.probeCurtainPixels())
    expect(cases).toHaveLength(12)
    for (const result of cases) {
      const label = `${result.size.join('x')} ${result.state}`
      const area = result.size[0] * result.size[1]
      // Identical stochastic silhouettes also prove both shader-hook paths
      // use the same normalized edge at every resolution and aspect ratio.
      expect(result.maskMismatch, label).toBe(0)
      for (const sample of result.samples) {
        expect(sample.unknown, label).toBe(0)
        expect(sample.wrongInside, label).toBe(0)
        expect(sample.wrongOutside, label).toBe(0)
        expect(sample.checkedOutside, label).toBeGreaterThan(1000)
        if (result.state.startsWith('hidden')) {
          // Check EVERY pixel, including locations where the dither hash is 0.
          expect(sample.foreground, label).toBe(0)
          expect(sample.background, label).toBe(area)
          expect(sample.checkedOutside, label).toBe(area)
        } else {
          expect(sample.checkedInside, label).toBeGreaterThan(1000)
          expect(sample.foreground, label).toBeGreaterThan(1000)
          expect(sample.background, label).toBeGreaterThan(1000)
        }
      }
    }
    const emblem = await page.evaluate(() => window.interactionHarness.probeEmblemCurtainPixels())
    expect(emblem.map(result => result.progress)).toEqual([.86, .87, .895])
    for (const result of emblem) {
      const label = `end emblem at ${result.progress}`
      expect(result.baselineRingPixels, label).toBeGreaterThan(1000)
      expect(result.visibleRingPixels, label).toBeGreaterThan(500)
      expect(result.redAbove, label).toBe(0)
      expect(result.depthHoles, label).toBe(0)
      expect(result.missingBelow, label).toBe(0)
      expect(result.changedBackground, label).toBe(0)
      if (result.progress < .895) {
        // Non-vacuous: both stages would expose red geometry above the seam
        // without the real emblem mask, while some red remains below it.
        expect(result.checkedAbove, label).toBeGreaterThan(1000)
        expect(result.hiddenRingPixels, label).toBeGreaterThan(100)
      } else {
        // By .895 forestEntry has left the viewport (maximum slanted UV 1.1).
        // There is no remaining scale region to invent a hidden-pixel sample.
        expect(result.upper, label).toBeGreaterThan(1.1)
        expect(result.checkedAbove, label).toBe(0)
        expect(result.visibleRingPixels, label).toBe(result.baselineRingPixels)
      }
    }
  })

  test('scale surface pixels respond locally to pointer position and recover without CPU matrix changes', async ({ page }) => {
    expect(SCALE_WAVE_INTERVAL_SECONDS).toBe(7)
    expect(SCALE_WAVE_TRAVEL_SECONDS).toBe(3)
    const pixels = await page.evaluate(() => window.interactionHarness.probeScalePointer())
    expect(pixels.left.changed).toBeGreaterThan(10)
    expect(pixels.right.changed).toBeGreaterThanOrEqual(8)
    expect(pixels.left.changed).toBeLessThan(200)
    expect(pixels.right.changed).toBeLessThan(200)
    expect(pixels.left.centroidX).toBeLessThan(.45)
    expect(pixels.right.centroidX).toBeGreaterThan(.55)
    expect(pixels.reset.changed).toBe(0)
    expect(pixels.edge.changed).toBeLessThan(200)
    expect(pixels.edge.centroidX).toBeGreaterThan(.9)
    expect(pixels.raw.changed).toBeGreaterThan(10)
    expect(pixels.raw.centroidX).toBeLessThan(.45)
    expect(pixels.slowMove.originX).toBeGreaterThan(.3)
    expect(pixels.slowMove.age).toBeLessThan(.25)
    expect(pixels.slowMove.strength).toBeGreaterThan(.2)
    expect(pixels.wakeHistory.active.filter(w => w[3] > 0).length).toBeGreaterThan(3)
    expect(pixels.wakeHistory.afterLeave.filter(w => w[3] > 0).length).toBeGreaterThan(2)
    expect(pixels.wakeHistory.afterLeave.every(w => w[3] <= .34)).toBe(true)
    expect(pixels.wakeHistory.afterDecay.every(w => w[3] === 0)).toBe(true)
    expect(pixels.wake.changed).toBeGreaterThanOrEqual(8)
    expect(pixels.wake.centroidX).toBeLessThan(.5)
    expect(pixels.wakeReset.changed).toBe(0)
    expect(pixels.wave.changed).toBeGreaterThan(3)
    expect(pixels.middleWave.changed).toBeGreaterThan(100)
    expect(pixels.overlap.changed).toBeGreaterThan(10)
    expect(pixels.overlap.changed).toBeLessThan(200)
    expect(pixels.outerWave.changed).toBeGreaterThan(100)
    expect(pixels.edgeWave.changed).toBeGreaterThan(50)
    expect(pixels.wave.centroidRadius).toBeLessThan(pixels.middleWave.centroidRadius)
    // The side fronts overlap the centre wave instead of expanding from one origin.
    expect(pixels.middleWave.leftChanged).toBeGreaterThan(10)
    expect(pixels.outerWave.rightChanged).toBeGreaterThan(10)
    expect(pixels.rest.changed).toBe(0)
    expect(pixels.nextBeat.changed).toBeLessThan(5)
    expect(pixels.matricesUnchanged).toBe(true)
  })

  test('scale bubbles drift on GPU, freeze with scene time, and release their resources', async ({ page }) => {
    const bubbles = await page.evaluate(() => window.interactionHarness.probeScaleBubbles())
    expect(bubbles.count).toBe(52)
    expect(bubbles.movingPixels).toBeGreaterThan(0)
    expect(bubbles.frozenPixels).toBe(0)
    expect(bubbles.positionsUnchanged).toBe(true)
  })

  test('pointer ribbons and individual white motes leave no pixels in the middle scenes or beyond forest seams', async ({ page }) => {
    const cases = await page.evaluate(() => window.interactionHarness.probePointerForestPixels())
    for (const sample of cases) {
      expect(sample.together.leaked, `all effects at ${sample.progress}`).toBe(0)
      expect(sample.pointsOnly.leaked, `white motes at ${sample.progress}`).toBe(0)
      if (sample.progress >= .2 && sample.progress <= .855) {
        expect(sample.together.lit).toBe(0)
        expect(sample.pointsOnly.lit).toBe(0)
        expect(sample.motesVisible).toBe(false)
      } else {
        expect(sample.together.lit, `forest at ${sample.progress}`).toBeGreaterThan(20)
        expect(sample.pointsOnly.lit, `motes at ${sample.progress}`).toBeGreaterThan(0)
      }
    }
  })

  test('stationary device particles change pixel coverage under the pointer and exactly recover', async ({ page }) => {
    const pixels = await page.evaluate(() => window.interactionHarness.probeDevicePointer())
    expect(pixels.illuminatedPixels).toBeGreaterThan(100)
    expect(pixels.scrollSteps).toEqual([0, 0, 0])
    expect(pixels.fieldY).toBeCloseTo(-40.4, 8)
    for (const ratio of pixels.diameterRatio) expect(Math.abs(ratio - 2 / 3)).toBeLessThan(.04)
    expect(pixels.pointer.every(value => Math.abs(value) < 1)).toBe(true)
    expect(pixels.moved.changedRgbPixels).toBeGreaterThan(20)
    expect(pixels.moved.changedAlphaPixels).toBeGreaterThan(20)
    expect(pixels.moved.addedCoverage).toBeGreaterThan(6)
    expect(pixels.restored.changedBytes).toBe(0)
    expect(pixels.seedsUnchanged).toBe(true)
    expect(pixels.chamberEntry.map(entry => entry.progress)).toEqual([.635, .65, .68])
    for (const entry of pixels.chamberEntry) {
      const label = `converging grains at ${entry.progress}`
      expect(entry.wipe, label).toBe(1)
      if (entry.progress < .66) expect(entry.hiddenBaseline, label).toBeGreaterThan(20)
      expect(entry.leakedAbove, label).toBe(0)
      expect(entry.changedBelow, label).toBe(0)
    }
    // The irregular hanging tips begin to emerge with the rising wrapper.
    expect(pixels.chamberEntry[1].visibleBelow).toBeGreaterThan(0)
    expect(pixels.chamberEntry[1].visibleBelow).toBeLessThan(pixels.chamberEntry[2].visibleBelow)
    expect(pixels.chamberEntry[2].visibleBelow).toBeGreaterThan(20)
    expect(pixels.roomVisibility).toEqual([[true, false, false], [true, false, false], [false, false, false], [true, false, false]])
  })

  test('forest grains move at both endpoints and visible curtain boundaries without moving their anchors', async ({ page }) => {
    for(const progress of [0,.145,.875,.90,.98,1]) {
      const pixels=await page.evaluate(p=>window.interactionHarness.probeForestPointer(p),progress)
      expect(pixels.baseline.count,`visible forest at ${progress}`).toBeGreaterThan(25)
      expect(pixels.pointerLight).toBe(0)
      expect(pixels.moved.changed,`geometry coverage at ${progress}`).toBeGreaterThan(20)
      expect(pixels.moved.added).toBeGreaterThan(5)
      expect(pixels.restored.changed).toBe(0)
      expect(pixels.excluded.changed).toBe(0)
      expect(pixels.geometryUnchanged).toBe(true)
      expect(pixels.worldUnchanged).toBe(true)
      // The curtain may crop the moved cloud; endpoint views isolate direction.
      if(progress===0||progress===1){
        expect(pixels.right.x).toBeGreaterThan(pixels.left.x)
        expect(pixels.up.y).toBeGreaterThan(pixels.baseline.y)
      }
    }
  })

  test('glass capture uses physical target pixels and restores renderer state at high DPR', async ({ page }) => {
    for (const pixelRatio of [1.5, 2]) {
      const capture = await page.evaluate((ratio) =>
        window.interactionHarness.probeMonitorCapture(ratio, ratio === 2), pixelRatio)
      expect(capture.observed).toHaveLength(1)
      const draw = capture.observed[0]
      expect(draw.targetSize).toEqual([720, 540])
      expect(draw.glViewport).toEqual([0, 0, ...draw.targetSize])
      expect(draw.currentViewport).toEqual(draw.glViewport)
      expect(draw.visible).toBe(false)
      expect(draw.autoClear).toBe(true)
      expect(draw.xrEnabled).toBe(false)
      expect(capture.before.pixelRatio).toBe(pixelRatio)
      expect(capture.before.targetRestored).toBe(true)
      expect(capture.before.visible).toBe(true)
      expect(capture.after).toEqual(capture.before)
      expect(capture.refraction).toBe('shared-render-target')
      expect(capture.backgroundFlags).toEqual([1, 1, 1, 1, 1, 1])
      expect(capture.visibility).toEqual([
        { name: 'visible-unscheduled', draws: 0, groupVisible: true },
        { name: 'closed-entry', draws: 0, groupVisible: false },
        { name: 'entry-first-unscheduled', draws: 1, groupVisible: true },
        { name: 'visible-unscheduled-again', draws: 0, groupVisible: true },
        { name: 'visible-scheduled', draws: 1, groupVisible: true },
        { name: 'closed-exit', draws: 0, groupVisible: false },
        { name: 'reverse-first-unscheduled', draws: 1, groupVisible: true },
        { name: 'offscreen', draws: 0, groupVisible: true },
        { name: 'indirect-reflection', draws: 1, groupVisible: true },
        { name: 'offscreen-again', draws: 0, groupVisible: true },
        { name: 'frustum-reentry-unscheduled', draws: 1, groupVisible: true },
      ])
      expect(capture.failure.after).toEqual(capture.before)
      expect(capture.failure.refraction).toBe('capture-failed-fallback')
      expect(capture.failure.backgroundFlags).toEqual([0, 0, 0, 0, 0, 0])
      expect(capture.failure.attempts).toBe(1)
    }
    const water = await page.evaluate(() => window.interactionHarness.probeWaterCaptureVisibility())
    expect(water).toEqual([
      { name: 'open', reflected: 1, visible: true },
      { name: 'closed', reflected: 0, visible: false },
      { name: 'open-reentry', reflected: 1, visible: true },
      { name: 'open-moving-light', reflected: 1, visible: true },
      { name: 'surface-below-band', reflected: 0, visible: true },
      { name: 'other-camera-sees-band', reflected: 1, visible: true },
      { name: 'open-reverse', reflected: 1, visible: true },
    ])
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

  test('a flash head keeps advancing after the pointer stops instead of growing a fixed spike', async ({ page }) => {
    await page.mouse.move(100, 240)
    for (const x of [140, 180, 220, 260]) {
      await page.waitForTimeout(50)
      await page.mouse.move(x, 240)
    }
    const started = await page.evaluate(() => window.interactionHarness.step(.1))
    const flying = await page.evaluate(() => window.interactionHarness.step(.85))
    expect(started.illuminatedPixels).toBeGreaterThan(0)
    expect(flying.rightmostPixel - started.rightmostPixel).toBeGreaterThan(20)
    const ended = await page.evaluate(() => window.interactionHarness.step(2.1))
    expect(ended.illuminatedPixels).toBe(0)
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
      expect(orbit.pitch).toBeLessThan(-0.1)
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
      expect(settled.pitch).toBeLessThan(-0.1)
      expect(settled.zoom).toBe(0)
      const retained = await page.evaluate(() => window.interactionHarness.step(3))
      expect(Math.abs(retained.yaw - settled.yaw)).toBeLessThan(0.001)
      await page.mouse.up()
      await page.mouse.dblclick(320, 200)
      const reset = await page.evaluate(() => window.interactionHarness.step(4))
      expect(Math.abs(reset.yaw)).toBeLessThan(0.001)
    }
  })

  test('reduced motion, unpaired touch pointers, and UI controls never begin an orbit or trail', async ({
    page,
  }) => {
    await page.evaluate(() => window.interactionHarness.reset(true))
    await page.mouse.move(320, 240)
    await page.mouse.down()
    await page.mouse.move(480, 160, { steps: 4 })
    const reduced = await page.evaluate(() => window.interactionHarness.step(0.5))
    expect(reduced).toEqual({ yaw: 0, pitch: 0, zoom: 0, burst: 0, illuminatedPixels: 0, rightmostPixel: -1 })
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
    expect(excluded).toEqual({ yaw: 0, pitch: 0, zoom: 0, burst: 0, illuminatedPixels: 0, rightmostPixel: -1 })
    await expect(page.locator('#interaction-canvas')).toHaveAttribute('data-camera-mode', 'idle')
  })

  test('passive native touch launches light, drives surface flow and survives scroll pointercancel', async ({ page }) => {
    const result = await page.evaluate(() => {
      const h = window.interactionHarness
      h.reset()
      const canvas = document.getElementById('interaction-canvas')!
      const touch = (type: string, x: number, y: number, fingers = 1) => {
        const point = new Touch({ identifier: 7, target: canvas, clientX: x, clientY: y })
        const points = fingers ? [point] : []
        if (fingers === 2) points.push(new Touch({ identifier: 8, target: canvas, clientX: x + 80, clientY: y }))
        const event = new TouchEvent(type, { bubbles: true, cancelable: true,
          touches: points, targetTouches: points, changedTouches: [point] })
        canvas.dispatchEvent(event)
        return event.defaultPrevented
      }
      const prevented = [touch('touchstart', 300, 220)]
      const tap = h.step(.12)
      canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch', pointerId: 7 }))
      prevented.push(touch('touchmove', 340, 180))
      h.stepField(.08)
      prevented.push(touch('touchmove', 400, 140))
      const drag = h.stepField(.12)
      prevented.push(touch('touchend', 400, 140, 0))
      const decay = h.stepField(6)
      touch('touchstart', 300, 220)
      touch('touchstart', 300, 220, 2)
      const pinch = h.stepField(.1)
      return { prevented, tap, drag, decay, pinch }
    })
    expect(result.prevented.every(value => !value)).toBe(true)
    expect(result.tap.illuminatedPixels).toBeGreaterThan(0)
    expect(result.drag.flowEnergy).toBeGreaterThan(0)
    expect(result.drag.strength).toBeGreaterThan(.1)
    expect(result.drag.yaw).toBe(0)
    expect(result.drag.pitch).toBe(0)
    expect(result.decay.strength).toBeLessThan(.001)
    expect(result.pinch.strength).toBe(0)
    expect(result.pinch.active).toBe(false)
  })

  test('orbit locks preserve the chosen view and mechanical scroll can stop and reverse', async ({ page }) => {
    const lockedBoundaries = await page.evaluate(() =>
      [.235, .24, .45, .72, .83, .85, .86]
        .map((progress) => window.interactionHarness.sampleJourney(progress)),
    )
    for (const state of lockedBoundaries) {
      expect(state.orbitEnabled).toBe(false)
      expect(state.orbitWeight).toBe(0)
    }
    const returningOrbit = await page.evaluate(() =>
      [0, .94, .95, 1].map((progress) => window.interactionHarness.sampleJourney(progress)),
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
    // Camera locks must leave sparse flashes available; their area is intentionally small.
    expect(trace.illuminatedPixels).toBeGreaterThan(0)

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
    expect(locked.illuminatedPixels).toBeGreaterThan(0)
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
    expect(forward.vertebrae).not.toEqual(first.vertebrae)
    expect(forward.monitors).not.toEqual(first.monitors)
    expect(Math.abs(forward.structureYaw - first.structureYaw)).toBeGreaterThan(.01)
    expect(forward.modelY).toBeLessThan(first.modelY - .01)
    expect(forward.chamberY).toBeCloseTo(first.chamberY, 8)
    const reverse = await page.evaluate(() => window.interactionHarness.sampleWorld(15, .4))
    expect(reverse).toEqual(first)
    const occlusion = await page.evaluate(() => window.interactionHarness.probeMonitorOcclusion())
    expect(occlusion.foreground).toBeNull()
    expect(occlusion.hovered).toBe(-1)
    expect(occlusion.ignored).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    expect(occlusion.offRayCasts).toBe(0)
    expect(occlusion.instancePicks).toEqual([1, null, 1])
    expect(occlusion.visibleProduction).toBe(1)
  })
})
