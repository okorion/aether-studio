import { test, expect } from '@playwright/test'
import { createFlowerAttributes, createFlowerSurface } from '../src/FlowerGeometry'

test('@interaction petals have real depth and flower samples preserve normals, colors and chain clearance', () => {
  const surface = createFlowerSurface()
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 2; i < surface.vertices.length; i += 3) {
    minZ = Math.min(minZ, surface.vertices[i]); maxZ = Math.max(maxZ, surface.vertices[i])
  }
  expect(maxZ - minZ).toBeGreaterThan(.9)
  expect(surface.area).toBeGreaterThan(10)
  const count = 12000, seeds = new Float32Array(count * 3), dust = new Float32Array(count * 4), advected = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    seeds.set([i / count, 1.43, .3], i * 3); dust.set([i % 2 ? .3 : .72, 1, 0, -1], i * 4)
  }
  const flowers = createFlowerAttributes(seeds, dust, advected)
  let minRadius = Infinity, maxNormalError = 0, joins = 0
  const octants = new Set<number>(), hues = new Set<number>()
  for (let i = 0; i < count; i++) {
    const [x, y, z] = flowers.normals.subarray(i * 3, i * 3 + 3)
    if (x === 0 && y === 0 && z === 0) continue
    minRadius = Math.min(minRadius, Math.hypot(flowers.positions[i * 4], flowers.positions[i * 4 + 2]))
    maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(x, y, z) - 1))
    octants.add((x > 0 ? 1 : 0) + (y > 0 ? 2 : 0) + (z > 0 ? 4 : 0))
    const r = flowers.colors[i * 3], g = flowers.colors[i * 3 + 1], b = flowers.colors[i * 3 + 2]
    hues.add(Math.round(Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 3))
    if (flowers.positions[i * 4 + 3]) joins++
  }
  expect(maxNormalError).toBeLessThan(.00001)
  expect(octants.size).toBe(8)
  expect(hues.size).toBeGreaterThan(5)
  expect(minRadius).toBeGreaterThan(2.299)
  expect(joins / count).toBeGreaterThan(.08)
  expect(joins / count).toBeLessThan(.26)
  expect(createFlowerAttributes(seeds, dust, advected)).toEqual(flowers)
})
