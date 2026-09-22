import * as THREE from 'three'

/** Original, instanced architecture: broken strata, slabs, steel ribs and floor conduits. */
export function createSceneRuins(parent: THREE.Group, software: boolean, mobile: boolean) {
  const group = new THREE.Group()
  group.name = 'aether-flooded-ruins'
  parent.add(group)
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.MeshStandardMaterial[] = []
  const meshes: THREE.InstancedMesh[] = []
  const dummy = new THREE.Object3D()
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
  const stone = material({ color: 0x303137, metalness: .18, roughness: .78,
    envMapIntensity: .48 })
  const wetStone = material({ color: 0x20262b, metalness: .58, roughness: .31,
    envMapIntensity: .85 })
  const steel = material({ color: 0x26303b, metalness: .94, roughness: .32,
    envMapIntensity: .85 })
  for (const m of [stone, wetStone, steel]) {
    m.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vRuinsWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        vRuinsWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;`)
      shader.fragmentShader = `varying vec3 vRuinsWorld;
        float ruinHash(vec3 p) {return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float ruinNoise(vec3 p) {
          vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(mix(ruinHash(i),ruinHash(i+vec3(1,0,0)),f.x),
            mix(ruinHash(i+vec3(0,1,0)),ruinHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(ruinHash(i+vec3(0,0,1)),ruinHash(i+vec3(1,0,1)),f.x),
            mix(ruinHash(i+vec3(0,1,1)),ruinHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }\n` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float erosion=ruinNoise(vRuinsWorld*3.7)*.58+ruinNoise(vRuinsWorld*21.)*.29+ruinNoise(vRuinsWorld*89.)*.13;
        float cracks=smoothstep(.44,.49,ruinNoise(vRuinsWorld*6.));
        diffuseColor.rgb*=.32+erosion*.84;
        diffuseColor.rgb*=.64+cracks*.36;`)
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+(erosion-.5)*.45,.16,.96);`)
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        normal=normalize(normal+vec3(ruinNoise(vRuinsWorld*54.)-.5,
          ruinNoise(vRuinsWorld.zxy*54.+11.)-.5,0.)*.18);`)
    }
    m.customProgramCacheKey = () => 'aether-eroded-ruins-v1'
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
  // Fractured strata use many unequal facets, compressed into broad ledges.
  const fragment = new THREE.IcosahedronGeometry(.68, 1)
  const vertices = fragment.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i)
    const fracture = .82 + Math.sin(x * 17 + z * 11 + y * 8) * .18
    vertices.setXYZ(i, x * fracture, y * fracture + Math.sin(x * 11 + z * 7) * .06, z * fracture)
  }
  fragment.computeVertexNormals()
  const ledges = create(fragment, stone, software ? 30 : mobile ? 50 : 84, 'aether-fractured-strata')
  for (let i = 0; i < ledges.count; i++) {
    const a = i * 2.399963
    const radius = 2.65 + random(i + 9) * 4.5
    const x = Math.cos(a) * radius
    const z = Math.min(1.7, Math.sin(a) * radius - 1.7)
    const side = Math.abs(x) > 4.7 ? 1 : 0
    dummy.position.set(x, -3.55 + side * random(i + 70) * .65, z)
    dummy.rotation.set((random(i) - .5) * .42, a, (random(i + 1) - .5) * .30)
    dummy.scale.set(.6 + random(i + 12) * 1.8, .12 + random(i + 30) * (.34 + side * .65), .5 + random(i + 24) * 1.25)
    write(ledges, i, .65 + random(i + 200) * .5)
  }
  const brokenPanels = create(new THREE.BoxGeometry(1, 1, 1), wetStone,
    software ? 14 : 26, 'aether-broken-floor-panels')
  for (let i = 0; i < brokenPanels.count; i++) {
    const side = i % 2 ? 1 : -1
    dummy.position.set(side * (2.7 + random(i + 70) * 3.6), -3.45 + random(i + 71) * .13, 1.65 - random(i + 72) * 9)
    dummy.rotation.set((random(i + 2) - .5) * .13, random(i + 73) * 1.8, side * .05)
    dummy.scale.set(1.1 + random(i + 80) * 1.7, .07, .6 + random(i + 90))
    write(brokenPanels, i, .55 + random(i + 12) * .6)
  }
  const ribs = create(new THREE.BoxGeometry(1, 1, 1), steel, 32, 'aether-industrial-buttresses')
  for (let i = 0; i < ribs.count; i++) {
    const side = i % 2 ? 1 : -1
    const bay = Math.floor(i / 8)
    const part = Math.floor(i / 2) % 4
    dummy.position.set(side * (part === 3 ? 4.45 : 5.9), part === 2 ? 3.8 : part === 3 ? -3.35 : .15, 1.2 - bay * 3.4)
    dummy.rotation.set(0, 0, part === 1 ? side * .24 : 0)
    dummy.scale.set(part === 2 ? 2.7 : part === 3 ? 2.2 : .13, part < 2 ? 7.5 : .15, part === 3 ? .36 : .24)
    write(ribs, i, .6 + random(i) * .5)
  }
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.9, -3.23, -.4), new THREE.Vector3(2.9, -3.37, .65),
    new THREE.Vector3(4.2, -3.4, -.4), new THREE.Vector3(5.1, -3.36, -2.4),
    new THREE.Vector3(5.8, -2.9, -5),
  ])
  const hoses = create(new THREE.TubeGeometry(curve, software ? 22 : 40, .047, 5, false), steel,
    software ? 4 : 8, 'aether-floor-conduits')
  for (let i = 0; i < hoses.count; i++) {
    dummy.position.set((i % 4) * .16, (i % 3) * .018, -(i % 4) * .22)
    dummy.rotation.set(0, i < hoses.count / 2 ? 0 : Math.PI, 0)
    dummy.scale.setScalar(1)
    write(hoses, i, .65 + i * .04)
  }
  return {
    relief,
    update(opacity: number) {
      group.visible = opacity > .001
      for (const m of materials) m.opacity = opacity
    },
    dispose() {
      parent.remove(group)
      meshes.forEach(mesh => mesh.dispose())
      geometries.forEach(g => g.dispose())
      materials.forEach(m => m.dispose())
      relief.dispose()
    },
  }
}
