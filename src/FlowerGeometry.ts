import * as THREE from 'three'

/** Original curved petal surfaces, sampled by area rather than projected outlines. */
export function createFlowerSurface() {
  const vertices: number[] = [], normals: number[] = [], tones: number[] = [], areas: number[] = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3()
  let area = 0
  const triangle = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, tone: number) => {
    ab.subVectors(q, p); ac.subVectors(r, p); normal.crossVectors(ab, ac)
    const size = normal.length() * .5
    if (size < 1e-9) return
    normal.normalize()
    vertices.push(...p.toArray(), ...q.toArray(), ...r.toArray())
    normals.push(...normal.toArray()); tones.push(tone)
    area += size; areas.push(area)
  }
  // Inner petals stand upright; successive whorls open and roll over at the lip.
  for (let ring = 0; ring < 5; ring++) {
    const petals = 5 + ring
    for (let petal = 0; petal < petals; petal++) {
      const angle = petal / petals * Math.PI * 2 + ring * 2.399
      const surface = (u: number, v: number, out: THREE.Vector3) => {
        const opening = .18 + ring * .23
        const radius = (.035 + ring * .018 + opening * Math.sin(v * Math.PI * .5))
          * (1 - .22 * u * u * v ** 3) * (1 + .055 * Math.sin(petal * 2.17 + ring))
        const theta = angle + u * Math.PI / petals * 1.06 * (.16 + Math.sin(v * Math.PI * .82) ** .65)
          + v * .18 * (1 - ring / 7)
        const scallop = .025 * Math.cos(u * Math.PI * 3 + petal * .7) * v ** 7
        const z = -.16 - ring * .07 + (.95 - ring * .11) * Math.sin(v * 1.7)
          - (.08 + ring * .045) * v ** 6 + u * u * (.20 + ring * .036) * Math.sin(v * Math.PI)
          + scallop
        return out.set(Math.cos(theta) * radius, Math.sin(theta) * radius, z)
      }
      for (let j = 0; j < 16; j++) for (let k = 0; k < 12; k++) {
        const u = k / 6 - 1, v = j / 16, du = 1 / 6, dv = 1 / 16
        const tone = .36 + .46 * Math.sqrt(v) + ring * .025
        surface(u, v, a); surface(u + du, v, b); surface(u, v + dv, c)
        triangle(a, b, c, tone)
        surface(u + du, v + dv, a)
        triangle(b, a, c, tone)
      }
    }
  }
  return { vertices: new Float32Array(vertices), normals: new Float32Array(normals),
    tones: new Float32Array(tones), areas: new Float32Array(areas), area }
}

export function createFlowerAttributes(seeds: Float32Array, dust: Float32Array, advected: Float32Array) {
  const count = advected.length
  const positions = new Float32Array(count * 4), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3)
  const surface = createFlowerSurface()
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), rotation = new THREE.Quaternion()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), color = new THREE.Color()
  const palette = ['#e475ab', '#8662cc', '#c04379', '#59bdb5', '#ecae66', '#b8a7dc', '#d45c57', '#718bd8']
  let state = 0x6f10be
  const random = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296)
  for (let i = 0; i < count; i++) {
    const lane = dust[i * 4]
    if (advected[i] || dust[i * 4 + 3] > .5 || (lane * 7.13) % 1 >= .22) continue
    const side = lane < .5 ? -1 : 1, tier = Math.min(3, Math.floor(seeds[i * 3] * 4))
    // Large heads retain most samples; smaller blossoms fill every azimuth.
    const selector = random()
    const satellite = selector < .40 ? 0 : 1 + Math.min(3, Math.floor((selector - .40) / .60 * 4))
    const size = satellite === 1 ? .66 : satellite ? .36 + (satellite % 3) * .09 : 1.12 + .10 * Math.sin(tier * 2.7 + side)
    const target = random() * surface.area
    let low = 0, high = surface.areas.length - 1
    while (low < high) { const mid = (low + high) >>> 1; if (surface.areas[mid] < target) low = mid + 1; else high = mid }
    a.fromArray(surface.vertices, low * 9); b.fromArray(surface.vertices, low * 9 + 3); c.fromArray(surface.vertices, low * 9 + 6)
    const u = Math.sqrt(random()), v = random()
    point.copy(a).multiplyScalar(1 - u).addScaledVector(b, u * (1 - v)).addScaledVector(c, u * v)
    normal.fromArray(surface.normals, low * 3)
    rotation.setFromEuler(new THREE.Euler(.30 * Math.sin(tier * 1.7 + satellite * 2.1),
      side * .45 + tier * 1.65 + (satellite === 1 ? Math.PI : satellite * 2.399), .35 * Math.sin(tier + satellite)))
    point.multiplyScalar(size).applyQuaternion(rotation); normal.applyQuaternion(rotation)
    const endSign = tier < 1.5 ? -1 : 1
    const joining = satellite === 0 && (tier === 0 || tier === 3)
      ? THREE.MathUtils.smoothstep(endSign * point.y / size + (random() - .5) * .30, -.22, .38) * endSign : 0
    const around = satellite * 2.399 + tier
    point.x += side * (3.35 + .22 * Math.sin(tier * 2.4)) + (satellite ? Math.cos(around) * .80 : 0)
    point.y += (tier - 1.5) * 2.85 + side * .4 + (satellite ? Math.sin(around) * 1.0 : 0)
    point.z += Math.sin(tier * 2.1 + side) * .9 + (satellite ? Math.cos(around * .8) * .85 : 0)
    const radius = Math.hypot(point.x, point.z)
    if (radius < 2.30) { point.x *= 2.30 / radius; point.z *= 2.30 / radius }
    positions.set([point.x, point.y, point.z, joining], i * 4)
    normal.toArray(normals, i * 3)
    color.set(palette[(tier * 2 + (side > 0 ? 1 : 0) + satellite) % palette.length])
    // Roots stay darker than rolled edges; modest grain variation preserves each petal.
    color.multiplyScalar(surface.tones[low] * (.82 + random() * .30))
    color.toArray(colors, i * 3)
  }
  return { positions, normals, colors }
}
