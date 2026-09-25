import * as THREE from 'three'

export const FOREST_FLOOR_Y = -8.7
export const FOREST_GROVE_OFFSETS = [-1.2, 1.2] as const

/** Seeded branching trees and pinnate ferns, never spherical crowns. */
export function createForestGeometry(leafCount: number, software: boolean, mobile: boolean) {
  let state = 721659
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const branches: number[] = [], barkColors: number[] = []
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion()
  const center = new THREE.Vector3(), direction = new THREE.Vector3(), scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const clearance = (p: THREE.Vector3) => {
    const r = Math.hypot(p.x, p.z)
    if (r < 3.15) { p.x *= 3.15 / Math.max(.001, r); p.z *= 3.15 / Math.max(.001, r) }
    return p
  }
  const appendBranch = (curve: THREE.CatmullRomCurve3, radius: number, segments: number, tint: number) => {
    let previous = curve.getPoint(0)
    for (let j = 1; j <= segments; j++) {
      const p = curve.getPoint(j / segments)
      direction.subVectors(p, previous)
      const length = direction.length()
      center.copy(previous).add(p).multiplyScalar(.5)
      rotation.setFromUnitVectors(up, direction.normalize())
      const taper = radius * (.95 - (j - 1) / segments * .74)
      scale.set(taper, length * 1.06, taper)
      matrix.compose(center, rotation, scale).toArray(branches, branches.length)
      barkColors.push(tint, random(), radius)
      previous = p
    }
  }
  type Frond = { origin: THREE.Vector3; forward: THREE.Vector3; side: THREE.Vector3; length: number; width: number; droop: number; hue: number }
  const fronds: Frond[] = []
  const canopyFronds: Frond[] = []
  const canopySupports: Array<{ curve: THREE.CatmullRomCurve3; angle: number; radius: number }> = []
  const addFrond = (origin: THREE.Vector3, forward: THREE.Vector3, length: number, fern = false, canopy = false) => {
    const side = new THREE.Vector3().crossVectors(forward, up).normalize()
    if (side.lengthSq() < .01) side.set(1, 0, 0)
    const targetFronds = canopy ? canopyFronds : fronds
    targetFronds.push({ origin, forward: forward.normalize(), side,
      length, width: length * (fern ? .33 : .23), droop: fern ? .6 : .35, hue: random() })
  }
  const treeCount = software ? 14 : mobile ? 22 : 28
  for (let i = 0; i < treeCount; i++) {
    const angle = i * 2.399963 + (random() - .5) * .35
    // Wood stays outside the inner clearing; near-camera fragments also fade
    // in the material so a full orbit never enters an opaque trunk wall.
    const radial = 7.5 + random() * 5.5
    const base = new THREE.Vector3(Math.cos(angle) * radial, FOREST_FLOOR_Y + random() * .35, Math.sin(angle) * radial)
    const height = 13 + random() * 13
    const lean = new THREE.Vector3(Math.cos(angle + .8) * 1.4, 0, Math.sin(angle + .8) * 1.4)
    const trunkPoints = Array.from({ length: 6 }, (_, j) => {
      const t = j / 5
      return clearance(base.clone().addScaledVector(up, t * height).addScaledVector(lean, t * t)
        .add(new THREE.Vector3(Math.sin(t * 5 + angle) * .3 * t, 0, Math.cos(t * 6 + angle) * .3 * t)))
    })
    const trunk = new THREE.CatmullRomCurve3(trunkPoints)
    const trunkRadius = .026 + random() * .044
    canopySupports.push({ curve: trunk, angle, radius: trunkRadius })
    appendBranch(trunk, trunkRadius, software ? 9 : 15, random())
    const limbCount = software ? 4 : 5
    for (let j = 0; j < limbCount; j++) {
      const t = .16 + j / limbCount * .75
      const origin = trunk.getPoint(t)
      const azimuth = angle + j * 2.399963 + random() * .8
      const reach = 2.3 + random() * 2.7
      const axis = new THREE.Vector3(Math.cos(azimuth), .17 + random() * .45, Math.sin(azimuth)).normalize()
      const limb = new THREE.CatmullRomCurve3([
        origin, clearance(origin.clone().addScaledVector(axis, reach * .34).addScaledVector(up, .25)),
        clearance(origin.clone().addScaledVector(axis, reach * .76).addScaledVector(up, -.25)),
        clearance(origin.clone().addScaledVector(axis, reach).addScaledVector(up, -.5)),
      ])
      appendBranch(limb, trunkRadius * .45 * (1 - t * .6), software ? 4 : 6, random())
      addFrond(origin.clone(), axis.clone(), reach * 1.35)
      for (let k = 0; k < 3; k++) {
        const start = limb.getPoint(.46 + k * .23)
        const forkAngle = azimuth + (k % 2 ? -1 : 1) * (.55 + random() * .45)
        const forkDirection = new THREE.Vector3(Math.cos(forkAngle), .14 + random() * .55, Math.sin(forkAngle)).normalize()
        const forkLength = .9 + random() * 1.5
        const end = clearance(start.clone().addScaledVector(forkDirection, forkLength))
        const fork = new THREE.CatmullRomCurve3([start, start.clone().lerp(end, .5).addScaledVector(up, .2), end])
        appendBranch(fork, .006 + trunkRadius * .065, 3, random())
        addFrond(start, forkDirection.clone(), forkLength * 1.25)
        addFrond(end, forkDirection.clone().applyAxisAngle(up, .75), .65 + random() * 1.1)
        addFrond(end.clone(), forkDirection.clone().applyAxisAngle(up, -.75), .65 + random() * 1.1)
      }
    }
    for (let j = 0; j < 4; j++) {
      const a = angle + j * Math.PI * .5
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
      const root = new THREE.CatmullRomCurve3([
        base.clone().addScaledVector(up, .7),
        clearance(base.clone().addScaledVector(out, .8).addScaledVector(up, -.15)),
        clearance(base.clone().addScaledVector(out, 2.2 + random()).addScaledVector(up, -.55)),
      ])
      appendBranch(root, trunkRadius * .65, 5, random())
    }
    for (let j = 0; j < 9; j++) {
      const a = angle + j * 2.399963
      const origin = clearance(base.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, random() * 3, Math.sin(a) * 1.2)))
      addFrond(origin, new THREE.Vector3(Math.cos(a), .4, Math.sin(a)), 1.4 + random() * 1.5, true)
    }
  }
  // Connected arches span the upper grove at unequal heights, not as
  // disconnected spherical crowns. The lower grove meets this same canopy
  // while the camera descends out of the scale ceiling.
  const canopyCount = software ? 7 : mobile ? 10 : 12
  const polar = (angle: number, radius: number, y: number) =>
    new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
  for (let i = 0; i < canopyCount; i++) {
    const support = canopySupports[Math.floor(i * treeCount / canopyCount)]
    const handed = i % 3 === 0 ? -1 : 1
    const angle = support.angle + (random() - .5) * .28
    const height = 8.1 + random() * 1.65
    const crown = polar(angle + handed * .14, 6.0 + random() * 2.5, height)
    const start = support.curve.getPoint(.76 + random() * .20)
    const shoulder = clearance(start.clone().lerp(crown, .53).addScaledVector(up, 1.25))
    appendBranch(new THREE.CatmullRomCurve3([start, shoulder, crown]), support.radius * .60,
      software ? 5 : 8, random())
    const end = polar(angle + handed * (.58 + random() * .46), 5.0 + random() * 3.0, height - .2 + random() * .8)
    const middle = clearance(crown.clone().lerp(end, .52).addScaledVector(up, .35 + random() * .55))
    const arch = new THREE.CatmullRomCurve3([crown, middle, end])
    appendBranch(arch, support.radius * .43, software ? 6 : 9, random())
    for (let j = 0; j < 4; j++) {
      const t = .10 + j * .25
      const origin = arch.getPoint(t)
      const axis = arch.getTangent(t)
      for (const side of [-1, 1]) {
        const forward = axis.clone().applyAxisAngle(up, side * (.60 + random() * .35))
        forward.y = -.08 + random() * .13
        addFrond(origin.clone(), forward, 2.7 + random() * 1.6, true, true)
      }
    }
    // A few unequal hanging vines keep the roof open between its long ferns.
    const vineStart = arch.getPoint(.35 + random() * .45)
    const drop = 1.1 + random() * 2.1
    const vineEnd = clearance(vineStart.clone().add(new THREE.Vector3(
      Math.cos(angle + .9) * .9, -drop, Math.sin(angle + .9) * .9)))
    const vineMiddle = clearance(vineStart.clone().lerp(vineEnd, .55)
      .add(new THREE.Vector3(Math.sin(angle) * .38, -.2, Math.cos(angle) * .38)))
    appendBranch(new THREE.CatmullRomCurve3([vineStart, vineMiddle, vineEnd]), .007 + random() * .008,
      software ? 4 : 6, random())
  }
  const leafMatrices = new Float32Array(leafCount * 16), leafColors = new Float32Array(leafCount * 3)
  // Keep the branching skeleton, but concentrate its foliage in selected
  // connected fronds. The former even allocation left only a few tiny leaves
  // on every twig, producing an empty grove instead of overlapping thickets.
  const foliageFronds = fronds.filter(frond => frond.length > 2.2)
  const canopyLeafCount = Math.floor(leafCount * .24)
  let canopyIndex = 0, lowerIndex = 0
  const zAxis = new THREE.Vector3(), side = new THREE.Vector3(), tangent = new THREE.Vector3()
  const basis = new THREE.Matrix4()
  for (let i = 0; i < leafCount; i++) {
    // Interleave the reserved quarter so both the geometric-leaf prefix and
    // the micro-foliage suffix retain the same upper/lower spatial balance.
    const canopy = Math.floor((i + 1) * canopyLeafCount / leafCount) > Math.floor(i * canopyLeafCount / leafCount)
    const frond = canopy ? canopyFronds[canopyIndex++ % canopyFronds.length]
      : foliageFronds[lowerIndex++ % foliageFronds.length]
    const t = .04 + random() * .93, handed = random() < .5 ? -1 : 1
    const spread = Math.sin(Math.PI * t) ** .7
    center.copy(frond.origin).addScaledVector(frond.forward, t * frond.length)
      .addScaledVector(up, Math.sin(t * Math.PI) * frond.length * .3 - t * t * frond.droop)
    // Paired pinnae grow along a curved rachis, not an isotropic clump.
    center.addScaledVector(frond.side, handed * spread * frond.width * (.2 + random() * .6))
    // Leaves fill an irregular band around the bent rachis in all three
    // dimensions. This creates asymmetric fern volumes, never ball surfaces.
    const thickness = (.2 + frond.hue * .4) * (.45 + spread * .55)
    center.addScaledVector(frond.side, (random() - .5) * thickness * 1.6)
      .addScaledVector(up, (random() - .5) * thickness)
      .addScaledVector(frond.forward, (random() - .5) * thickness * .7)
    clearance(center)
    tangent.copy(frond.side).multiplyScalar(handed).addScaledVector(frond.forward, .32 + t * .4)
      .addScaledVector(up, .15 + random() * .24).normalize()
    zAxis.crossVectors(frond.forward, frond.side).normalize()
    zAxis.applyAxisAngle(tangent, (random() - .5) * .9)
    side.crossVectors(tangent, zAxis).normalize()
    zAxis.crossVectors(side, tangent).normalize()
    basis.makeBasis(side, tangent, zAxis)
    rotation.setFromRotationMatrix(basis)
    // Tiny folded leaflets collect along each frond, reading as illuminated
    // micro-foliage at viewing distance instead of oversized polygon leaves.
    const length = (.052 + spread * .12 + random() * .052) * (canopy ? 1.10 : 1)
    scale.set(length * (1.2 + random() * .7), length, length)
    matrix.compose(center, rotation, scale).toArray(leafMatrices, i * 16)
    leafColors.set([frond.hue, random(), random()], i * 3)
  }
  const barkGeometry = new THREE.CylinderGeometry(.74, 1, 1, software ? 5 : 7, 1, true)
  // Six triangles form a folded lanceolate leaf with a raised midrib.
  const leafGeometry = new THREE.BufferGeometry()
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -.17, .38, 0, -.10, .78, .012, 0, 1, 0,
    .10, .78, .012, .17, .38, 0, 0, .48, .085,
  ], 3))
  leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    .5, 0, 0, .38, .2, .78, .5, 1, .8, .78, 1, .38, .5, .48,
  ], 2))
  leafGeometry.setIndex([0, 1, 6, 1, 2, 6, 2, 3, 6, 3, 4, 6, 4, 5, 6, 5, 0, 6])
  leafGeometry.computeVertexNormals()
  return { barkGeometry, leafGeometry, barkMatrices: new Float32Array(branches),
    barkColors: new Float32Array(barkColors), leafMatrices, leafColors, treeCount,
    foliageClusterCount: foliageFronds.length + canopyFronds.length, canopyLeafCount }
}
