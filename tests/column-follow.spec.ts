import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { createColumnFollow } from '../src/ColumnFollow'
import { createSpineAssembly } from '../src/SceneSpine'
import { sampleJourney } from '../src/Journey'

test('@interaction chain leads the column in both scroll directions and settles to the same pose', () => {
  for (const direction of [-1, 1]) {
    const target = .42 + direction * .004
    const follow = createColumnFollow(.42)
    const assembly = createSpineAssembly(true, false)
    const immediate = createSpineAssembly(true, false)
    const parent = new THREE.Group(); parent.add(assembly.group)
    const chains = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    const bones = assembly.group.getObjectByName('aether-spine-vertebrae') as THREE.InstancedMesh
    const pose = (mesh: THREE.InstancedMesh) => Array.from(mesh.instanceMatrix.array)
    try {
      assembly.update(.42, 1, 1)
      const before = pose(bones)
      const delayed = follow.update(target, 1 / 60)
      expect((target - delayed) * direction).toBeGreaterThan(0)
      expect((delayed - .42) * direction).toBeGreaterThan(0)
      parent.rotation.y = sampleJourney(delayed).structureYaw
      assembly.update(target, 1, 1, false, undefined, delayed)
      immediate.update(target, 1, 1)
      const immediateBones = immediate.group.getObjectByName('aether-spine-vertebrae') as THREE.InstancedMesh
      const immediateChain = immediate.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
      expect(pose(chains)).toEqual(pose(immediateChain))
      expect(parent.rotation.y + chains.rotation.y).toBeCloseTo(sampleJourney(target).structureYaw, 12)
      expect(pose(bones)).not.toEqual(before)
      expect(pose(bones)).not.toEqual(pose(immediateBones))
      let settled = delayed
      for (let i = 0; i < 90; i++) settled = follow.update(target, 1 / 60)
      expect(settled).toBe(target)
      assembly.update(target, 1, 1, false, undefined, settled)
      expect(pose(bones)).toEqual(pose(immediateBones))
      expect(chains.rotation.y).toBe(0)
    } finally { assembly.dispose(); immediate.dispose() }
  }
})

test('@interaction column follow is frame-rate independent, bounded and immediate when paused', () => {
  const result = (hz: number) => {
    const follow = createColumnFollow(.42)
    let value = .42
    for (let i = 0; i < hz / 5; i++) value = follow.update(.424, 1 / hz)
    return value
  }
  expect(result(30)).toBeCloseTo(result(60), 12)
  expect(result(60)).toBeCloseTo(result(120), 12)
  const follow = createColumnFollow(.3)
  expect(.6 - follow.update(.6, 1 / 60)).toBeLessThanOrEqual(.00600001)
  expect(follow.update(.4, 1 / 60, true)).toBe(.4)
  expect(follow.update(.7, 0)).toBe(.4)
  expect(follow.update(1, 1 / 60)).toBe(1)
})
