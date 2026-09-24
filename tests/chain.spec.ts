import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSpineAssembly } from '../src/SceneSpine'
import { sampleJourney, smooth } from '../src/Journey'
import { sampleChainPath } from '../src/SceneChain'

test('@interaction resizing at rest synchronizes strand count and travel with the camera mode', () => {
  for (const initialMobile of [false, true]) {
    const assembly = createSpineAssembly(false, initialMobile)
    const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    const allocation = chain.instanceMatrix.array
    const matrix = new THREE.Matrix4(), expectedMatrix = new THREE.Matrix4()
    try {
      for (const progress of [.31, .46, .61]) {
        for (const mobileView of [initialMobile, !initialMobile, initialMobile]) {
          // Same scroll and emergence: a resize must invalidate the pose cache.
          assembly.update(progress, 1, 1, mobileView)
          const fresh = createSpineAssembly(false, mobileView)
          try {
            fresh.update(progress, 1, 1)
            const expected = fresh.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
            expect(chain.count).toBe(mobileView ? 52 : 40)
            expect(chain.instanceMatrix.array).toBe(allocation)
            for (let i = 0; i < chain.count; i++) {
              chain.getMatrixAt(i, matrix)
              expected.getMatrixAt(i, expectedMatrix)
              expect(matrix.elements).toEqual(expectedMatrix.elements)
            }
          } finally { fresh.dispose() }
        }
      }
    } finally { assembly.dispose() }
  }
})

test('@interaction chain feeds diagonally while retaining its descent timing', () => {
  const slope = sampleChainPath(.48).getTangentAt(0)
  const degrees = Math.atan2(Math.abs(slope.y), Math.hypot(slope.x, slope.z)) * 180 / Math.PI
  expect(degrees).toBeGreaterThan(50)
  expect(degrees).toBeLessThan(54)
  // Two 120px wheel steps on the desktop's 15300px scroll range.
  // Feed the upper terminal quickly through the first half of the column.
  const delta = 240 / 15300
  for (const p of [.32, .35, .38]) {
    const drop = sampleChainPath(p).getPointAt(0).y - sampleChainPath(p + delta).getPointAt(0).y
    expect(drop).toBeGreaterThan(.35)
    expect(drop).toBeLessThan(.65)
  }
  const top = sampleChainPath(.29).getPointAt(0)
  const bottom = sampleChainPath(.65).getPointAt(0)
  expect(top.y - bottom.y).toBeCloseTo(6.25)
})

test('@interaction scroll advances links along the diagonal, including sideways travel', () => {
  for (const mobile of [false, true]) {
    for (let p = .30; p < .65; p += .001) {
      const path = sampleChainPath(p, mobile)
      const next = sampleChainPath(p + .0001, mobile)
      for (const t of [0, .15, .3]) {
        const movement = next.getPointAt(t).sub(path.getPointAt(t))
        // Measure the feed separately from the shared parent rotation. A
        // vertical translation or the previous near-vertical pitch fails.
        const lateralPerDrop = Math.hypot(movement.x, movement.z) / -movement.y
        expect(lateralPerDrop).toBeGreaterThan(.75)
        expect(lateralPerDrop).toBeLessThan(.80)
        expect(movement.normalize().dot(path.getTangentAt(t))).toBeGreaterThan(.99999)
      }
    }
  }
})

test('@interaction independent feed reinforces the shared rotation and eases without a mid-scene stall', () => {
  let previousSpeed = Infinity
  const delta = .00001
  for (let step = 0; step <= 360; step++) {
    const p = .29 + step / 1000
    const a = sampleChainPath(p).getPointAt(0)
    const b = sampleChainPath(p + delta).getPointAt(0)
    const speed = (a.y - b.y) / delta
    const localAngle = Math.atan2(Math.sin(Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x)),
      Math.cos(Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x)))
    // In X/Z, Three.js positive Y rotation decreases atan2(z, x).
    const parentAngle = sampleJourney(p).structureYaw - sampleJourney(p + delta).structureYaw
    expect(localAngle * parentAngle).toBeGreaterThan(0)
    expect(Math.abs(localAngle + parentAngle)).toBeGreaterThan(Math.abs(parentAngle))
    expect(speed).toBeGreaterThan(5.9)
    expect(speed).toBeLessThanOrEqual(previousSpeed + .0001)
    if (step) expect(previousSpeed - speed).toBeLessThan(.15)
    previousSpeed = speed
  }
  // No separate temporal animation: stopping/reversing the scene scroll fully
  // determines the strand pose, including either side of the feed endpoints.
  for (const p of [.29, .65]) {
    const before = sampleChainPath(p - delta).getPointAt(0)
    const at = sampleChainPath(p).getPointAt(0)
    const after = sampleChainPath(p + delta).getPointAt(0)
    expect(before.sub(at).length() / delta).toBeCloseTo(after.sub(at).length() / delta, 2)
  }
})

