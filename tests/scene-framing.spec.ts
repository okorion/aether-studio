import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { sampleJourney, sampleViewAzimuth, sampleEmblemYaw, sampleForestAzimuth, smooth, FOREST_ENTRY_START, FOREST_ENTRY_END } from '../src/Journey'
import { sampleScaleOffset, SCALE_CEILING_Y, SCALE_ROOM_CEILING_Y, SCALE_PANEL_Y } from '../src/ScaleStage'
import { sampleLayers } from '../src/SceneLayers'
import { createSpineAssembly } from '../src/SceneSpine'

test('@interaction upper camera unlock avoids a redundant full orbit', () => {
  let previous = 0, travel = 0
  for (let i = 160; i <= 200; i++) {
    const p = i / 1000, j = sampleJourney(p)
    const angle = sampleViewAzimuth(p, j.azimuth)
    expect(Math.abs(angle - previous)).toBeLessThan(.04)
    travel += Math.abs(angle - previous)
    previous = angle
  }
  expect(travel).toBeLessThan(.5)
  for (const p of [.2, .235, .305, .4, .5, .69, .8, .94]) {
    const j = sampleJourney(p)
    const old = j.azimuth + ((p < .5 ? 0 : Math.PI * 2) - j.azimuth)
      * (p < .5 ? 1 - smooth(.16, .20, p) : smooth(.69, .715, p))
    expect(Math.sin(sampleViewAzimuth(p, j.azimuth))).toBeCloseTo(Math.sin(old), 10)
    expect(Math.cos(sampleViewAzimuth(p, j.azimuth))).toBeCloseTo(Math.cos(old), 10)
  }
})

test('@interaction emblem completes one clockwise turn then a gentle reversible counterturn', () => {
  const visible = (p: number, pointer = 0) => {
    const j = sampleJourney(p), requested = j.azimuth + pointer
    const camera = sampleViewAzimuth(p, requested)
    return sampleEmblemYaw(p, j.azimuth) + (camera - requested) - camera
  }
  let previous = visible(0)
  for (let i = 1; i <= 235; i++) {
    const angle = visible(i / 1000)
    expect(angle).toBeLessThanOrEqual(previous)
    expect(previous - angle).toBeLessThan(.041)
    previous = angle
  }
  expect(visible(.235) - visible(0)).toBeCloseTo(-Math.PI * 2, 10)
  for (let i = 236; i <= 305; i++) {
    const angle = visible(i / 1000)
    expect(angle).toBeGreaterThanOrEqual(previous)
    expect(angle - previous).toBeLessThan(.007)
    previous = angle
  }
  expect(visible(.305) - visible(.235)).toBeCloseTo(.28, 10)
  for (const p of [.1, .17, .2, .27, .94].reverse()) {
    expect(visible(p, .12) - visible(p)).toBeCloseTo(-.12, 10)
    const j = sampleJourney(p)
    if (p >= .5) expect(sampleEmblemYaw(p, j.azimuth)).toBeCloseTo(.7, 10)
  }
})

test('@interaction panel approaches the incoming cut and holds its front view until the next cut', () => {
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 100)
  let lastY = -Infinity
  for (let i = 0; i <= 155; i++) {
    const p = .715 + i / 1000, j = sampleJourney(p)
    if (p <= .8) expect(j.orbitWeight).toBe(0)
    expect(j.elevation).toBeCloseTo(0, 8)
    expect(sampleViewAzimuth(p, j.azimuth)).toBeCloseTo(Math.PI * 2, 8)
    expect(j.radius).toBeCloseTo(11.6, 8)
    camera.position.set(0, j.height, j.radius); camera.lookAt(0, j.height, 0); camera.updateMatrixWorld()
    const y = sampleScaleOffset(p)
    expect(y).toBeGreaterThan(lastY); lastY = y
    const upper = new THREE.Vector3(0, j.height + y + 2.65, -.65).project(camera)
    const cut = sampleLayers(p).deviceExit
    // The panel reaches the initial incoming band. Before the water crossing
    // the wrapper must cover the entire lower half, including its slanted rim;
    // at that point the panel already fills at least the lower half as well.
    if (cut > .1 && cut < .55) expect(cut - (upper.y + 1) / 2).toBeLessThan(.15)
    if (cut >= .55) expect((upper.y + 1) / 2).toBeGreaterThan(.40)
    if (p >= .785 && p <= .815) expect(Math.abs(y)).toBeLessThan(1.2)
    expect(j.height + y).toBeCloseTo(SCALE_PANEL_Y, 8)
    expect(SCALE_CEILING_Y).toBeCloseTo(-43.212, 8)
    expect(SCALE_ROOM_CEILING_Y - SCALE_PANEL_Y).toBeGreaterThan(6)
  }
})

test('@interaction both forests halve scroll rotation across their full visible range', () => {
  for (const [a, b] of [[0, .075], [.12, .19], [.855, .925], [.935, 1]]) {
    const angle = (p: number) => sampleForestAzimuth(p, sampleJourney(p).azimuth)
    expect(angle(b) - angle(a)).toBeCloseTo((sampleJourney(b).azimuth - sampleJourney(a).azimuth) / 2, 8)
  }
})

test('@interaction lower forest replaces the panel before it leaves an empty screen and descends level', () => {
  expect(sampleLayers(FOREST_ENTRY_START).forestEntry).toBeCloseTo(-.35, 8)
  expect(sampleLayers(.825).forestEntry).toBeGreaterThan(.2)
  expect(sampleLayers(FOREST_ENTRY_END).forestEntry).toBeGreaterThan(1.1)
  // At the first visible lower edge the panel still occupies two thirds of
  // the frame, rather than leaving a long empty descent below it.
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 100)
  const firstCut = .815, pose = sampleJourney(firstCut)
  camera.position.set(0, pose.height, pose.radius)
  camera.lookAt(0, pose.height, 0); camera.updateMatrixWorld()
  const bottom = new THREE.Vector3(0, SCALE_PANEL_Y - 2.65, -.65).project(camera)
  expect((bottom.y + 1) / 2).toBeLessThan(.34)
  let previous = Infinity
  for (let i = 0; i <= 175; i++) {
    const p = .825 + i / 1000, pose = sampleJourney(p)
    expect(pose.elevation).toBe(0)
    const eyeY = pose.height + Math.sin(pose.elevation) * (pose.radius + 4.8)
    expect(eyeY).toBeLessThan(previous)
    previous = eyeY
  }
})

test('@interaction lower forest rotation has no late catch-up and restores the same pose on reverse', () => {
  let previousAngle = sampleForestAzimuth(.8, sampleJourney(.8).azimuth)
  let previousStep = 0
  for (let i = 1; i <= 200; i++) {
    const p = .8 + i / 1000, j = sampleJourney(p)
    const angle = sampleForestAzimuth(p, j.azimuth), step = angle - previousAngle
    expect(step).toBeGreaterThanOrEqual(0)
    expect(step).toBeLessThan(.0136)
    expect(Math.abs(step - previousStep)).toBeLessThan(.00028)
    expect(sampleJourney(p - .001).azimuth).toBeLessThan(j.azimuth)
    previousAngle = angle; previousStep = step
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
