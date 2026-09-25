import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeSurfaceFlow, probeStatementPlate, probeColumnParticleColor } from './fixtures/surface-flow-harness'

test('@interaction screen flow leaves both forests and foreground pixels intact while the statement plate refracts', async ({ page }) => {
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/surface-flow-harness.ts', formats: ['iife'], name: 'SurfaceFlowFixture' } } })
  const chunk = (Array.isArray(output) ? output : [output])
    .flatMap(result => 'output' in result ? result.output : []).find(result => result.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Surface flow pixel fixture did not compile')
  const pageErrors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  const colors = await page.evaluate(() => (window as unknown as {
    SurfaceFlowFixture: {probeColumnParticleColor: typeof probeColumnParticleColor}
  }).SurfaceFlowFixture.probeColumnParticleColor())
  expect(colors.visible).toBeGreaterThan(100)
  expect(colors.changed).toBe(0)
  const results = []
  for (const mobile of [false, true]) {
    const result = await page.evaluate(mobile => (window as unknown as {
      SurfaceFlowFixture: { probeSurfaceFlow: typeof probeSurfaceFlow }
    }).SurfaceFlowFixture.probeSurfaceFlow(mobile), mobile)
    results.push(result)
    const label = mobile ? '117×253 without a bloom allocation' : '160×100 with bloom disabled'
    expect(result.errors, label).toEqual([])
    expect(result.preparation.restoredTarget, label).toBe(true)
    expect(result.preparation.viewportPreserved, label).toBe(true)
    expect(result.preparation.scissorPreserved, label).toBe(true)
    expect(result.preparation.canvasDrift.differentComponents, label).toBe(0)
    // Half-float intermediate rounding may move a channel by one display byte.
    // These bounds reject a missing/duplicate color transfer or tone mapping.
    expect(result.neutral.maxError, label).toBeLessThanOrEqual(2)
    expect(result.neutral.meanError, label).toBeLessThan(.5)
    expect(Math.abs(result.neutral.meanLumaShift), label).toBeLessThan(.5)
    expect(result.refraction.changedPixels, label).toBe(0)
    expect(result.lowerForest.changedPixels, label).toBe(0)
    expect(result.statementBackground.changedPixels, label).toBe(0)
    expect(result.textRegion.changedPixels, label).toBe(0)
    expect(result.programsBeforeStroke, label).toBeGreaterThan(0)
    expect(result.programsAfterStroke, label).toBe(result.programsBeforeStroke)
    expect(result.release.differentComponents, label).toBe(0)
    expect(result.clear.differentComponents, label).toBe(0)
    expect(result.gapClear.differentComponents, label).toBe(0)
    expect(result.gapReentry.differentComponents, label).toBe(0)
    // One scene draw, one flow draw and one output draw; no bloom pyramid runs.
    expect(result.neutralDrawCalls, label).toBe(3)
    expect(result.mist.residualMax, label).toBeLessThanOrEqual(2)
    expect(result.mist.residualMean, label).toBeLessThan(.5)
    expect(result.mist.residualBeyondTwo, label).toBe(0)
    expect(result.mist.leftMistPixels, label).toBeGreaterThan(5)
    // Other corners retain a faint, non-interactive edge glow.
    expect(result.mist.outsideMistPixels, label).toBeGreaterThan(0)
    expect(result.mist.protectedRegion.maxError, label).toBeLessThanOrEqual(1)
    expect(result.mist.response.differentComponents, label).toBeGreaterThan(3)
    expect(result.mist.restingError, label).toBeGreaterThan(10)
    expect(result.mist.clearedError, label).toBeLessThan(result.mist.restingError*.8)
    expect(result.mist.recovery.maxError, label).toBe(0)
    expect(result.mist.screenAnchor.maxError, label).toBe(0)
    const plate = await page.evaluate(mobile => (window as unknown as {
      SurfaceFlowFixture: { probeStatementPlate: typeof probeStatementPlate }
    }).SurfaceFlowFixture.probeStatementPlate(mobile), mobile)
    expect(plate.ringPixels, label).toBeGreaterThan(100)
    expect(plate.ringChanged, label).toBe(0)
    expect(plate.plateChanged, label).toBeGreaterThan(80)
    expect(plate.maximumInkDistance, label).toBeGreaterThan(3)
    // The compact rim deliberately distorts fewer distant ink pixels.
    expect(plate.displacedInkPixels, label).toBeGreaterThan(2)
    expect(plate.tailChanged, label).toBeGreaterThan(20)
    expect(plate.clearChanged, label).toBe(0)
    expect(plate.forests, label).toEqual([0,0])
    expect(plate.programsAfter, label).toBe(plate.programs)
    results.push({mobile,plate})
  }
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  await test.info().attach('surface-flow-pixel-evidence.json', {
    contentType: 'application/json', body: JSON.stringify(results, null, 2),
  })
})
