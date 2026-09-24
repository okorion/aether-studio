import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSpineAssembly } from '../src/SceneSpine'
import { sampleJourney } from '../src/Journey'

test('@interaction chain keeps its column-local shape and orientation throughout both turns', () => {
  const assembly = createSpineAssembly(false, false)
  const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
  const bones = assembly.group.getObjectByName('aether-spine-vertebrae') as THREE.InstancedMesh
  const matrix = new THREE.Matrix4()
  try {
    expect(chain.parent).toBe(bones.parent)
    assembly.update(.30, 1, 1)
    const initial = Array.from({ length: chain.count }, (_, i) => {
      chain.getMatrixAt(i, matrix)
      return matrix.clone()
    })
    let previousY = initial[0].elements[13]
    let maxLocalError = 0, maxWorldError = 0
    for (let step = 1; step <= 350; step++) {
      const progress = .30 + step / 1000
      assembly.update(progress, 1, 1)
      const journey = sampleJourney(progress)
      assembly.group.position.y = journey.height
      assembly.group.rotation.y = journey.structureYaw
      assembly.group.updateMatrixWorld(true)
      chain.getMatrixAt(0, matrix)
      const travel = matrix.elements[13] - initial[0].elements[13]
      expect(matrix.elements[13]).toBeLessThan(previousY)
      previousY = matrix.elements[13]
      for (let i = 0; i < chain.count; i++) {
        chain.getMatrixAt(i, matrix)
        // All 42 local frames stay fixed apart from one shared Y translation.
        // This rejects a camera-facing endpoint or inverse-yaw link orientation.
        for (let e = 0; e < 16; e++) {
          maxLocalError = Math.max(maxLocalError,
            Math.abs(matrix.elements[e] - initial[i].elements[e] - (e === 13 ? travel : 0)))
        }
        const actual = chain.localToWorld(new THREE.Vector3().setFromMatrixPosition(matrix))
        const expected = new THREE.Vector3().setFromMatrixPosition(initial[i])
        expected.y += travel
        expected.applyAxisAngle(new THREE.Vector3(0, 1, 0), journey.structureYaw)
        expected.y += journey.height
        maxWorldError = Math.max(maxWorldError, actual.distanceTo(expected))
      }
    }
    expect(maxLocalError).toBeLessThan(.00001)
    expect(maxWorldError).toBeLessThan(.00001)
  } finally { assembly.dispose() }
})

test('@interaction one finite chain stays connected, descends continuously and restores on reverse scroll', () => {
  for (const [software, mobile] of [[false, false], [false, true], [true, false]]) {
    const assembly = createSpineAssembly(software, mobile)
    const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
    let minScale = Infinity, maxScale = -Infinity
    const sample = (progress: number) => {
      assembly.update(progress, 1, 1)
      const journey = sampleJourney(progress)
      assembly.group.position.y = journey.height
      assembly.group.rotation.y = journey.structureYaw
      assembly.group.updateMatrixWorld(true)
      return Array.from({ length: chain.count }, (_, i) => {
        chain.getMatrixAt(i, matrix)
        matrix.decompose(position, rotation, scale)
        minScale = Math.min(minScale, scale.x, scale.y, scale.z)
        maxScale = Math.max(maxScale, scale.x, scale.y, scale.z)
        return chain.localToWorld(position.clone())
      })
    }
    try {
      expect(chain.count).toBe(42)
      const initial = sample(.30)
      let previous = initial
      let maxStep = 0, minSpacing = Infinity, maxSpacing = 0, maxRise = -Infinity
      for (let step = 1; step <= 350; step++) {
        const progress = .30 + step / 1000
        const points = sample(progress)
        maxRise = Math.max(maxRise, points[0].y - previous[0].y)
        for (let i = 0; i < points.length; i++) {
          // A recycled link would jump the full length of the old strand.
          maxStep = Math.max(maxStep, points[i].distanceTo(previous[i]))
          if (i) {
            const spacing = points[i].distanceTo(points[i - 1])
            minSpacing = Math.min(minSpacing, spacing)
            maxSpacing = Math.max(maxSpacing, spacing)
          }
        }
        previous = points
      }
      expect(maxRise).toBeLessThan(0)
      expect(maxStep).toBeLessThan(.15)
      expect(minSpacing).toBeGreaterThan(.40)
      expect(maxSpacing).toBeLessThan(.45)
      expect(minScale).toBeCloseTo(1, 5)
      expect(maxScale).toBeCloseTo(1, 5)
      expect(sample(.30)).toEqual(initial)
      expect(sample(.30)).toEqual(initial)
    } finally { assembly.dispose() }
  }
})

test('@interaction free end remains full size inside desktop and mobile viewports', () => {
  for (const mobile of [false, true]) {
    const assembly = createSpineAssembly(false, mobile)
    const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    const matrix = new THREE.Matrix4()
    const camera = new THREE.PerspectiveCamera(42, mobile ? 390 / 844 : 1440 / 900, .1, 90)
    chain.geometry.computeBoundingBox()
    const bounds = chain.geometry.boundingBox!
    let maxX = 0, maxY = 0, minZ = Infinity, maxZ = -Infinity
    try {
      for (let step = 0; step <= 350; step++) {
        const progress = .30 + step / 1000
        const journey = sampleJourney(progress)
        assembly.update(progress, 1, 1)
        assembly.group.position.y = journey.height
        assembly.group.rotation.y = journey.structureYaw
        assembly.group.updateMatrixWorld(true)
        const radius = journey.radius + (mobile ? 4.8 : 0)
        camera.position.set(Math.sin(journey.azimuth) * Math.cos(journey.elevation) * radius,
          journey.height + Math.sin(journey.elevation) * radius,
          Math.cos(journey.azimuth) * Math.cos(journey.elevation) * radius)
        camera.lookAt(0, journey.height, 0)
        camera.updateMatrixWorld()
        chain.getMatrixAt(0, matrix)
        // Include the terminal link's width and thickness as well as its tips.
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const tip = chain.localToWorld(new THREE.Vector3(x, y, z).applyMatrix4(matrix)).project(camera)
          maxX = Math.max(maxX, Math.abs(tip.x))
          maxY = Math.max(maxY, Math.abs(tip.y))
          minZ = Math.min(minZ, tip.z)
          maxZ = Math.max(maxZ, tip.z)
        }
      }
      expect(maxX, `horizontal bounds, mobile ${mobile}`).toBeLessThan(.95)
      expect(maxY, `vertical bounds, mobile ${mobile}`).toBeLessThan(.95)
      expect(minZ).toBeGreaterThan(-1)
      expect(maxZ).toBeLessThan(1)
    } finally { assembly.dispose() }
  }
})