test('@interaction the lower terminal remains below the frame throughout column entry and descent', () => {
  for (const mobile of [false, true]) {
    const assembly = createSpineAssembly(false, mobile)
    const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    chain.geometry.computeBoundingBox()
    const bounds = chain.geometry.boundingBox!, matrix = new THREE.Matrix4()
    const camera = new THREE.PerspectiveCamera(42, mobile ? 390 / 844 : 1440 / 900, .1, 90)
    try {
      for (let step = 0; step <= 420; step++) {
        const p = .23 + step / 1000, journey = sampleJourney(p)
        const emergence = smooth(.205, .29, p)
        assembly.update(p, 1, emergence)
        assembly.group.position.y = journey.height - 12 * (1 - emergence)
        assembly.group.rotation.y = journey.structureYaw
        assembly.group.updateMatrixWorld(true)
        const radius = journey.radius + (mobile ? 4.8 : 0)
        camera.position.set(Math.sin(journey.azimuth) * Math.cos(journey.elevation) * radius,
          journey.height + Math.sin(journey.elevation) * radius,
          Math.cos(journey.azimuth) * Math.cos(journey.elevation) * radius)
        camera.lookAt(0, journey.height, 0)
        camera.updateMatrixWorld()
        chain.getMatrixAt(chain.count - 1, matrix)
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const point = chain.localToWorld(new THREE.Vector3(x, y, z).applyMatrix4(matrix)).project(camera)
          expect((1 - point.y) / 2, `lower terminal at ${p}, mobile ${mobile}`).toBeGreaterThan(1.1)
        }
      }
    } finally { assembly.dispose() }
  }
})

test('@interaction links feed through preceding positions on a fixed column-local helix', () => {
  const assembly = createSpineAssembly(false, false)
  const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
  const bones = assembly.group.getObjectByName('aether-spine-vertebrae') as THREE.InstancedMesh
  const matrix = new THREE.Matrix4()
  try {
    expect(chain.parent).toBe(bones.parent)
    const sample = (p: number) => {
      assembly.update(p, 1, 1)
      return Array.from({ length: chain.count }, (_, i) => {
        chain.getMatrixAt(i, matrix)
        return matrix.clone()
      })
    }
    const initial = sample(.30)
    let previousY = initial[0].elements[13], angularTravel = 0
    let previousAngle = Math.atan2(initial[0].elements[14], initial[0].elements[12])
    let maxWorldError = 0
    for (let step = 1; step <= 350; step++) {
      const progress = .30 + step / 1000
      assembly.update(progress, 1, 1)
      const journey = sampleJourney(progress)
      assembly.group.position.y = journey.height
      assembly.group.rotation.y = journey.structureYaw
      assembly.group.updateMatrixWorld(true)
      chain.getMatrixAt(0, matrix)
      expect(matrix.elements[13]).toBeLessThan(previousY)
      previousY = matrix.elements[13]
      const angle = Math.atan2(matrix.elements[14], matrix.elements[12])
      angularTravel += Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))
      previousAngle = angle
      for (let i = 0; i < chain.count; i++) {
        chain.getMatrixAt(i, matrix)
        const actual = chain.localToWorld(new THREE.Vector3().setFromMatrixPosition(matrix))
        const expected = new THREE.Vector3().setFromMatrixPosition(matrix)
        expected.applyAxisAngle(new THREE.Vector3(0, 1, 0), journey.structureYaw)
        expected.y += journey.height
        maxWorldError = Math.max(maxWorldError, actual.distanceTo(expected))
      }
    }
    expect(maxWorldError).toBeLessThan(.00001)
    expect(initial[0].elements[13] - previousY).toBeGreaterThan(5.8)
    expect(angularTravel).toBeLessThan(-1)

    // Find when link 0 reaches the old height of link 6. All following links
    // must pass through their predecessor's full local frame. A translated or
    // camera-facing spiral fails this even if its tip moves down on screen.
    let low = .30, high = .65
    for (let step = 0; step < 32; step++) {
      const mid = (low + high) / 2
      if (sample(mid)[0].elements[13] > initial[6].elements[13]) low = mid
      else high = mid
    }
    const advanced = sample((low + high) / 2)
    let maxTrackError = 0
    for (let i = 0; i < chain.count - 6; i++) {
      for (let e = 0; e < 16; e++) {
        maxTrackError = Math.max(maxTrackError, Math.abs(advanced[i].elements[e] - initial[i + 6].elements[e]))
      }
    }
    expect(maxTrackError).toBeLessThan(.00001)
    expect(sample(.30)).toEqual(initial)
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
      expect(chain.count).toBe(mobile ? 52 : 40)
      const initial = sample(.30)
      let previous = initial
      let maxStep = 0, minSpacing = Infinity, maxSpacing = 0, maxRise = -Infinity
      let minTangentAlignment = 1
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
            chain.getMatrixAt(i - 1, matrix)
            const alongLink = new THREE.Vector3(0, 1, 0).transformDirection(matrix)
              .transformDirection(chain.matrixWorld)
            const alongChain = points[i].clone().sub(points[i - 1]).normalize()
            minTangentAlignment = Math.min(minTangentAlignment, alongLink.dot(alongChain))
          }
        }
        previous = points
      }
      expect(maxRise).toBeLessThan(0)
      expect(maxStep).toBeLessThan(.15)
      expect(minSpacing).toBeGreaterThan(.40)
      expect(maxSpacing).toBeLessThan(.45)
      expect(minTangentAlignment).toBeGreaterThan(.99)
      expect(minScale).toBeCloseTo(1, 5)
      expect(maxScale).toBeCloseTo(1, 5)
      expect(sample(.30)).toEqual(initial)
      expect(sample(.30)).toEqual(initial)
    } finally { assembly.dispose() }
  }
})

