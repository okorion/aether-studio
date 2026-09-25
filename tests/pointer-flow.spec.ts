import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createPointerFlow } from '../src/PointerFlow'

type PointerFlow = ReturnType<typeof createPointerFlow>
const frame = 1 / 60

// Inspect the production texture on the CPU. These helpers decode the public
// RG byte contract only; they do not reproduce the flow simulation or brush.
function pixels(flow: PointerFlow) {
  return flow.texture.image.data as Uint8Array
}

function field(flow: PointerFlow) {
  const data = pixels(flow)
  let x = 0, y = 0, energy = 0, positiveX = 0, negativeX = 0
  for (let i = 0; i < data.length; i += 4) {
    const dx = data[i] - 128, dy = data[i + 1] - 128
    x += dx
    y += dy
    energy += Math.abs(dx) + Math.abs(dy)
    if (dx > 0) positiveX++
    if (dx < 0) negativeX++
  }
  return { x, y, energy, positiveX, negativeX }
}

function expectNeutral(flow: PointerFlow) {
  const data = pixels(flow)
  let nonNeutral = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 128 || data[i + 1] !== 128 || data[i + 2] !== 0 || data[i + 3] !== 255)
      nonNeutral++
  }
  expect(nonNeutral).toBe(0)
}

function move(flow: PointerFlow, x: number, y: number, aspect = 1) {
  flow.move(x, y, aspect)
  flow.update(frame)
}

function stroke(flow: PointerFlow, horizontal: boolean, sign: number, aspect = 1) {
  for (let i = 0; i <= 6; i++) {
    const position = (-.24 + i * .08) * sign
    move(flow, horizontal ? position : 0, horizontal ? 0 : position, aspect)
  }
}

test('@interaction leaving the viewport preserves the wake and re-entry cannot bridge the gap', () => {
  const flow = createPointerFlow()
  try {
    stroke(flow, true, 1)
    const before = Array.from(pixels(flow))
    expect(field(flow).energy).toBeGreaterThan(0)
    flow.release()
    expect(Array.from(pixels(flow))).toEqual(before)
    flow.move(-.8, .8, 1)
    expect(Array.from(pixels(flow))).toEqual(before)
    flow.update(frame)
    expect(field(flow).energy).toBeGreaterThan(0)
    for (let i = 0; i < 150; i++) flow.update(frame)
    expectNeutral(flow)
  } finally { flow.dispose() }
})

test('@interaction pointer flow starts neutral and a stationary pointer never injects motion', () => {
  const flow = createPointerFlow()
  try {
    expectNeutral(flow)
    for (let i = 0; i < 20; i++) flow.update(frame)
    expectNeutral(flow)
    // The first event establishes an anchor even when it is far from centre.
    move(flow, .72, -.63, 1.6)
    expectNeutral(flow)
    for (let i = 0; i < 30; i++) move(flow, .72, -.63, 1.6)
    expectNeutral(flow)
  } finally { flow.dispose() }
})

test('@interaction pointer flow follows horizontal and vertical motion in both directions', () => {
  for (const aspect of [.75, 2]) {
    for (const horizontal of [true, false]) {
      for (const sign of [-1, 1]) {
        const flow = createPointerFlow()
        try {
          stroke(flow, horizontal, sign, aspect)
          const response = field(flow)
          const primary = horizontal ? response.x : response.y
          const transverse = horizontal ? response.y : response.x
          expect(response.energy).toBeGreaterThan(0)
          expect(primary * sign).toBeGreaterThan(0)
          expect(Math.abs(primary)).toBeGreaterThan(Math.abs(transverse))
        } finally { flow.dispose() }
      }
    }
  }
})

test('@interaction opposite pointer paths keep separate wakes and idle flow returns exactly to neutral', () => {
  const flow = createPointerFlow()
  try {
    for (let i = 0; i <= 6; i++) move(flow, -.24 + i * .08, -.48)
    expect(field(flow).x).toBeGreaterThan(0)
    const firstPath = pixels(flow).slice()
    // This jump only resets the input anchor. The previous path must survive
    // while a new, opposite stroke is drawn on the other side of the viewport.
    move(flow, .24, .48)
    for (let i = 1; i <= 6; i++) move(flow, .24 - i * .08, .48)
    const bothPaths = field(flow)
    expect(bothPaths.positiveX).toBeGreaterThan(0)
    expect(bothPaths.negativeX).toBeGreaterThan(0)
    const combined = pixels(flow)
    let retainedWake = 0, separateReverseWake = 0
    for (let i = 0; i < combined.length; i += 4) {
      if (firstPath[i] > 128 && combined[i] > 128) retainedWake++
      if (firstPath[i] === 128 && combined[i] < 128) separateReverseWake++
    }
    expect(retainedWake).toBeGreaterThan(0)
    expect(separateReverseWake).toBeGreaterThan(0)

    for (let i = 0; i < 12; i++) flow.update(frame)
    expect(field(flow).energy).toBeGreaterThan(0)
    // Normal frame deltas exercise the actual decay, not the large-delta reset.
    for (let i = 0; i < 150; i++) flow.update(frame)
    expectNeutral(flow)
    for (let i = 0; i < 10; i++) flow.update(frame)
    expectNeutral(flow)
  } finally { flow.dispose() }
})

