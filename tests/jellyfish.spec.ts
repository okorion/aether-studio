import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSceneJellyfish, sampleJellyStroke } from '../src/SceneJellyfish'
import { sceneToScroll } from '../src/ScrollTimeline'

test('@interaction 상단과 하단 포레스트의 해파리 셰이더가 오류 없이 준비된다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.experience')).toHaveAttribute('data-loading-state', 'ready', { timeout: 60000 })
  for (const progress of [.18, .5, .91, 1, 0]) {
    await page.evaluate(scroll => window.scrollTo({ top: scroll * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }), sceneToScroll(progress))
    await expect.poll(async () => Number(await page.locator('.scene-canvas').getAttribute('data-render-progress'))).toBeCloseTo(progress, 2)
  }
  expect(errors).toEqual([])
})

test('@interaction 벨 크리처의 수축과 촉수 연결은 반복 경계에서도 연속이다', () => {
  const scene = new THREE.Scene()
  const jellyfish = createSceneJellyfish(scene, false, false)
  const root = jellyfish.group.children[0]
  const bell = root.getObjectByName('bell') as THREE.Mesh<THREE.BufferGeometry>
  const rim = root.getObjectByName('rim') as THREE.Mesh<THREE.BufferGeometry>
  const threads = root.getObjectByName('tentacles') as THREE.Mesh<THREE.BufferGeometry>
  const positions = () => Array.from(bell.geometry.attributes.position.array)
  const tip = () => Array.from(threads.geometry.attributes.position.array).slice(-15)
  const geometryIds = root.children.map(child => (child as THREE.Mesh).geometry.uuid)
  const open = positions()
  const initialTip = tip()
  const openRadius = bell.geometry.attributes.position.getX(16 * 65)
  jellyfish.update(2.7 * .24, 0)
  expect(positions()).not.toEqual(open)
  expect(tip()).not.toEqual(initialTip)
  expect(bell.geometry.attributes.position.getX(16 * 65) / openRadius).toBeCloseTo(.7)
  for (const time of [0, .648, 1.3, 2.7, 30, 600]) {
    jellyfish.update(time, 0)
    // Bell edge and frill share the same vertices throughout the stroke.
    const edge = bell.geometry.attributes.position
    const fringe = rim.geometry.attributes.position
    for (let col = 0; col <= 64; col++) {
      const a = new THREE.Vector3().fromBufferAttribute(edge, 16 * 65 + col)
      const b = new THREE.Vector3().fromBufferAttribute(fringe, col)
      expect(a.distanceTo(b)).toBeLessThan(1e-6)
    }
    // Opposite vertices recover the tube center, anchored to the skirt.
    const tubes = threads.geometry.attributes.position
    const center = new THREE.Vector3().fromBufferAttribute(tubes, 0)
      .add(new THREE.Vector3().fromBufferAttribute(tubes, 2)).multiplyScalar(.5)
    expect(center.distanceTo(new THREE.Vector3().fromBufferAttribute(fringe, 0))).toBeLessThan(1e-6)
    for (const child of root.children as THREE.Mesh<THREE.BufferGeometry>[]) {
      const attribute = child.geometry.attributes.position
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true)
      expect(Array.from(child.geometry.attributes.normal.array).every(Number.isFinite)).toBe(true)
    }
    // Every filament has one stable length and a continuous centerline.
    for (let strand = 0; strand < 12; strand++) for (let row = 1; row <= 28; row++) {
      const vertex = (strand * 29 + row) * 5
      const a = new THREE.Vector3().fromBufferAttribute(tubes, vertex - 5)
      const b = new THREE.Vector3().fromBufferAttribute(tubes, vertex)
      expect(a.distanceTo(b)).toBeLessThan(.08)
    }
  }
  jellyfish.update(2.7 - 1e-5, 0)
  const before = [...root.position.toArray(), ...positions(), ...tip()]
  jellyfish.update(2.7 + 1e-5, 0)
  const after = [...root.position.toArray(), ...positions(), ...tip()]
  expect(Math.max(...before.map((value, i) => Math.abs(value - after[i])))).toBeLessThan(.0001)
  expect(root.children.map(child => (child as THREE.Mesh).geometry.uuid)).toEqual(geometryIds)
  jellyfish.dispose()
})

test('@interaction 벨 크리처는 정지 시간, 재진입, 품질별 개수와 자원 해제를 유지한다', () => {
  for (const [software, mobile, count] of [[false, false, 8], [false, true, 4], [true, false, 2]] as const) {
    const scene = new THREE.Scene()
    const jellyfish = createSceneJellyfish(scene, software, mobile)
    expect(jellyfish.group.children).toHaveLength(count)
    const root = jellyfish.group.children[0]
    const read = () => JSON.stringify(root.toJSON())
    jellyfish.update(12, 0)
    const paused = read()
    jellyfish.update(12, 0)
    expect(read()).toBe(paused)
    jellyfish.update(12, .5)
    expect(jellyfish.group.visible).toBe(false)
    jellyfish.update(12, 0)
    expect(read()).toBe(paused)
    jellyfish.update(12, 1)
    expect(jellyfish.group.visible).toBe(true)
    expect(jellyfish.group.children.filter(child => child.visible)).toHaveLength(count / 2)
    expect(root.visible).toBe(false)
    const lower = jellyfish.group.children[count / 2]
    expect(lower.position.y).toBeLessThan(-59)
    // A lower-quality profile must not restart the upper forest's anchor list.
    const expectedAnchor = software ? [-3.5, -63.5, -2] : mobile ? [5.5, -65.3, -5] : [3.2, -60.2, -3]
    expect(lower.position.distanceTo(new THREE.Vector3(...expectedAnchor))).toBeLessThan(1)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    jellyfish.group.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        geometries.add(child.geometry)
        materials.add(child.material)
      }
    })
    let disposedGeometries = 0, disposedMaterials = 0
    geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposedGeometries++))
    materials.forEach(material => material.addEventListener('dispose', () => disposedMaterials++))
    jellyfish.dispose()
    jellyfish.dispose()
    jellyfish.update(13, 0)
    expect(disposedGeometries).toBe(geometries.size)
    expect(disposedMaterials).toBe(materials.size)
    expect(scene.children).toHaveLength(0)
  }
})

test('@interaction 벨 크리처의 빠른 수축과 느린 회복은 서로 다른 박자로 반복된다', () => {
  expect(sampleJellyStroke(0, 0, 3).contraction).toBe(0)
  expect(sampleJellyStroke(.72, 0, 3).contraction).toBe(1)
  expect(sampleJellyStroke(3, 0, 3).contraction).toBe(0)
  expect(sampleJellyStroke(.4, 0, 3)).not.toEqual(sampleJellyStroke(.4, .38, 3.2))
  // Propulsion grows during contraction and settles smoothly during refill.
  expect(sampleJellyStroke(.72, 0, 3).surge).toBeGreaterThan(sampleJellyStroke(.2, 0, 3).surge)
})