test('@interaction upper end stays in view while the strand continues below the viewport', () => {
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
        // Use complete link bounds, including the closed upper cap. Measure
        // viewport coverage before ordinary monitor/bone depth occlusion.
        if ([10, 160, 310].includes(step)) {
          const terminal = chain.localToWorld(new THREE.Vector3().setFromMatrixPosition(matrix))
          const normal = new THREE.Vector3(0, 0, 1).transformDirection(matrix).transformDirection(chain.matrixWorld)
          const towardEye = camera.position.clone().sub(terminal).normalize()
          // The upper closed ring should read as a ring at the three stages,
          // rather than presenting only its thin edge to the viewer.
          expect(Math.abs(normal.dot(towardEye))).toBeGreaterThan(.4)
          let top = Infinity, bottom = -Infinity, upperTop = Infinity
          for (let i = 0; i < chain.count; i++) {
            chain.getMatrixAt(i, matrix)
            for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
              const point = chain.localToWorld(new THREE.Vector3(x, y, z).applyMatrix4(matrix)).project(camera)
              const screenY = (1 - point.y) / 2
              top = Math.min(top, screenY)
              bottom = Math.max(bottom, screenY)
              if (i === 0) upperTop = Math.min(upperTop, screenY)
            }
          }
          expect(top).toBeCloseTo(upperTop, 5)
          const visibleSpan = Math.min(1, bottom) - Math.max(0, top)
          if (step === 10) {
            expect(top).toBeGreaterThan(0)
            expect(bottom).toBeGreaterThan(1.1)
            expect(visibleSpan).toBeGreaterThan(.88)
          } else {
            expect(bottom).toBeGreaterThan(1)
            expect(visibleSpan).toBeGreaterThan(step === 160 ? .46 : .29)
            expect(visibleSpan).toBeLessThan(step === 160 ? .56 : .38)
          }
        }
      }
      expect(maxX, `horizontal bounds, mobile ${mobile}`).toBeLessThan(.995)
      expect(maxY, `vertical bounds, mobile ${mobile}`).toBeLessThan(.995)
      expect(minZ).toBeGreaterThan(-1)
      expect(maxZ).toBeLessThan(1)
    } finally { assembly.dispose() }
  }
})
