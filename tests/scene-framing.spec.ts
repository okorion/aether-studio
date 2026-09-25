import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { sampleJourney, sampleViewAzimuth } from '../src/Journey'
import { sampleScaleOffset, SCALE_CEILING_CLEARANCE } from '../src/ScaleStage'
import { sampleLayers } from '../src/SceneLayers'
import { createSpineAssembly } from '../src/SceneSpine'

test('@interaction panel approaches the incoming cut and holds its front view until the next cut', () => {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 100)
  let lastY = -Infinity
  for (let i = 0; i <= 210; i++) {
    const p = .715 + i / 1000, j = sampleJourney(p)
    expect(j.orbitWeight).toBe(0)
    expect(j.elevation).toBeCloseTo(0, 8)
    expect(sampleViewAzimuth(p, j.azimuth)).toBeCloseTo(Math.PI * 2, 8)
    expect(j.radius).toBeCloseTo(11.6, 8)
    camera.position.set(0, j.height, j.radius); camera.lookAt(0, j.height, 0); camera.updateMatrixWorld()
    const y = sampleScaleOffset(p)
    expect(y).toBeGreaterThanOrEqual(lastY); lastY = y
    const upper = new THREE.Vector3(0, j.height + y + 2.65, -.65).project(camera)
    const cut = sampleLayers(p).deviceExit
    // Once a useful part of the incoming band is visible, its panel is already
    // within 15% of screen height of that edge, never below a long empty room.
    if (p >= .739 && p <= .755) expect(cut - (upper.y + 1) / 2).toBeLessThan(.15)
    if (p >= .785 && p <= .855) expect(y).toBeCloseTo(0, 8)
    expect(SCALE_CEILING_CLEARANCE).toBeGreaterThan(2.65)
  }
})

test('@interaction vertebral bodies keep level joints and an open arch while retaining progressive yaw', () => {
  const assembly = createSpineAssembly(false, false)
  try {
    expect(assembly.group.children.map(mesh => mesh.name).sort()).toEqual(['aether-spine-chain','aether-spine-vertebrae'])
    const bones = assembly.group.getObjectByName('aether-spine-vertebrae') as THREE.InstancedMesh
    const matrix = new THREE.Matrix4(), axis = new THREE.Vector3()
    for (const p of [.31, .43, .54, .62]) {
      assembly.update(p, 1, 1)
      for (let i = 0; i < bones.count; i++) {
        bones.getMatrixAt(i, matrix)
        if (new THREE.Vector3().setFromMatrixScale(matrix).length() < .01) continue
        axis.set(0,1,0).transformDirection(matrix)
        expect(axis.y).toBeCloseTo(1, 6)
      }
    }
    const pos = bones.geometry.getAttribute('position')
    const normal = bones.geometry.getAttribute('normal')
    const tops: number[] = [], bottoms: number[] = []
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > -.4 || Math.abs(pos.getX(i)) > .6) continue
      if (normal.getY(i) > .9) tops.push(pos.getY(i))
      if (normal.getY(i) < -.9) bottoms.push(pos.getY(i))
    }
    for (const surface of [tops, bottoms]) {
      surface.sort((a,b)=>a-b)
      expect(surface.length).toBeGreaterThan(50)
      expect(surface[Math.floor(surface.length*.90)]-surface[Math.floor(surface.length*.10)]).toBeLessThan(.095)
    }
  } finally { assembly.dispose() }
})
