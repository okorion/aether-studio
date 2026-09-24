import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSpineAssembly } from '../src/SceneSpine'
import { sampleJourney } from '../src/Journey'

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
    try {
      for (const progress of [.30, .35, .40, .45, .50, .55, .60, .64]) {
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
        // Check both tips of the physical terminal link, not just its centre.
        for (const y of [-.327, .327]) {
          const tip = chain.localToWorld(new THREE.Vector3(0, y, 0).applyMatrix4(matrix)).project(camera)
          expect(Math.abs(tip.x), `x at ${progress}, mobile ${mobile}`).toBeLessThan(.95)
          expect(Math.abs(tip.y), `y at ${progress}, mobile ${mobile}`).toBeLessThan(.95)
          expect(tip.z).toBeGreaterThan(-1)
          expect(tip.z).toBeLessThan(1)
        }
      }
    } finally { assembly.dispose() }
  }
})
