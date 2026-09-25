import {test,expect} from '@playwright/test'
import {build} from 'vite'
import type {probeHazeLifecycle} from './fixtures/haze-lifecycle-harness'

test('@interaction haze survives UI crossing, touch pointerdown and a visible frame stall, but clears on navigation',async({page})=>{
  const output=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,
    lib:{entry:'tests/fixtures/haze-lifecycle-harness.ts',formats:['iife'],name:'HazeLifecycle'}}})
  const chunk=(Array.isArray(output)?output:[output]).flatMap(r=>'output' in r?r.output:[]).find(r=>r.type==='chunk')
  if(!chunk||chunk.type!=='chunk')throw Error('Haze fixture failed to compile')
  await page.goto('about:blank');await page.addScriptTag({content:chunk.code})
  const r=await page.evaluate(()=>(window as unknown as {HazeLifecycle:{probeHazeLifecycle:typeof probeHazeLifecycle}}).HazeLifecycle.probeHazeLifecycle())
  expect(r.before).toBeGreaterThan(100)
  expect(r.hover).toBe(r.before)
  expect(r.reentry).toBe(r.before)
  expect(r.stalled).toBeGreaterThan(r.before*.5)
  expect(r.touchStart).toBe(r.stalled)
  expect(r.inactive).toBe(0)
  expect(r.resumed).toBe(0)
  const software=await page.evaluate(()=>(window as unknown as {HazeLifecycle:{probeHazeLifecycle:typeof probeHazeLifecycle}}).HazeLifecycle.probeHazeLifecycle(true))
  expect(Object.values(software).every(value=>value===0)).toBe(true)
})
