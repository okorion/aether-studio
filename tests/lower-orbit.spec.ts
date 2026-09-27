import { test, expect } from '@playwright/test'
import { createLowerForestOrbit } from '../src/SceneOrbit'
import { sampleJourney, sampleEmblemYaw } from '../src/Journey'

test('@interaction lower scroll never reapplies an old drag or reverses the ring', () => {
  for (const savedYaw of [-5, 0, 5]) {
    const orbit = createLowerForestOrbit({ yaw: savedYaw, pitch: 0 })
    let previous = Infinity
    const angles: number[] = []
    for (let i = 800; i <= 1000; i++) {
      const p = i / 1000, j = sampleJourney(p)
      const view = orbit(p, { yaw: savedYaw, pitch: 0 }, j.orbitWeight)
      const angle = sampleEmblemYaw(p, j.azimuth) - j.azimuth - view.yaw
      expect(view.yaw).toBe(0)
      expect(angle).toBeLessThan(previous)
      previous = angle
      angles.push(angle)
    }
    for (let i = 1000; i >= 800; i--) {
      const p = i / 1000, j = sampleJourney(p)
      const view = orbit(p, { yaw: savedYaw, pitch: 0 }, j.orbitWeight)
      expect(sampleEmblemYaw(p, j.azimuth) - j.azimuth - view.yaw).toBe(angles[i - 800])
    }
  }
})

test('@interaction lower drag is available during entry and holds across scroll, rebuild and reset', () => {
  const orbit = createLowerForestOrbit()
  const j = sampleJourney(.82)
  expect(j.orbitEnabled).toBe(true)
  const chosen = orbit(.82, { yaw: -1, pitch: .2 }, j.orbitWeight)
  expect(chosen.yaw).toBeLessThan(-.4)
  for (const p of [.84, .9, 1, .87, .82]) {
    const view = orbit(p, { yaw: -1, pitch: .2 }, sampleJourney(p).orbitWeight)
    expect(view.yaw).toBe(chosen.yaw)
    expect(view.pitch).toBeCloseTo(.2 * sampleJourney(p).orbitWeight, 10)
  }
  const restored = createLowerForestOrbit({ yaw: -1, pitch: .2 }, chosen)
  expect(restored(.9, { yaw: -1, pitch: .2 }, 1)).toEqual({ yaw: chosen.yaw, pitch: .2 })
  const reset = restored(.9, { yaw: 0, pitch: 0, resetting: true }, 1, 4)
  expect(Math.abs(reset.yaw)).toBeLessThan(.00001)
  expect(Math.abs(reset.pitch)).toBeLessThan(.00001)
})
