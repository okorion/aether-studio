import { test, expect } from '@playwright/test'
import { build } from 'vite'
import { createMonitorGeometry } from '../src/MonitorGeometry'
import { sampleMonitorLayout } from '../src/MonitorCatalog'
import type * as Probe from './fixtures/scene-flow-harness'

declare global { interface Window { SceneFlowProbe: typeof Probe } }

test('@interaction monitor counts, models, project mapping and media lifecycle remain independent', async ({ page }) => {
  const output = await build({ configFile:false, logLevel:'silent', build:{write:false,minify:false,
    lib:{entry:'tests/fixtures/scene-flow-harness.ts',formats:['iife'],name:'SceneFlowProbe'}} })
  const chunk = (Array.isArray(output)?output:[output]).flatMap(r=>'output' in r?r.output:[]).find(r=>r.type==='chunk')
  if(!chunk||chunk.type!=='chunk') throw Error('Scene flow fixture failed')
  await page.goto('about:blank'); await page.addScriptTag({content:chunk.code})
  for(const row of await page.evaluate(()=>window.SceneFlowProbe.probeMonitorCatalogue())) {
    expect(row.forward).toEqual(row.reverse)
    if(!row.count) { expect(row.forward.every(s=>!s.visible&&s.hit===null)).toBe(true); continue }
    expect(row.forward[0].positions[0][0]).toBeCloseTo(0, 5)
    expect(row.forward[2].positions.at(-1)![0]).toBeCloseTo(0, 5)
    expect(row.forward[0].hit).toBe(11)
    expect(row.forward[2].hit).toBe(10+row.count)
    if(row.count>1) expect(row.squareCrop).toEqual([.5625,1])
  }
  for(const count of [1,2,3,6,10]) for(let i=0;i<count;i++) {
    const centre=sampleMonitorLayout(.303+i/Math.max(1,count-1)*.32,i,count)
    expect(centre.step).toBeCloseTo(0, 5)
    expect(centre.y).toBeCloseTo(0, 5)
  }
  for(const model of [undefined,{width:4,height:4},{width:8,height:3,curvature:.25,depth:.2}]) {
    const asset=createMonitorGeometry(model,false)
    expect(asset.bounds.min.z).toBeLessThan(0)
    expect(asset.bounds.max.z).toBeGreaterThan(asset.model.curvature)
    expect(Array.from(asset.lens.getAttribute('normal').array).every(Number.isFinite)).toBe(true)
    asset.dispose()
  }
  for(const sample of await page.evaluate(()=>window.SceneFlowProbe.probeMediaCounts())) {
    expect(sample.before.ready).toHaveLength(sample.count)
    expect(sample.before.state.every(s=>s==='idle')).toBe(true)
    expect(sample.after.state.every(s=>s==='disposed')).toBe(true)
    expect(sample.after.active).toBe(false)
  }
  const forest=await page.evaluate(()=>window.SceneFlowProbe.probeClosedForest())
  expect(forest.error).toBe(0); expect(forest.visible).toBeGreaterThan(0)
  expect(forest.closed).toBe(0); expect(forest.reopened).toBe(forest.visible)
  const flowers=await page.evaluate(()=>window.SceneFlowProbe.probeFlowerPaths())
  expect(flowers.error).toBe(0); expect(flowers.bottom).toEqual(flowers.reverse)
  const radius=(v:number[])=>Math.hypot(v[0],v[2])
  expect(flowers.topStart[1]-flowers.topEnd[1]).toBeGreaterThan(7)
  expect(radius(flowers.bottom.at(-1)!)).toBeLessThan(.8)
  expect(flowers.bottom.at(-1)![1]).toBeLessThan(-8)
  for(let i=1;i<flowers.bottom.length;i++) {
    expect(radius(flowers.bottom[i])).toBeLessThanOrEqual(radius(flowers.bottom[i-1])+.001)
    expect(Math.hypot(...flowers.bottom[i].map((v,j)=>v-flowers.bottom[i-1][j]))).toBeLessThan(1.2)
  }
  const surface=await page.evaluate(()=>window.SceneFlowProbe.probeReactorSurface())
  expect(surface.error).toBe(0)
  expect(surface.centre).toBeGreaterThan(.95)
  expect(surface.rim).toBeLessThan(surface.centre)
  expect(surface.changed).toBe(0)
})
