import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { createSpineAssembly } from './SceneSpine'
import { createSceneMonitors } from './SceneMonitors'
import { sampleJourney, smooth } from './Journey'

const TAU = Math.PI * 2

/** A curved, closed metal feather. All three structures share these same pieces. */
function featherGeometry(segments: number) {
  const positions: number[] = []
  const armour: number[] = []
  const indices: number[] = []
  const columns = 6
  for (let side = 0; side < 2; side++) {
    for (let y = 0; y <= segments; y++) {
      const t = y / segments
      const width = Math.pow(Math.sin(Math.PI * t), .65) * .5 + .025
      for (let x = 0; x <= columns; x++) {
        const u = (x / columns) * 2 - 1
        positions.push(u * width, t - .5,
          Math.sin(t * Math.PI) * .12 + u * u * .10 + t * t * .22 - side * .035)
        const hexWidth = Math.min(t * 4, 1, (1 - t) * 4) * .5 + .006
        armour.push(u * hexWidth, t - .5, Math.sin(t * Math.PI) * .055 + u * u * .035 - side * .045)
      }
    }
  }
  const stride = columns + 1
  const surface = stride * (segments + 1)
  for (let y = 0; y < segments; y++) {
    for (let x = 0; x < columns; x++) {
      const a = y * stride + x
      const b = a + stride
      indices.push(a, a + 1, b, a + 1, b + 1, b)
      indices.push(a + surface, b + surface, a + 1 + surface,
        a + 1 + surface, b + surface, b + 1 + surface)
    }
  }
  // Closed edges keep the silhouette solid when the camera orbits behind it.
  const edge: number[] = []
  for (let x = 0; x <= columns; x++) edge.push(x)
  for (let y = 1; y <= segments; y++) edge.push(y * stride + columns)
  for (let x = columns - 1; x >= 0; x--) edge.push(segments * stride + x)
  for (let y = segments - 1; y > 0; y--) edge.push(y * stride)
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i]
    const b = edge[(i + 1) % edge.length]
    indices.push(a, a + surface, b, b, a + surface, b + surface)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aArmour', new THREE.Float32BufferAttribute(armour, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const armourGeometry = new THREE.BufferGeometry()
  armourGeometry.setAttribute('position', new THREE.Float32BufferAttribute(armour, 3))
  armourGeometry.setIndex(indices)
  armourGeometry.computeVertexNormals()
  geometry.setAttribute('aArmourNormal', armourGeometry.getAttribute('normal'))
  armourGeometry.dispose()
  return geometry
}

