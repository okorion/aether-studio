import { test, expect } from '@playwright/test'
import { journeyHeightSvh, sceneToScroll, scrollToScene } from '../src/ScrollTimeline'

test('@interaction the scale room uses 60 percent of its former scroll distance and restores every authored pose', () => {
  const scrollHeight = journeyHeightSvh - 100
  expect((sceneToScroll(.925) - sceneToScroll(.765)) * scrollHeight).toBeCloseTo((.925 - .765) * 1700 * .6, 8)
  for (const [a, b] of [[0, .1], [.3, .6], [.94, 1]]) {
    expect((sceneToScroll(b) - sceneToScroll(a)) * scrollHeight).toBeCloseTo((b - a) * 1700, 8)
  }
  let previous = -1
  for (let i = 0; i <= 1000; i++) {
    const pose = i / 1000, scroll = sceneToScroll(pose)
    expect(scroll).toBeGreaterThan(previous)
    expect(scrollToScene(scroll)).toBeCloseTo(pose, 12)
    previous = scroll
  }
  expect(scrollToScene(0)).toBe(0)
  expect(scrollToScene(1)).toBe(1)
})
