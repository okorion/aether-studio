import { test, expect } from '@playwright/test'
import { build } from 'vite'
import type * as Probe from './fixtures/chamber-harness'
import { REACTOR } from '../src/Reactor'

test('@interaction chamber roof keeps the aperture open and water renders evolving/frozen frames', async ({page})=>{
  const output=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,
    lib:{entry:'tests/fixtures/chamber-harness.ts',formats:['iife'],name:'ChamberProbe'}}})
  const chunk=(Array.isArray(output)?output:[output]).flatMap(o=>'output' in o?o.output:[]).find(o=>o.type==='chunk')
  if(!chunk||chunk.type!=='chunk')throw new Error('Chamber probe build failed')
  await page.goto('about:blank');await page.addScriptTag({content:chunk.code})
  for(const mobile of [false,true]){
    const r=await page.evaluate(m=>(window as unknown as {ChamberProbe:typeof Probe}).ChamberProbe.probeChamber(m),mobile)
    expect(r.centreHits).toBe(0);expect(r.rimHits).toBeGreaterThan(0);expect(r.ceilingHits).toBeGreaterThan(0)
    const exit = REACTOR.worldY + (REACTOR.apertureY - REACTOR.capThickness / 2) * REACTOR.heightScale
    expect(r.lightPosition[0]).toBe(0);expect(r.lightPosition[2]).toBe(0);expect(r.lightPosition[1]).toBeCloseTo(exit,5)
    expect(r.beamTop).toBeCloseTo(exit, 5);expect(r.reachesFloorEdge).toBe(true)
    expect(r.reverse).toEqual(r.matrices);expect(r.disposed).toBe(2);expect(r.lightRemoved).toBe(true);expect(r.sceneChildren).toBe(0)
  }
  const lighting = await page.evaluate(() => (window as unknown as {ChamberProbe:typeof Probe}).ChamberProbe.probeSpotlightFloor())
  expect(lighting.floor).toBeGreaterThan(1000)
  expect(lighting.belowControl).toBeGreaterThan(1000)
  expect(lighting.below).toBe(0)
  for(const reflection of [false,true]){
    const r=await page.evaluate(v=>(window as unknown as {ChamberProbe:typeof Probe}).ChamberProbe.probeWater(v),reflection)
    expect(r.moving).toBeGreaterThan(1000);expect(r.stopped).toBe(0);expect(r.restored).toBe(0)
  }
})