test('@interaction clearing pointer flow removes history and the next sample cannot create a ghost', () => {
  const flow = createPointerFlow()
  try {
    stroke(flow, true, 1)
    expect(field(flow).energy).toBeGreaterThan(0)
    const paused = pixels(flow).slice()
    const version = flow.texture.version
    flow.update(0)
    expect(pixels(flow)).toEqual(paused)
    expect(flow.texture.version).toBe(version)
    flow.clear()
    expectNeutral(flow)
    for (let i = 0; i < 12; i++) flow.update(frame)
    expectNeutral(flow)
    move(flow, -.61, .37, 1.6)
    expectNeutral(flow)
    move(flow, -.61, .37, 1.6)
    expectNeutral(flow)
    move(flow, -.53, .37, 1.6)
    expect(field(flow).x).toBeGreaterThan(0)
    flow.clear()
    flow.clear()
    expectNeutral(flow)
  } finally { flow.dispose() }
})

test('@interaction invalid pointer samples and frame gaps cannot poison or resurrect flow', () => {
  const flow = createPointerFlow()
  try {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      flow.move(invalid, 0, 1.6)
      flow.move(0, invalid, 1.6)
      flow.move(0, 0, invalid)
      flow.update(frame)
      expectNeutral(flow)
    }
    move(flow, -.24, 0)
    expectNeutral(flow)
    move(flow, -.16, 0)
    expect(field(flow).energy).toBeGreaterThan(0)

    for (const invalidDelta of [NaN, Infinity, -Infinity, -1, 60]) {
      flow.clear()
      stroke(flow, false, 1)
      expect(field(flow).energy).toBeGreaterThan(0)
      flow.update(invalidDelta)
      expectNeutral(flow)
      // A tab resume or invalid clock cannot connect back to the stale cursor.
      move(flow, .57, -.48)
      expectNeutral(flow)
      move(flow, .57, -.40)
      expect(field(flow).y).toBeGreaterThan(0)
    }
  } finally { flow.dispose() }
})

test('@interaction pointer flow keeps one bounded texture and releases it once', () => {
  const flow = createPointerFlow()
  const texture = flow.texture
  const data = pixels(flow)
  const { width, height } = texture.image
  let disposals = 0
  texture.addEventListener('dispose', () => { disposals++ })
  try {
    expect(texture).toBeInstanceOf(THREE.DataTexture)
    expect(data).toBeInstanceOf(Uint8Array)
    expect(Number.isInteger(width) && width > 1 && width <= 64).toBe(true)
    expect(Number.isInteger(height) && height > 1 && height <= 64).toBe(true)
    expect(data.length).toBe(width * height * 4)
    expect(data.byteLength).toBeLessThanOrEqual(64 * 64 * 4)
    for (let i = 0; i < 4; i++) {
      stroke(flow, i % 2 === 0, i % 2 ? -1 : 1, i % 2 ? .75 : 2)
      flow.update(frame)
      flow.clear()
      expect(flow.texture).toBe(texture)
      expect(pixels(flow)).toBe(data)
      expect(flow.texture.image.width).toBe(width)
      expect(flow.texture.image.height).toBe(height)
      expectNeutral(flow)
    }
  } finally { flow.dispose() }
  flow.dispose()
  expect(disposals).toBe(1)
})

test('@interaction smaller gas wake settles within one second without an abrupt reset', () => {
  const flow=createPointerFlow('haze');
  const mass=()=>{let total=0;const bytes=pixels(flow);for(let i=0;i<bytes.length;i+=4)total+=bytes[i+2];return total;};
  try {
    stroke(flow,true,1,1.6);const initial=mass();expect(initial).toBeGreaterThan(1000);
    flow.release();flow.update(.36);expect(mass()).toBeGreaterThan(initial*.35);
    let previous=mass();for(let i=0;i<60;i++){flow.update(frame);expect(mass()).toBeLessThanOrEqual(previous);previous=mass();}
    expect(mass()).toBeLessThan(initial*.002);
    for(let i=0;i<60;i++)flow.update(frame);expectNeutral(flow);
  }finally{flow.dispose();}
});
