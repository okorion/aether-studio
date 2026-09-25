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

test('@interaction water enlarges contact without a broad wake and releases continuously', () => {
  const flow = createPointerFlow()
  try {
    flow.move(-.032, 0, 1.6); flow.update(1 / 60)
    flow.move(.032, 0, 1.6); flow.update(1 / 60)
    const field = flow.surfaceTexture.image.data as Float32Array
    let contactArea = 0, densityRadius = 0
    for (let i = 0; i < field.length; i += 4) {
      contactArea += 1 - field[i + 3]
      if (field[i + 2] < .0001) continue
      const cell = i / 4, x = ((cell % 64 + .5) / 64 * 2 - 1) * 1.6
      const y = (Math.floor(cell / 64) + .5) / 40 * 2 - 1
      densityRadius = Math.max(densityRadius, Math.hypot(x, y))
    }
    // Same 64x40 pulse at the previous release measured 15.7085 contact cells.
    // Compare equivalent diameters, allowing for discrete grid sampling.
    const diameterRatio = Math.sqrt(contactArea / 15.7085)
    expect(diameterRatio).toBeGreaterThan(1.42)
    expect(diameterRatio).toBeLessThan(1.58)
    expect(densityRadius).toBeLessThan(.30)
    let previous = new Float32Array(field), maxStep = 0, backwards = 0
    for (let frame = 0; frame < 130; frame++) {
      flow.update(1 / 60)
      for (let i = 3; i < field.length; i += 4) {
        maxStep = Math.max(maxStep, Math.abs(field[i] - previous[i]))
        if (field[i] < previous[i]) backwards++
      }
      previous = new Float32Array(field)
    }
    expect(maxStep).toBeLessThan(.07)
    expect(backwards).toBe(0)
  } finally { flow.dispose() }
})
