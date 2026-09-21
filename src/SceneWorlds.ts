import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { sampleJourney, smooth, windowWeight } from './Journey'

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

function roundedPanel(width: number, height: number, radius: number) {
  const x = -width / 2, y = -height / 2
  const shape = new THREE.Shape()
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  const geometry = new THREE.ShapeGeometry(shape, 8)
  const positions = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, positions.getX(i) / width + .5, positions.getY(i) / height + .5)
  }
  return geometry
}

const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Original, live generative films, animated on the GPU rather than static posters.
const screenFragment = /* glsl */ `
  uniform float uTime;
  uniform float uFilm;
  uniform float uOpacity;
  varying vec2 vUv;
  mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  void main() {
    vec2 p = (vUv - .5) * vec2(1.72, 1.0);
    float t = uTime;
    vec3 color = vec3(.008, .017, .028);
    if (uFilm < .5) {
      p *= rotate(-.3);
      float wave = sin(p.x * 12.0 + sin(p.y * 7.0 + t * .8) * 2.8 - t * .6);
      float folds = sin(p.y * 22.0 + wave * 2.1 + t);
      float metal = pow(max(0.0, folds), 7.0);
      color += mix(vec3(.025, .08, .11), vec3(.82, .63, .29), .5 + wave * .5) * (.15 + metal);
      color += vec3(.68, .91, .96) * pow(max(0.0, folds), 36.0) * .6;
    } else if (uFilm < 1.5) {
      vec2 q = p * 3.2 + vec2(t * .07, -t * .04);
      float cloud = noise(q + noise(q * 1.8 + t * .06) * 3.2);
      cloud += noise(q * 3.7 - t * .13) * .32;
      float filaments = pow(max(0., 1. - abs(cloud - .64) * 4.), 3.);
      color += mix(vec3(.10,.2,.65), vec3(.12,.88,.76), cloud) * filaments;
      color += vec3(.84,.18,.56) * pow(max(0.,cloud-.55)*2.0, 2.0);
    } else if (uFilm < 2.5) {
      vec2 globe = p - vec2(sin(t*.16)*.09, 0.);
      float radius = length(globe);
      float atmosphere = exp(-abs(radius-.31)*35.);
      color += vec3(.12,.42,.85) * atmosphere * .65;
      if(radius < .3) {
        vec3 n = vec3(globe/.3, sqrt(max(0.,1.-radius*radius/.09)));
        float terrain = noise(n.xy*6. + vec2(t*.11,0.));
        float clouds = smoothstep(.56,.76,noise(n.xy*9. + vec2(t*.2,0.)));
        vec3 surface = mix(vec3(.02,.09,.2),vec3(.05,.38,.30),smoothstep(.36,.62,terrain));
        surface = mix(surface,vec3(.72,.87,.91),clouds*.8);
        color = surface * (.12 + max(0.,dot(n,normalize(vec3(-.65,.4,1.)))));
      }
      vec2 moon = p - vec2(cos(t*.25)*.52,sin(t*.25)*.25);
      color += vec3(.70,.75,.83) * (1.-smoothstep(.035,.039,length(moon)));
      color += vec3(.2,.4,.8)*step(.996,hash(floor(p*250.)))*step(.34,radius);
    } else {
      color = mix(vec3(.11,.13,.26),vec3(.78,.35,.22),1.-vUv.y);
      float sun = 1.-smoothstep(.06,.064,length(p-vec2(.24+sin(t*.08)*.08,.15)));
      color += vec3(1.,.76,.37)*sun;
      for(int i=0;i<4;i++) {
        float layer=float(i);
        float ridge=-.04-layer*.09+sin(p.x*(3.+layer)+t*.12+layer*1.7)*(.05+layer*.012);
        float mask=1.-smoothstep(ridge-.003,ridge+.003,p.y);
        color=mix(color,mix(vec3(.46,.25,.23),vec3(.06,.09,.15),layer/3.),mask);
      }
    }
    color *= .86 + .14 * sin(vUv.y * 600.0);
    color *= .6 + .4 * pow(16.0 * vUv.x * vUv.y * (1.0-vUv.x) * (1.0-vUv.y), .22);
    gl_FragColor = vec4(color, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** One fixed centre, articulated matter and the architecture around it. */
export function createSceneWorlds(scene: THREE.Scene, software: boolean, mobile = false) {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const instances: THREE.InstancedMesh[] = []
  const geo = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g }
  const mat = <T extends THREE.Material>(m: T) => { materials.push(m); return m }
  const root = new THREE.Group()
  const matter = new THREE.Group()
  const monitors = new THREE.Group()
  const chamber = new THREE.Group()
  root.add(matter, monitors, chamber)
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
  const boneMaterial = mat(new THREE.MeshPhysicalMaterial({
    color: 0xa9bacb, metalness: software ? .35 : 1, roughness: software ? .4 : .27, envMapIntensity: 1.45,
    iridescence: software ? 0 : .65, iridescenceThicknessRange: [150, 460], transparent: true,
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

  const rows = software ? 14 : mobile ? 20 : 28
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
      Math.sin(spineAngle) * spineRadius, (t - .5) * 6.5, Math.cos(spineAngle) * spineRadius,
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
  const boneGeometry = geo(new THREE.LatheGeometry([
    new THREE.Vector2(.64, -.5), new THREE.Vector2(.87, -.4),
    new THREE.Vector2(.89, -.3), new THREE.Vector2(.60, -.18),
    new THREE.Vector2(.51, .08), new THREE.Vector2(.69, .26),
    new THREE.Vector2(.88, .36), new THREE.Vector2(.81, .5),
  ], software ? 12 : 28))
  const boneVertices = boneGeometry.getAttribute('position')
  for (let i = 0; i < boneVertices.count; i++) {
    const x = boneVertices.getX(i)
    const y = boneVertices.getY(i)
    const z = boneVertices.getZ(i)
    const twist = 1 + Math.sin(Math.atan2(x, z) * 5 + y * 2.3) * .085
    boneVertices.setXYZ(i, x * twist, y, z * twist)
  }
  boneGeometry.computeVertexNormals()
  const vertebrae = instanced(matter, boneGeometry, boneMaterial, rows)
  const boneArms = instanced(matter, geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(.3, 0, 0), new THREE.Vector3(.62, .04, .03),
    new THREE.Vector3(.92, -.12, .16), new THREE.Vector3(1.20, -.25, .13),
    new THREE.Vector3(1.42, -.24, .08),
  ]), software ? 8 : 16, .075, software ? 5 : 8, false)), boneMaterial, rows * 2)
  const chainCount = software ? 56 : mobile ? 100 : 152
  const links = instanced(matter,
    geo(new THREE.TorusGeometry(1, .18, 5, software ? 8 : 12)), chainsMaterial, chainCount)

  // The illuminated particles inhabit this same structure through every transformation.
  const pointCount = software ? 420 : mobile ? 1100 : 2300
  const seeds = new Float32Array(pointCount * 3)
  for (let i = 0; i < pointCount; i++) seeds.set([i / pointCount, (i * .61803398875) % 1, (i * .754877666) % 1], i * 3)
  const pointGeometry = geo(new THREE.BufferGeometry())
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3))
  const coreMaterial = mat(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uWeights: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 0 }, uSize: { value: software ? 28 : mobile ? 25 : 19 },
    },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWeights;
      uniform float uSize;
      varying float vBrightness;
      void main() {
        float flow = fract(position.x + uTime * .085);
        float a = position.y * 6.283185 + uTime * .7;
        float r = .16 + position.z * .47;
        vec3 spine = vec3(sin(a + flow * 15.0) * r, (flow - .5) * 6.3, cos(a + flow * 15.0) * r);
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
  }))
  const floorGeometry = geo(new THREE.PlaneGeometry(24, 24, 22, 22))
  const vertices = floorGeometry.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i)
    const y = vertices.getY(i)
    vertices.setZ(i, Math.sin(x * 2.4 + y) * Math.cos(y * 1.8) * .045)
  }
  floorGeometry.computeVertexNormals()
  const floor = mesh(chamber, floorGeometry, architecture, 0, -3.7)
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
    chamber.add(floorReflection)
  }
  const ceiling = mesh(chamber, geo(new THREE.PlaneGeometry(24, 24)), architecture, 0, 5.8)
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
  const caustics = mesh(chamber, geo(new THREE.PlaneGeometry(18, 20)), causticMaterial, 0, 4.8, -1)
  caustics.rotation.x = Math.PI / 2
  const rocks = instanced(chamber, geo(new THREE.IcosahedronGeometry(1, software ? 0 : 1)),
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
  const architectureBars = instanced(chamber, wallGeometry, architecture, 28, false)
  for (let i = 0; i < 28; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const row = Math.floor(i / 2)
    dummy.position.set(side * (row < 8 ? 7.5 : 3.3), row < 8 ? .8 : 5.2,
      row < 8 ? 4 - row * 2.2 : 5 - (row - 8) * 3.4)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(row < 8 ? .34 : 15, row < 8 ? 9 : .36, .3)
    dummy.updateMatrix()
    architectureBars.setMatrixAt(i, dummy.matrix)
  }
  const backWall = mesh(chamber, wallGeometry, architecture, 0, .8, -12)
  backWall.scale.set(16, 10, .3)
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

  const screenFrame = mat(new THREE.MeshStandardMaterial({
    color: 0x304341, metalness: 1, roughness: .22, transparent: true, envMapIntensity: 1.5,
  }))
  const screenBacking = mat(new THREE.MeshStandardMaterial({
    color: 0x07100f, metalness: .65, roughness: .3, transparent: true,
  }))
  const screenRim = mat(new THREE.MeshBasicMaterial({ color: 0x476c66, transparent: true }))
  const panelGeometry = geo(roundedPanel(2.72, 1.58, .12))
  const frameGeometry = geo(roundedPanel(2.78, 1.64, .14))
  const rimGeometry = geo(roundedPanel(2.81, 1.67, .15))
  const panels: THREE.Group[] = []
  const films: THREE.ShaderMaterial[] = []
  const labelMaterials: THREE.MeshBasicMaterial[] = []
  const names = ['LIMINAL / 01', 'PULSE / 02', 'ORBITAL / 03', 'SOLSTICE / 04']
  for (let i = 0; i < 4; i++) {
    const panel = new THREE.Group()
    mesh(panel, rimGeometry, screenRim, 0, 0, -.08)
    mesh(panel, frameGeometry, screenFrame, 0, 0, -.045)
    const back = mesh(panel, panelGeometry, screenBacking, 0, 0, -.09)
    back.rotation.y = Math.PI
    const film = mat(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFilm: { value: i }, uOpacity: { value: 0 } },
      vertexShader: screenVertex, fragmentShader: screenFragment,
      transparent: true, side: THREE.FrontSide,
    }))
    mesh(panel, panelGeometry, film)
    films.push(film)
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#9eada6'
      ctx.font = '17px monospace'
      ctx.fillText(names[i], 1, 30)
      ctx.fillStyle = '#65796f'
      ctx.font = '13px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('MOTION STUDY', 508, 30)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      textures.push(texture)
      const labelMaterial = mat(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
      labelMaterials.push(labelMaterial)
      mesh(panel, geo(new THREE.PlaneGeometry(2.72, .255)), labelMaterial, 0, -.99, .015)
    }
    monitors.add(panel)
    panels.push(panel)
  }

  return {
    update(time: number, progress: number) {
      const journey = sampleJourney(progress)
      const sum = journey.spine + journey.machine + journey.scales
      const spine = sum > .001 ? journey.spine / sum : 1
      const machine = sum > .001 ? journey.machine / sum : 0
      const scales = sum > .001 ? journey.scales / sum : 0
      const emergence = smooth(.20, .29, progress)
      const returnToRing = smooth(.88, .96, progress)
      const form = emergence * (1 - returnToRing)
      matter.visible = journey.core > .001
      metal.opacity = journey.core
      silver.opacity = journey.core * (1 - scales)
      boneMaterial.opacity = journey.core * spine
      vertebrae.visible = boneArms.visible = spine > .001
      joints.visible = scales < .999
      armourMorph.value = scales
      chainsMaterial.opacity = journey.core * (1 - machine * .55)
      // The origin never travels; all transformations share this material centre.
      matter.rotation.y = Math.sin(time * .12) * .05 + Math.sin(time * .16) * .09 * scales
      if (matter.visible) {
        for (let i = 0; i < count; i++) {
          const k = i * 9
          const ringAngle = i / count * TAU
          const wave = Math.sin(time * 1.7 + i * .3) * .026 * spine
          const px = poses[0][k] * spine + poses[1][k] * machine + poses[2][k] * scales
          const py = poses[0][k + 1] * spine + poses[1][k + 1] * machine + poses[2][k + 1] * scales
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
          dummy.updateMatrix()
          feathers.setMatrixAt(i, dummy.matrix)
        }
        feathers.instanceMatrix.needsUpdate = true
        for (let i = 0; i < rows; i++) {
          const t = i / (rows - 1)
          const y = (t - .5) * 6.5 * spine + Math.sign(t - .5) * (1.9 + Math.abs(t - .5) * 1.1) * machine
          const radius = (.67 + Math.sin(t * Math.PI) * .06) * spine
            + (1.28 + Math.pow(Math.abs(t - .5) * 2, 4) * .55) * machine
            + (.28 + Math.pow(Math.sin(t * Math.PI), .85) * 1.50) * scales
          dummy.position.set(0, y * form, 0)
          dummy.rotation.set(Math.PI / 2, 0, time * (.28 * spine + .04 * machine))
          dummy.scale.set(radius, radius, .48 + .5 * spine)
          dummy.updateMatrix()
          joints.setMatrixAt(i, dummy.matrix)
          dummy.position.set(Math.sin(i * 1.7) * .035, (t - .5) * 6.5 * form, 0)
          dummy.rotation.set(Math.sin(i * .6) * .035, i * .23 + Math.sin(time * .3 + i) * .045, Math.sin(i) * .045)
          dummy.scale.set(.86 + Math.sin(i * 1.3) * .07, 6.5 / rows * .82, .76)
          dummy.updateMatrix()
          vertebrae.setMatrixAt(i, dummy.matrix)
          for (let side = 0; side < 2; side++) {
            dummy.position.set(0, (t - .5) * 6.5 * form, 0)
            dummy.rotation.set(0, side * Math.PI + Math.sin(i * .8) * .4 + Math.sin(time * .5 + i) * .08,
              Math.sin(i * 1.3) * .09)
            dummy.scale.set(.88 + Math.sin(i * 1.2) * .23, .85, 1)
            dummy.updateMatrix()
            boneArms.setMatrixAt(i * 2 + side, dummy.matrix)
          }
        }
        joints.instanceMatrix.needsUpdate = true
        vertebrae.instanceMatrix.needsUpdate = true
        boneArms.instanceMatrix.needsUpdate = true
        for (let i = 0; i < chainCount; i++) {
          const strand = i % 2
          const t = ((i / chainCount) + time * (.15 * spine + .025 * machine + .035 * scales)) % 1
          const angle = t * TAU * (2.2 * spine + .8 * machine + 1.5 * scales)
            + strand * Math.PI + time * (.2 * spine + .08 * scales)
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
      coreMaterial.uniforms.uWeights.value.set(spine, machine, scales)
      coreMaterial.uniforms.uOpacity.value = journey.core * (.48 + machine * .4)

      const architectureWeight = smooth(.60, .69, progress) * (1 - journey.darkness * .77) * (1 - journey.scales * .60)
      chamber.visible = architectureWeight > .001
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
      const screensWeight = windowWeight(progress, .265, .325, .60, .68)
      monitors.visible = screensWeight > .001
      screenFrame.opacity = screenBacking.opacity = screensWeight
      screenRim.opacity = screensWeight * .58
      for (let i = 0; i < panels.length; i++) {
        const orbit = (progress - .30) * TAU * 2.8 + i * Math.PI / 2 + .35
        const front = Math.cos(orbit)
        const panelScale = 1.05 + Math.max(0, front) * .92
        panels[i].position.set(Math.sin(orbit) * 3.65,
          Math.sin(orbit * .7 + i * .65) * 1.35 + Math.sin(time * .35 + i) * .045,
          front * 2.15 - .15)
        panels[i].rotation.set(Math.sin(orbit + i) * .035,
          -Math.sin(orbit) * .30 + Math.sin(time * .12 + i) * .025, Math.sin(orbit) * -.025)
        panels[i].scale.setScalar(panelScale)
        films[i].uniforms.uTime.value = time
        films[i].uniforms.uOpacity.value = screensWeight
        if (labelMaterials[i]) labelMaterials[i].opacity = screensWeight
      }
    },
    dispose() {
      scene.remove(root)
      floorReflection?.dispose()
      instances.forEach((item) => item.dispose())
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
      textures.forEach((item) => item.dispose())
    },
  }
}
