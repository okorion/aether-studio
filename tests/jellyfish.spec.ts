import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSceneJellyfish, sampleJellyStroke } from '../src/SceneJellyfish'

test('@interaction 벨 크리처의 수축과 촉수 연결은 반복 경계에서도 연속이다', () => {
  const scene = new THREE.Scene()
  const chrome = new THREE.MeshStandardMaterial()
  const jellyfish = createSceneJellyfish(scene, false, false, chrome)
  const root = jellyfish.group.children[0]
  const bell = root.getObjectByName('bell') as THREE.Mesh<THREE.BufferGeometry>
  const rim = root.getObjectByName('rim')!
  const strands = root.children.filter(child => child instanceof THREE.Line) as THREE.Line[]
  const positions = () => Array.from(bell.geometry.attributes.position.array)
  const tip = () => Array.from(strands[0].geometry.attributes.position.array).slice(-3)
  const geometryIds = root.children.map(child => (child as THREE.Mesh).geometry.uuid)
  const open = positions()
  const initialTip = tip()
  jellyfish.update(2.7 * .24, 0)
  expect(positions()).not.toEqual(open)
  expect(tip()).not.toEqual(initialTip)
  expect(rim.scale.x).toBeCloseTo(.7)
  // Roots follow the rim in both the relaxed and contracted poses.
  for (const time of [0, .648, 1.3, 2.7, 30, 600]) {
    jellyfish.update(time, 0)
    for (const strand of strands) {
      const attribute = strand.geometry.attributes.position
      expect(Math.hypot(attribute.getX(0), attribute.getZ(0))).toBeCloseTo(.23 * rim.scale.x, 6)
      expect(attribute.getY(0)).toBeCloseTo(rim.position.y, 6)
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true)
      // Adjacent segments must not form the old randomly changing-length kinks.
      for (let vertex = 1; vertex < attribute.count; vertex++) {
        const a = new THREE.Vector3().fromBufferAttribute(attribute, vertex - 1)
        const b = new THREE.Vector3().fromBufferAttribute(attribute, vertex)
        expect(a.distanceTo(b)).toBeLessThan(.08)
      }
    }
  }
  jellyfish.update(2.7 - 1e-5, 0)
  const before = [...root.position.toArray(), ...positions(), ...tip()]
  jellyfish.update(2.7 + 1e-5, 0)
  const after = [...root.position.toArray(), ...positions(), ...tip()]
  expect(Math.max(...before.map((value, i) => Math.abs(value - after[i])))).toBeLessThan(.0001)
  expect(root.children.map(child => (child as THREE.Mesh).geometry.uuid)).toEqual(geometryIds)
  jellyfish.dispose()
  chrome.dispose()
})

test('@interaction 벨 크리처는 정지 시간, 재진입, 품질별 개수와 자원 해제를 유지한다', () => {
  for (const [software, mobile, count] of [[false, false, 8], [false, true, 4], [true, false, 2]] as const) {
    const scene = new THREE.Scene()
    const chrome = new THREE.MeshStandardMaterial()
    const jellyfish = createSceneJellyfish(scene, software, mobile, chrome)
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
    chrome.dispose()
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
