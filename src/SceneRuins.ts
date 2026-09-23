import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** Original flooded service hall: ordered bays flank an uninterrupted central pool. */
export function createSceneRuins(parent: THREE.Group, software: boolean, mobile: boolean) {
  const group = new THREE.Group()
  group.name = 'aether-flooded-ruins'
  parent.add(group)
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.MeshStandardMaterial[] = []
  const meshes: THREE.InstancedMesh[] = []
  const dummy = new THREE.Object3D()
  const pipeDirection = new THREE.Vector3()
  const pipeUp = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  const random = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
  const size = 128
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const grain = random(x + y * size) * 25
    const seam = Math.pow(Math.abs(Math.sin(x * .13 + Math.sin(y * .12) * 1.7)), 20) * 45
    const v = 130 + Math.sin(x * .17 + y * .09) * 24 + grain - seam
    pixels[i] = pixels[i + 1] = pixels[i + 2] = v
    pixels[i + 3] = 255
  }
  const relief = new THREE.DataTexture(pixels, size, size)
  relief.wrapS = relief.wrapT = THREE.RepeatWrapping
  relief.magFilter = THREE.LinearFilter
  relief.minFilter = THREE.LinearMipmapLinearFilter
  relief.generateMipmaps = true
  relief.repeat.set(3, 3)
  relief.needsUpdate = true
  const material = (options: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ transparent: true, ...options })
    materials.push(m)
    return m
  }
  const stone = material({ color: 0x424748, metalness: .27, roughness: .68,
    envMapIntensity: .58, bumpMap: relief, bumpScale: .012 })
  const wetStone = material({ color: 0x293640, metalness: .74, roughness: .29,
    envMapIntensity: 1.04, bumpMap: relief, bumpScale: .006 })
  const steel = material({ color: 0x52606b, metalness: .92, roughness: .30,
    envMapIntensity: 1.12, bumpMap: relief, bumpScale: .004 })
  const enamel = material({ color: 0x243239, metalness: .66, roughness: .37,
    envMapIntensity: .88, bumpMap: relief, bumpScale: .004 })
  const lamps = material({ color: 0x91c7ce, metalness: .42, roughness: .26,
    emissive: 0x5dabad, emissiveIntensity: .66, envMapIntensity: .5 })
  for (const m of materials) {
    const grainStrength = m === stone ? 1 : .32
    m.onBeforeCompile = shader => {
      shader.uniforms.uRuinsGrain = { value: grainStrength }
      shader.vertexShader = 'varying vec3 vRuinsWorld; varying float vRuinsDepth;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        vRuinsWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
        vRuinsDepth = -mvPosition.z;`)
      shader.fragmentShader = `varying vec3 vRuinsWorld; varying float vRuinsDepth;
        uniform float uRuinsGrain;
        float ruinHash(vec3 p) {return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float ruinNoise(vec3 p) {
          vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(mix(ruinHash(i),ruinHash(i+vec3(1,0,0)),f.x),
            mix(ruinHash(i+vec3(0,1,0)),ruinHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(ruinHash(i+vec3(0,0,1)),ruinHash(i+vec3(1,0,1)),f.x),
            mix(ruinHash(i+vec3(0,1,1)),ruinHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }\n` + shader.fragmentShader
      // Foreground fittings dissolve before the camera intersects their
      // triangles. The same view-depth rule also applies in the water reflection.
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', `void main() {
        float nearCoverage = smoothstep(1.4, 3.6, vRuinsDepth);
        if(nearCoverage < .003 || nearCoverage < ruinHash(vec3(floor(gl_FragCoord.xy),0.))) discard;`)
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float erosion=ruinNoise(vRuinsWorld*3.7)*.58+ruinNoise(vRuinsWorld*21.)*.29+ruinNoise(vRuinsWorld*89.)*.13;
        float cracks=smoothstep(.44,.49,ruinNoise(vRuinsWorld*6.));
        float waterline=1.-smoothstep(-44.035,-43.62,vRuinsWorld.y);
        diffuseColor.rgb*=mix(.82+erosion*.28,.32+erosion*.84,uRuinsGrain);
        diffuseColor.rgb*=mix(.96+cracks*.04,.64+cracks*.36,uRuinsGrain);
        diffuseColor.rgb*=mix(1.,.68,waterline);`)
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+(erosion-.5)*mix(.12,.45,uRuinsGrain),.16,.96);
        roughnessFactor=mix(roughnessFactor,max(.14,roughnessFactor*.48),waterline*.72);`)
    }
    m.customProgramCacheKey = () => 'aether-flooded-service-hall-v4'
  }
  const create = (geometry: THREE.BufferGeometry, m: THREE.Material, count: number, name: string) => {
    geometries.push(geometry)
    const mesh = new THREE.InstancedMesh(geometry, m, count)
    mesh.name = name
    mesh.frustumCulled = false
    group.add(mesh)
    meshes.push(mesh)
    return mesh
  }
  const write = (mesh: THREE.InstancedMesh, index: number, shade = 1) => {
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, color.setRGB(shade, shade * .99, shade * 1.02))
  }
  const box = (mesh: THREE.InstancedMesh, index: number,
    x: number, y: number, z: number, width: number, height: number, depth: number, shade = 1) => {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(width, height, depth)
    write(mesh, index, shade)
  }
  // Identical bay spacing establishes perspective without a forest of thin
  // diagonal beams. The closest inward edge remains outside the O and its pool.
  const bayCount = software ? 3 : mobile ? 4 : 5
  const bayDepth = 14.4 / bayCount
  const bayZ = (bay: number) => 4.2 - bay * bayDepth
  const sideBays = bayCount * 2
  const foundations = create(new RoundedBoxGeometry(1, 1, 1, 1, .07), stone,
    sideBays * 3, 'aether-service-plinths')
  const frames = create(new THREE.BoxGeometry(1, 1, 1), steel,
    sideBays * 8 + 8, 'aether-industrial-buttresses')
  const cabinets = create(new RoundedBoxGeometry(1, 1, 1, 1, .045), enamel,
    sideBays * 5, 'aether-service-cabinets')
  const indicators = create(new THREE.BoxGeometry(1, 1, 1), lamps,
    sideBays * 3, 'aether-service-indicators')
  let f = 0, r = 0, c = 0, l = 0
  for (let bay = 0; bay < bayCount; bay++) for (const side of [-1, 1]) {
    const z = bayZ(bay)
    const bayWidth = Math.min(2.68, bayDepth - .30)
    const shade = .83 + random(bay + (side + 1) * 17) * .19
    // The bottom is at -3.72, just under the existing -3.7 flooded bed.
    box(foundations, f++, side * 6.26, -3.38, z, 2.52, .68, bayWidth, shade)
    box(foundations, f++, side * 6.34, -2.94, z, 2.16, .20, bayWidth - .14, shade * .9)
    box(foundations, f++, side * 7.30, -.30, z, .55, 6.84, bayWidth - .10, shade * .64)
    // Deep portal frame, with short solid feet instead of crossing diagonals.
    for (const end of [-1, 1]) {
      box(frames, r++, side * 5.20, -.18, z + end * bayWidth * .45, .28, 6.50, .26, shade)
      box(frames, r++, side * 5.20, -2.97, z + end * bayWidth * .45, .53, .70, .51, shade * .8)
      box(frames, r++, side * 6.12, 3.08, z + end * bayWidth * .45, 2.12, .32, .29, shade)
    }
    box(frames, r++, side * 5.17, 2.78, z, .20, .22, bayWidth, shade)
    box(frames, r++, side * 5.17, -2.74, z, .14, .10, bayWidth, shade * .86)
    // The cabinet faces look inward across the pool; recesses and three ribs
    // give each module a readable silhouette even at the low geometry budget.
    box(cabinets, c++, side * 6.50, -1.37, z, 1.36, 2.94, bayWidth * .71, shade)
    box(cabinets, c++, side * 5.795, -1.27, z, .08, 2.37, bayWidth * .58, shade * .62)
    for (let rib = 0; rib < 3; rib++) {
      box(cabinets, c++, side * 5.72, -1.33, z + (rib - 1) * bayWidth * .22,
        .13, 2.63, .066, shade * 1.42)
    }
    box(indicators, l++, side * 5.635, -.25, z - bayWidth * .19, .025, .36, .044, .92)
    box(indicators, l++, side * 5.635, -.25, z + bayWidth * .19, .025, .12, .044, .55)
    box(indicators, l++, side * 5.08, -3.005, z, .048, .028, bayWidth * .46, .36)
  }
  // Continuous longitudinal datum lines connect the bays into one room.
  const hallDepth = (bayCount - 1) * bayDepth + Math.min(2.68, bayDepth - .30)
  const hallZ = (bayZ(0) + bayZ(bayCount - 1)) * .5
  for (const side of [-1, 1]) {
    box(frames, r++, side * 5.18, 3.12, hallZ, .40, .24, hallDepth, .93)
    box(frames, r++, side * 7.15, 3.12, hallZ, .36, .24, hallDepth, .81)
    box(frames, r++, side * 4.83, -3.36, hallZ, .22, .22, hallDepth, .72)
    box(frames, r++, side * 5.12, -3.49, hallZ, .43, .15, hallDepth, .65)
  }
  const pipes = create(new THREE.CylinderGeometry(1, 1, 1, software ? 6 : 8, 1), wetStone,
    sideBays * 3 + 4, 'aether-floor-conduits')
  const collars = create(new THREE.TorusGeometry(1, .18, 4, software ? 8 : 12), steel,
    sideBays * 6, 'aether-pipe-flanges')
  const pipe = (index: number, from: THREE.Vector3, to: THREE.Vector3, radius: number, shade: number) => {
    pipeDirection.subVectors(to, from)
    dummy.position.copy(from).add(to).multiplyScalar(.5)
    dummy.scale.set(radius, pipeDirection.length(), radius)
    dummy.quaternion.setFromUnitVectors(pipeUp, pipeDirection.normalize())
    write(pipes, index, shade)
  }
  let p = 0, j = 0
  for (const side of [-1, 1]) {
    for (let lane = 0; lane < 2; lane++) {
      pipe(p++, new THREE.Vector3(side * (5.58 + lane * .29), 2.20 + lane * .24, hallZ - hallDepth * .5),
        new THREE.Vector3(side * (5.58 + lane * .29), 2.20 + lane * .24, hallZ + hallDepth * .5),
        lane ? .070 : .105, lane ? .84 : 1.05)
    }
    for (let bay = 0; bay < bayCount; bay++) {
      const z = bayZ(bay)
      pipe(p++, new THREE.Vector3(side * 5.58, -2.80, z),
        new THREE.Vector3(side * 5.58, 2.20, z), .074, .96)
      pipe(p++, new THREE.Vector3(side * 5.58, -2.80, z),
        new THREE.Vector3(side * 6.42, -2.80, z), .074, .86)
      pipe(p++, new THREE.Vector3(side * 4.62, -3.36, z - .72),
        new THREE.Vector3(side * 4.62, -3.36, z + .72), .040, .62)
      for (let joint = 0; joint < 6; joint++) {
        dummy.position.set(side * 5.58, joint < 4 ? -2.30 + joint * 1.30 : 2.20,
          joint < 4 ? z : z + (joint === 4 ? -.24 : .24))
        dummy.rotation.set(joint < 4 ? Math.PI / 2 : 0, 0, 0)
        dummy.scale.setScalar(joint < 4 ? .095 : .126)
        write(collars, j++, .79 + joint * .025)
      }
    }
  }
  // Only sparse edge fragments remain; no gravel or loose hoses occupy the
  // centre or the foreground water used by the O reflection.
  const fragment = new THREE.IcosahedronGeometry(.68, 1)
  const vertices = fragment.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i)
    const fracture = .82 + Math.sin(x * 17 + z * 11 + y * 8) * .18
    vertices.setXYZ(i, x * fracture, y * fracture + Math.sin(x * 11 + z * 7) * .06, z * fracture)
  }
  fragment.computeVertexNormals()
  const ledges = create(fragment, stone, software ? 10 : mobile ? 16 : 22, 'aether-fractured-strata')
  for (let i = 0; i < ledges.count; i++) {
    const side = i % 2 ? 1 : -1
    dummy.position.set(side * (3.65 + random(i + 9) * 2.1), -3.35,
      hallZ + (random(i + 19) - .5) * hallDepth)
    dummy.rotation.set((random(i) - .5) * .8, random(i + 1) * Math.PI, (random(i + 2) - .5) * .65)
    dummy.scale.set(.8 + random(i + 12) * 1.25, .35 + random(i + 30) * .65, .55 + random(i + 24) * 1.1)
    write(ledges, i, .67 + random(i + 200) * .25)
  }
  // Fallen lintels interrupt the ordered bays, staying outside the central pool.
  const fallen = create(new THREE.BoxGeometry(1, 1, 1), stone, 6, 'aether-broken-lintels')
  for (let i = 0; i < fallen.count; i++) {
    const side = i % 2 ? 1 : -1
    dummy.position.set(side * (4.15 + random(i + 66) * .75), -3.18, 3.6 - Math.floor(i / 2) * 4.4)
    dummy.rotation.set(.12 + random(i) * .25, side * (.3 + random(i + 7) * .8), side * .19)
    dummy.scale.set(1.6 + random(i + 30), .34, .56)
    write(fallen, i, .7 + random(i + 50) * .2)
  }
  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }
  group.userData.serviceBaysPerSide = bayCount
  group.userData.drawMeshes = meshes.length
  group.userData.openPoolHalfWidth = 2.4
  let disposed = false
  return {
    relief,
    update(opacity: number) {
      if (disposed) return
      const coverage = Number.isFinite(opacity) ? THREE.MathUtils.clamp(opacity, 0, 1) : 0
      group.visible = coverage > .001
      for (const m of materials) m.opacity = coverage
    },
    dispose() {
      if (disposed) return
      disposed = true
      parent.remove(group)
      meshes.forEach(mesh => mesh.dispose())
      geometries.forEach(g => g.dispose())
      materials.forEach(m => m.dispose())
      relief.dispose()
    },
  }
}
