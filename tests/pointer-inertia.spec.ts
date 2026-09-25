import { test, expect } from '@playwright/test'
import { createPointerFlow } from '../src/PointerFlow'

test('@interaction faster pointer strokes impart more momentum and keep moving after release', () => {
  const stroke = (dt: number) => {
    const flow = createPointerFlow()
    try {
      for(let i=0;i<=20;i++) {flow.move(-.3+i*.03,0,1.6);flow.update(dt)}
      const before = new Float32Array(flow.surfaceTexture.image.data as Float32Array)
      let energy=0
      for(let i=0;i<before.length;i+=4) energy+=Math.abs(before[i]-128/255)+Math.abs(before[i+1]-128/255)
      flow.release();flow.update(.12)
      const after=flow.surfaceTexture.image.data as Float32Array
      let transported=0
      for(let i=0;i<before.length;i+=4) transported+=Math.abs(after[i+2]-before[i+2])
      return {energy,transported}
    } finally {flow.dispose()}
  }
  const slow=stroke(1/30),fast=stroke(1/120)
  expect(fast.energy).toBeGreaterThan(slow.energy*1.15)
  expect(fast.transported).toBeGreaterThan(1)
})