const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Descending articulated matter inside an independently anchored shaft. */
export function createSceneWorlds(scene: THREE.Scene, software: boolean, mobile = false) {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const instances: THREE.InstancedMesh[] = []
  const geo = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g }
  const mat = <T extends THREE.Material>(m: T) => { materials.push(m); return m }
  const root = new THREE.Group()
  const matter = new THREE.Group()
  const monitorAssembly = createSceneMonitors(software, mobile)
  const monitors = monitorAssembly.group
  const spineAssembly = createSpineAssembly(software, mobile)
  matter.add(spineAssembly.group)
  const chamber = new THREE.Group()
  const space = new THREE.Group()
  matter.name = 'aether-matter'
  space.name = 'aether-chamber-space'
  root.add(matter, monitors, chamber, space)
  scene.add(root)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const metal = mat(new THREE.MeshPhysicalMaterial({
    color: 0xa5bac0, metalness: software ? .35 : 1, roughness: software ? .4 : .29,
    envMapIntensity: 1.15, clearcoat: software ? 0 : .35, clearcoatRoughness: .26,
    iridescence: software ? 0 : .78, iridescenceIOR: 1.38,
    iridescenceThicknessRange: [120, 470], transparent: true,
  }))
  const armourMorph = { value: 0 }
  metal.onBeforeCompile = (shader) => {
    shader.uniforms.uArmour = armourMorph
    shader.vertexShader = 'attribute vec3 aArmour; attribute vec3 aArmourNormal; uniform float uArmour;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, aArmourNormal, uArmour));')
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      'vec3 transformed = mix(position, aArmour, uArmour);')
  }
  metal.customProgramCacheKey = () => 'aether-continuous-armour-v2'
  const silver = mat(new THREE.MeshStandardMaterial({
    color: 0x8daeb8, metalness: software ? .35 : 1, roughness: software ? .4 : .28, envMapIntensity: 1.4, transparent: true,
  }))
  const chainsMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x91aca5, metalness: software ? .35 : 1, roughness: software ? .4 : .24, envMapIntensity: 1.4, transparent: true,
  }))
  const dark = mat(new THREE.MeshStandardMaterial({
    color: 0x15282c, metalness: software ? .35 : .9, roughness: .29, envMapIntensity: 1.2, transparent: true,
  }))
  const machineMetal = mat(new THREE.MeshStandardMaterial({
    color: 0x6f9296, metalness: software ? .35 : 1, roughness: software ? .4 : .26, envMapIntensity: 2.0, transparent: true,
  }))
  const glow = mat(new THREE.MeshBasicMaterial({
    color: 0x86fce4, transparent: true, opacity: .7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  const mesh = (parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
    x = 0, y = 0, z = 0) => {
    const item = new THREE.Mesh(geometry, material)
    item.position.set(x, y, z)
    parent.add(item)
    return item
  }
  const instanced = (parent: THREE.Group, geometry: THREE.BufferGeometry,
    material: THREE.Material, count: number, dynamic = true) => {
    const item = new THREE.InstancedMesh(geometry, material, count)
    if (dynamic) item.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Its shared geometry visits several poses; a cached bound would hide later poses.
    item.frustumCulled = false
    instances.push(item)
    parent.add(item)
    return item
  }

  const rows = software ? 18 : mobile ? 28 : 40
  const spineHeight = 10.8
  const columns = software ? 6 : 8
  const count = rows * columns
  const feathers = instanced(matter, geo(featherGeometry(software ? 6 : 10)), metal, count)
  const poses = [new Float32Array(count * 9), new Float32Array(count * 9), new Float32Array(count * 9)]
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns)
    const t = row / (rows - 1)
    const a = (i % columns) / columns * TAU
    const spineAngle = a + (row % 2) * .20
    const spineRadius = .68 + Math.sin(t * Math.PI) * .13 + Math.sin(row * 1.4) * .035
    poses[0].set([
      Math.sin(spineAngle) * spineRadius, (row / rows - .5) * spineHeight, Math.cos(spineAngle) * spineRadius,
      .18 + Math.sin(a) * .12, spineAngle, Math.sin(a) * .48,
      .72 + Math.abs(Math.sin(a)) * .48, .40, .65,
    ], i * 9)
    const machineRadius = 1.28 + Math.pow(Math.abs(t - .5) * 2, 4) * .55
    poses[1].set([
      Math.sin(a) * machineRadius, Math.sign(t - .5) * (1.9 + Math.abs(t - .5) * 1.1), Math.cos(a) * machineRadius,
      (t - .5) * .16, a, 0, .69, .30, .6,
    ], i * 9)
    const wallColumns = software ? 12 : 16
    const wallRows = Math.ceil(count / wallColumns)
    const wallRow = Math.floor(i / wallColumns)
    const wallX = ((i % wallColumns) - (wallColumns - 1) * .5 + (wallRow % 2) * .5) * (7.8 / wallColumns)
    const wallY = (wallRow - (wallRows - 1) * .5) * (4.8 / wallRows)
    poses[2].set([
      wallX, wallY, -.65 + wallX * wallX * .045,
      wallY * -.02, -wallX * .065, 0,
      7.8 / wallColumns * 1.25, 4.8 / wallRows * 1.3, .7,
    ], i * 9)
    color.setHSL([.48, .84, .57, .12][i % 4], .38, .44 + (i % 3) * .08)
    feathers.setColorAt(i, color)
  }
  const joints = instanced(matter,
    geo(new THREE.TorusGeometry(1, .09, software ? 5 : 8, software ? 20 : 36)), silver, rows)
  const chainCount = software ? 56 : mobile ? 100 : 152
  const links = instanced(matter,
    geo(new THREE.TorusGeometry(1, .18, 5, software ? 8 : 12)), chainsMaterial, chainCount)
  links.name = 'aether-mechanical-chain'

  // The illuminated particles inhabit this same structure through every transformation.
  const pointCount = software ? 420 : mobile ? 1100 : 2300
  const seeds = new Float32Array(pointCount * 3)
  for (let i = 0; i < pointCount; i++) seeds.set([i / pointCount, (i * .61803398875) % 1, (i * .754877666) % 1], i * 3)
  const pointGeometry = geo(new THREE.BufferGeometry())
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3))
  const coreMaterial = mat(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScroll: { value: 0 }, uWeights: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 0 }, uSize: { value: software ? 28 : mobile ? 25 : 19 },
    },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScroll;
      uniform vec3 uWeights;
      uniform float uSize;
      varying float vBrightness;
      void main() {
        float flow = fract(position.x + mix(uTime, uScroll, uWeights.x) * .085);
        float a = position.y * 6.283185 + uTime * .7;
        float spineAngle = position.y * 6.283185 + uScroll * .7;
        float r = .16 + position.z * .47;
        vec3 spine = vec3(sin(spineAngle + flow * 15.0) * r, (flow - .5) * 6.3, cos(spineAngle + flow * 15.0) * r);
        float latitude = position.x * 6.283185;
        float mr = 1.06 + cos(latitude) * (.16 + position.z * .14);
        vec3 machine = vec3(sin(a) * mr, cos(a) * mr, sin(latitude) * (.16 + position.z * .14));
        float sr = .25 + sin(flow * 3.14159) * 1.7;
        vec3 scales = vec3(sin(a + flow * 18.0) * sr, (flow - .5) * 6.3, cos(a + flow * 18.0) * sr);
        vec3 p = spine * uWeights.x + machine * uWeights.y + scales * uWeights.z;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(uSize / -view.z, 1.0, 5.0);
        vBrightness = .35 + .65 * position.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uWeights;
      varying float vBrightness;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.0;
        if (r > 1.0) discard;
        vec3 tint = vec3(.65, .30, .83) * uWeights.x + vec3(.22, 1.0, .83) * uWeights.y + vec3(1.0, .66, .24) * uWeights.z;
        gl_FragColor = vec4(tint, pow(1.0 - r, 1.8) * uOpacity * vBrightness);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }))
  const core = new THREE.Points(pointGeometry, coreMaterial)
  core.frustumCulled = false
  matter.add(core)

  // Architecture appears around the centre and remains behind the final ring.
  const architecture = mat(new THREE.MeshStandardMaterial({
    color: 0x0a171b, metalness: .7, roughness: .37, envMapIntensity: .75, transparent: true,
    depthWrite: false,
  }))
  const floorGeometry = geo(new THREE.PlaneGeometry(24, 24, 22, 22))
  const vertices = floorGeometry.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i)
    const y = vertices.getY(i)
    vertices.setZ(i, Math.sin(x * 2.4 + y) * Math.cos(y * 1.8) * .045)
  }
  floorGeometry.computeVertexNormals()
  const floor = mesh(space, floorGeometry, architecture, 0, -3.7)
  floor.rotation.x = -Math.PI / 2
  // One small reflection target on desktop. Software/mobile keep the cheaper metal floor.
  const floorReflection = !software && !mobile ? new Reflector(geo(new THREE.PlaneGeometry(20, 20)), {
    textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .004, color: 0x52676d,
  }) : null
  const reflectionTime = { value: 0 }
  const reflectionOpacity = { value: 0 }
  if (floorReflection) {
    floorReflection.position.y = -3.61
    floorReflection.rotation.x = -Math.PI / 2
    const material = floorReflection.material as THREE.ShaderMaterial
    material.transparent = true
    material.depthWrite = false
    material.uniforms.uTime = reflectionTime
    material.uniforms.uOpacity = reflectionOpacity
    material.fragmentShader = 'uniform float uTime; uniform float uOpacity;\n' + material.fragmentShader
    material.fragmentShader = material.fragmentShader.replace(
      'vec4 base = texture2DProj( tDiffuse, vUv );',
      `vec4 warped = vUv;
      warped.xy += vec2(sin(vUv.x * 130.0 + vUv.y * 90.0 + uTime * .6),
        cos(vUv.y * 170.0 + uTime * .4)) * .0019 * vUv.w;
      vec4 base = texture2DProj(tDiffuse, warped);`,
    ).replace('vec4( blendOverlay( base.rgb, color ), 1.0 )',
      'vec4(blendOverlay(base.rgb, color), uOpacity)')
    space.add(floorReflection)
  }
  const ceiling = mesh(space, geo(new THREE.PlaneGeometry(24, 24)), architecture, 0, 5.8)
  ceiling.rotation.x = Math.PI / 2
  const causticMaterial = mat(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: screenVertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 18.0;
        float t = uTime * .38;
        float f = sin(p.x + p.y + t) + sin(p.x * 1.5 - p.y * 1.3 - t * .8)
          + sin(p.y * 1.9 + cos(p.x + t)) * .8;
        float light = pow(max(0.0, 1.0 - abs(f)), 7.0);
        vec3 color = mix(vec3(.2, .7, 1.0), vec3(.73, .31, 1.0), .5 + sin(p.x * .3) * .5);
        gl_FragColor = vec4(color, light * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  // The underside of the floor becomes the next chamber's illuminated ceiling.
  const caustics = mesh(space, geo(new THREE.PlaneGeometry(18, 20)), causticMaterial, 0, -3.76, -1)
  caustics.rotation.x = Math.PI / 2
  const rocks = instanced(space, geo(new THREE.IcosahedronGeometry(1, software ? 0 : 1)),
    architecture, software ? 16 : mobile ? 28 : 48, false)
  for (let i = 0; i < rocks.count; i++) {
    const a = i * 2.399963
    const radius = 2.9 + (i % 9) * .42
    dummy.position.set(Math.cos(a) * radius, -3.51, Math.sin(a) * radius)
    dummy.rotation.set(i * .7, i * 1.3, i * .37)
    dummy.scale.set(.24 + (i % 4) * .14, .05 + (i % 3) * .055, .3 + (i % 6) * .12)
    dummy.updateMatrix()
    rocks.setMatrixAt(i, dummy.matrix)
  }
  const wallGeometry = geo(new THREE.BoxGeometry(1, 1, 1))
  const architectureBars = instanced(space, wallGeometry, architecture, 28, false)
  for (let i = 0; i < 28; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const row = Math.floor(i / 2)
    dummy.position.set(side * (row < 8 ? 7.5 : 3.3), row < 8 ? -7 : 5.2,
      row < 8 ? 4 - row * 2.2 : 5 - (row - 8) * 3.4)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(row < 8 ? .34 : 15, row < 8 ? 28 : .36, .3)
    dummy.updateMatrix()
    architectureBars.setMatrixAt(i, dummy.matrix)
  }
  const backWall = mesh(space, wallGeometry, architecture, 0, -7, -12)
  backWall.scale.set(16, 28, .3)
  const plinth = mesh(chamber,
    geo(new THREE.CylinderGeometry(2.25, 2.55, .27, software ? 32 : 64)), dark, 0, -3.13)
  const socket = mesh(chamber,
    geo(new THREE.CylinderGeometry(1.75, 2.2, .2, software ? 32 : 64)), machineMetal, 0, -2.89)
  const upperSocket = mesh(chamber,
    geo(new THREE.CylinderGeometry(1.95, 1.6, .24, software ? 32 : 64)), machineMetal, 0, 2.85)
  const bolts = instanced(chamber, geo(new THREE.CylinderGeometry(.045, .045, .1, 6)), machineMetal, 64, false)
  for (let i = 0; i < bolts.count; i++) {
    const a = (i % 32) / 32 * TAU
    dummy.position.set(Math.sin(a) * 1.92, i < 32 ? -2.99 : 2.98, Math.cos(a) * 1.92)
    dummy.rotation.set(0, a, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    bolts.setMatrixAt(i, dummy.matrix)
  }
  const rods = instanced(chamber,
    geo(new THREE.CylinderGeometry(.025, .025, 1, 6)), machineMetal, software ? 12 : 24)
  const conduits = instanced(chamber,
    geo(new THREE.CylinderGeometry(.008, .008, 1, 5)), glow, software ? 8 : 16)
  const conduitCount = software ? 6 : mobile ? 10 : 14
  const cableGeometry = geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.85, 1.65), new THREE.Vector3(0, 2.15, 2.2),
    new THREE.Vector3(0, 1.3, 3.1), new THREE.Vector3(0, 2.4, 4.7),
    new THREE.Vector3(0, 5.7, 5.4),
  ]), software ? 18 : 40, .024, 5, false))
  const cables = instanced(chamber, cableGeometry, machineMetal, conduitCount, false)
  for (let i = 0; i < conduitCount; i++) {
    dummy.position.set(0, 0, 0)
    dummy.rotation.set(0, i / conduitCount * TAU, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    cables.setMatrixAt(i, dummy.matrix)
  }
  const luminousRings = instanced(chamber,
    geo(new THREE.TorusGeometry(1, .009, 5, software ? 36 : 80)), glow, 5)
  const reactorLight = new THREE.PointLight(0x66ffd9, 0, 10, 2)
  reactorLight.position.set(0, -.8, 1.1)
  root.add(reactorLight)

  let lastMatterProgress = Number.NaN
  const chamberWorld = new THREE.Vector3()
  const scaleFloorHeight = sampleJourney(.83).height
  return {
    getChamberHeight() {
      return space.getWorldPosition(chamberWorld).y
    },
    capture(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
      monitorAssembly.capture(renderer, scene, camera)
    },
    update(time: number, progress: number) {
      const journey = sampleJourney(progress)
      root.position.y = journey.height
      space.position.y = -40.4 - journey.height
      // The scale curtain stays on its own floor. We travel underneath it,
      // rather than shrinking it into a replacement ring at the screen centre.
      matter.position.y = (scaleFloorHeight - journey.height) * smooth(.83, .87, progress)
      const scrollTime = progress * 55
      const spineTravel = progress * 1.4
      const sum = journey.spine + journey.machine + journey.scales
      const spine = progress > .83 ? 0 : sum > .001 ? journey.spine / sum : 1
      const machine = progress > .83 ? 0 : sum > .001 ? journey.machine / sum : 0
      const scales = progress > .83 ? 1 : sum > .001 ? journey.scales / sum : 0
      const emergence = smooth(.20, .29, progress)
      const form = emergence
      matter.visible = journey.core > .001
      metal.opacity = journey.core * (1 - spine)
      feathers.visible = spine < .999
      spineAssembly.update(progress, journey.core * spine, form)
      silver.opacity = journey.core * (1 - scales) * (1 - spine)
      joints.visible = scales < .999 && spine < .999
      armourMorph.value = scales
      chainsMaterial.opacity = journey.core * (1 - machine * .55) * (1 - spine)
      links.visible = spine < .999
      // Geometry travels and turns with scroll. Video and light keep a separate
      // ambient clock so resting on a project never drives its chains onwards.
      matter.rotation.y = journey.structureYaw + Math.sin(time * .16) * .09 * scales
      if (matter.visible && spine < .999 && (scales > .001 || progress !== lastMatterProgress)) {
        lastMatterProgress = progress
        for (let i = 0; i < count; i++) {
          const k = i * 9
          const ringAngle = i / count * TAU
          const wave = Math.sin(scrollTime * 1.7 + i * .3) * .026 * spine
          const px = poses[0][k] * spine + poses[1][k] * machine + poses[2][k] * scales
          const spineY = (THREE.MathUtils.euclideanModulo(Math.floor(i / columns) / rows + spineTravel, 1) - .5) * spineHeight
          const py = spineY * spine + poses[1][k + 1] * machine + poses[2][k + 1] * scales
          const pz = poses[0][k + 2] * spine + poses[1][k + 2] * machine + poses[2][k + 2] * scales
          dummy.position.set(
            Math.sin(ringAngle) * 1.36 * (1 - form) + (px + wave) * form,
            Math.cos(ringAngle) * 1.36 * (1 - form) + py * form,
            (pz + Math.sin(time * .9 + px * 1.2 + py * .9) * .09 * scales) * form,
          )
          dummy.rotation.set(
            (poses[0][k + 3] * spine + poses[1][k + 3] * machine + poses[2][k + 3] * scales
              + Math.sin(time * .7 + i * .22) * .12 * scales) * form,
            (poses[0][k + 4] * spine + poses[1][k + 4] * machine + poses[2][k + 4] * scales) * form,
            -ringAngle * (1 - form) + (poses[0][k + 5] * spine + poses[1][k + 5] * machine + poses[2][k + 5] * scales) * form,
          )
          dummy.scale.set(
            .19 * (1 - form) + (poses[0][k + 6] * spine + poses[1][k + 6] * machine + poses[2][k + 6] * scales) * form,
            .31 * (1 - form) + (poses[0][k + 7] * spine + poses[1][k + 7] * machine + poses[2][k + 7] * scales) * form,
            .5,
          )
          dummy.scale.multiplyScalar(1 - spine * (1 - smooth(0, .6, spineHeight / 2 - Math.abs(spineY))))
          dummy.updateMatrix()
          feathers.setMatrixAt(i, dummy.matrix)
        }
        feathers.instanceMatrix.needsUpdate = true
        for (let i = 0; i < rows; i++) {
          const t = i / (rows - 1)
          const spineY = (THREE.MathUtils.euclideanModulo(i / rows + spineTravel, 1) - .5) * spineHeight
          const edge = smooth(0, .6, spineHeight / 2 - Math.abs(spineY))
          const y = spineY * spine + Math.sign(t - .5) * (1.9 + Math.abs(t - .5) * 1.1) * machine
          const radius = (.67 + Math.sin(t * Math.PI) * .06) * spine
            + (1.28 + Math.pow(Math.abs(t - .5) * 2, 4) * .55) * machine
            + (.28 + Math.pow(Math.sin(t * Math.PI), .85) * 1.50) * scales
          dummy.position.set(0, y * form, 0)
          dummy.rotation.set(Math.PI / 2, 0, scrollTime * (.28 * spine + .04 * machine))
          dummy.scale.set(radius, radius, .48 + .5 * spine)
          dummy.scale.multiplyScalar(1 - spine * (1 - edge))
          dummy.updateMatrix()
          joints.setMatrixAt(i, dummy.matrix)
        }
        joints.instanceMatrix.needsUpdate = true
        for (let i = 0; i < chainCount; i++) {
          const strand = i % 2
          const t = THREE.MathUtils.euclideanModulo(i / chainCount + journey.chainPhase, 1)
          const angle = t * TAU * (2.2 * spine + .8 * machine + 1.5 * scales)
            + strand * Math.PI + progress * TAU * 3
          const radius = 1.55 * spine + 1.9 * machine + (2.1 + Math.sin(t * Math.PI) * .7) * scales
          dummy.position.set(Math.sin(angle) * radius, (t - .5) * 8.4 * form, Math.cos(angle) * radius)
          dummy.rotation.set(.5 + (i % 2) * Math.PI / 2, angle + Math.PI / 2, Math.sin(angle) * .25)
          dummy.scale.set(.065, .115, .065)
          dummy.updateMatrix()
          links.setMatrixAt(i, dummy.matrix)
        }
        links.instanceMatrix.needsUpdate = true
      }
      coreMaterial.uniforms.uTime.value = time
      coreMaterial.uniforms.uScroll.value = scrollTime
      coreMaterial.uniforms.uWeights.value.set(spine, machine, scales)
      coreMaterial.uniforms.uOpacity.value = journey.core * (.48 + machine * .4)

      const architectureWeight = smooth(.60, .69, progress) * (1 - journey.darkness * .77)
        * (1 - journey.scales * .60) * (1 - smooth(.86, .94, progress) * .85)
      space.visible = architectureWeight > .001
      chamber.visible = journey.machine > .001 || journey.scales > .001
      architecture.opacity = architectureWeight
      causticMaterial.uniforms.uTime.value = time
      causticMaterial.uniforms.uOpacity.value = journey.scales * .4
      caustics.visible = journey.scales > .001
      reflectionTime.value = time
      reflectionOpacity.value = architectureWeight * .68
      if (floorReflection) floorReflection.visible = architectureWeight > .1
      const deviceWeight = journey.machine
      dark.opacity = deviceWeight
      machineMetal.opacity = deviceWeight
      glow.opacity = journey.machine * .65 + journey.scales * .12
      plinth.visible = socket.visible = upperSocket.visible = bolts.visible = deviceWeight > .01
      cables.visible = rods.visible = conduits.visible = luminousRings.visible = deviceWeight > .01
      if (deviceWeight > .01) {
        for (let i = 0; i < rods.count; i++) {
          const angle = i / rods.count * TAU
          const radius = 1.7 + journey.scales * .7
          dummy.position.set(Math.sin(angle) * radius, -.02, Math.cos(angle) * radius)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, 5.6, 1)
          dummy.updateMatrix()
          rods.setMatrixAt(i, dummy.matrix)
        }
        rods.instanceMatrix.needsUpdate = true
        for (let i = 0; i < conduits.count; i++) {
          const angle = i / conduits.count * TAU + time * .15
          const pulse = .5 + Math.sin(time * 1.2 + i) * .12
          dummy.position.set(Math.sin(angle) * .75, Math.sin(time * .6 + i) * .8, Math.cos(angle) * .75)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, pulse + 1.8, 1)
          dummy.updateMatrix()
          conduits.setMatrixAt(i, dummy.matrix)
        }
        conduits.instanceMatrix.needsUpdate = true
        for (let i = 0; i < luminousRings.count; i++) {
          const y = i < 2 ? -2.73 + i * .14 : 2.72 + (i - 2) * .08
          dummy.position.set(0, y, 0)
          dummy.rotation.set(Math.PI / 2, 0, 0)
          dummy.scale.setScalar(1.73 + Math.sin(time + i) * .013)
          dummy.updateMatrix()
          luminousRings.setMatrixAt(i, dummy.matrix)
        }
        luminousRings.instanceMatrix.needsUpdate = true
      }
      reactorLight.intensity = software ? 0 : journey.machine * (21 + Math.sin(time * 1.5) * 2)
        + journey.scales * 7
      monitorAssembly.update(time, progress)
    },
    dispose() {
      spineAssembly.dispose()
      monitorAssembly.dispose()
      scene.remove(root)
      floorReflection?.dispose()
      instances.forEach((item) => item.dispose())
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
      textures.forEach((item) => item.dispose())
    },
  }
}
