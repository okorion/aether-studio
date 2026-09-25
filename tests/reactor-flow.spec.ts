import { expect, test } from '@playwright/test'
import { build } from 'vite'
import type { probeReactorFlow, probeAtmosphereGpuFlow } from './fixtures/reactor-flow-harness'

test('@interaction reactor GPU position history carries directional wakes and stays inside the O', async ({ page }) => {
  test.setTimeout(90_000)
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: 'tests/fixtures/reactor-flow-harness.ts', formats: ['iife'], name: 'ReactorFlowProbe' } } })
  const chunk = (Array.isArray(output) ? output : [output]).flatMap(item => 'output' in item ? item.output : []).find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Reactor flow fixture failed to compile')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('about:blank')
  await page.addScriptTag({ content: chunk.code })
  const state = await page.evaluate(() => (window as unknown as { ReactorFlowProbe: {
    probeReactorFlow: typeof probeReactorFlow } }).ReactorFlowProbe.probeReactorFlow())
  expect(state.direction.meanX).toBeGreaterThan(.02)
  expect(state.history.meanDistance).toBeGreaterThan(.01)
  expect(state.idle.meanDistance).toBeGreaterThan(.01)
  expect(state.maxTube).toBeLessThan(.71)
  expect(state.minHole).toBeGreaterThan(.5)
  expect(state.finite).toBe(true)
  for (const sample of [state.smallReverse, state.paused, state.suspended, state.snapshotRestore, state.reverse]) expect(sample.max).toBeLessThan(.00001)
  expect(state.pausedSteps).toBe(0)
  expect(state.exitSteps).toBe(0)
  expect(state.exited.active).toBe(false)
  expect(state.exited.initialized).toBe(false)
  expect(state.disposedSteps).toBe(0)
  expect(state.rendererState.target).toBe(true)
  expect(state.rendererState.viewport).toEqual(state.rendererState.view)
  expect(state.rendererState.scissor).toEqual(state.rendererState.expectedScissor)
  expect(state.rendererState.scissorTest).toBe(true)
  expect(state.rendererState.autoClear).toBe(false)
  expect(state.glError).toBe(0)
  const integration = []
  for (const mobile of [false, true]) {
    const result = await page.evaluate(mobile => (window as unknown as { ReactorFlowProbe: {
      probeAtmosphereGpuFlow: typeof probeAtmosphereGpuFlow } }).ReactorFlowProbe.probeAtmosphereGpuFlow(mobile), mobile)
    expect(result.status.enabled).toBe(true)
    expect(result.status.count).toBe(result.baseCount)
    expect(result.uniqueCells).toBe(result.baseCount)
    expect(result.liveStatus.active).toBe(true)
    expect(result.motion.meanDistance).toBeGreaterThan(.01)
    expect(result.weight).toBe(1)
    expect(result.suspended.max).toBeLessThan(.00001)
    expect(result.suspendedFormationWeight).toBeGreaterThan(0)
    expect(result.suspendedFormationWeight).toBeLessThan(1)
    expect(result.formationWeight).toBe(0)
    expect(result.suspendedScrollSteps).toBe(0)
    expect(result.suspendedExit.initialized).toBe(false)
    expect(result.restored.max).toBeLessThan(.00001)
    expect(result.fallback.enabled).toBe(false)
    expect(result.glError).toBe(0)
    integration.push(result)
  }
  expect(errors).toEqual([])
  await test.info().attach('reactor-gpu-history.json', { contentType: 'application/json', body: JSON.stringify({ state, integration }, null, 2) })
})
