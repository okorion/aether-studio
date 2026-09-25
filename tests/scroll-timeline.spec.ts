import { test, expect } from '@playwright/test'
import { journeyHeightSvh, sceneToScroll, scrollToScene } from '../src/ScrollTimeline'

test('@interaction centered scales hand off promptly, formed forests hold longer, and every pose reverses', () => {
  const scrollHeight = journeyHeightSvh - 100
  const distance = (a: number, b: number) => (sceneToScroll(b) - sceneToScroll(a)) * scrollHeight
  expect(distance(.715, .925)).toBeCloseTo(100, 8)
  expect(distance(.805, .855)).toBeCloseTo(100 * .05 / .21, 8)
  // One uniform physical scroll span: no mid-scene speed-up at former knots.
  for (const p of [.715, .745, .765, .795, .805, .835, .855, .895]) {
    expect(distance(p, p + .01)).toBeCloseTo(100 / 21, 8)
  }
  expect(distance(.065, .14)).toBeCloseTo((.14 - .065) * 1700 * 1.7, 8)
  expect(distance(.925, 1)).toBeCloseTo((1 - .925) * 1700 * 1.65, 8)
  expect(distance(.3, .6)).toBeCloseTo(.3 * 1700, 8)
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
