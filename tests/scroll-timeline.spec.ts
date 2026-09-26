import { test, expect } from '@playwright/test'
import { journeyHeightSvh, sceneToScroll, scrollToScene } from '../src/ScrollTimeline'

test('@interaction centered scales hand off promptly, formed forests hold longer, and every pose reverses', () => {
  const scrollHeight = journeyHeightSvh - 100
  const distance = (a: number, b: number) => (sceneToScroll(b) - sceneToScroll(a)) * scrollHeight
  expect(distance(.785, .855)).toBeCloseTo(100, 8)
  expect(distance(.715, .785)).toBeCloseTo(119, 8)
  expect(distance(.855, 1)).toBeCloseTo(119 + .075 * 1700 * 1.65, 8)
  expect(distance(.805, .855)).toBeCloseTo(100 * .05 / .07, 8)
  // One uniform physical scroll span: no mid-scene speed-up at former knots.
  for (const p of [.715, .745, .765, .855, .895]) {
    expect(distance(p, p + .01)).toBeCloseTo(17, 8)
  }
  expect(distance(.065, .14)).toBeCloseTo((.14 - .065) * 1700 * 1.7, 8)
  expect(distance(.945, 1)).toBeCloseTo((1 - .945) * 1700 * 1.65, 8)
  // A small wheel step cannot abruptly change the camera's scroll speed.
  for (const p of [.905, .925, .945]) {
    const before = distance(p - .0001, p), after = distance(p, p + .0001)
    expect(Math.abs(after / before - 1)).toBeLessThan(.002)
  }
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
