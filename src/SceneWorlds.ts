import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { createSpineAssembly } from './SceneSpine'
import { createSceneMonitors } from './SceneMonitors'
import type { createSceneVideo } from './SceneVideo'
import { sampleJourney, smooth } from './Journey'

const TAU = Math.PI * 2

/** A regular, point-topped hexagon with a narrow metal bevel, not a padded tile. */
function scaleGeometry(software: boolean) {
  const outline = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * TAU + Math.PI / 2
    const x = Math.cos(angle) * .484
    const y = Math.sin(angle) * .484
    if (i === 0) outline.moveTo(x, y)
    else outline.lineTo(x, y)
  }
  outline.closePath()
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: .040, bevelEnabled: true, bevelSize: .013, bevelThickness: .010,
    bevelSegments: software ? 1 : 2, steps: 1, curveSegments: 1,
  })
  geometry.translate(0, 0, -.020)
  geometry.setAttribute('aArmour', geometry.getAttribute('position').clone())
  geometry.setAttribute('aArmourNormal', geometry.getAttribute('normal').clone())
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
export function createSceneWorlds(
  scene: THREE.Scene, software: boolean, mobile = false,
  externalMedia?: ReturnType<typeof createSceneVideo>,
) {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const instances: THREE.InstancedMesh[] = []
  const geo = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g }
  const mat = <T extends THREE.Material>(m: T) => { materials.push(m); return m }
  const root = new THREE.Group()
  const matter = new THREE.Group()
  const monitorAssembly = createSceneMonitors(software, mobile, externalMedia)
  const monitors = monitorAssembly.group
  const spineAssembly = createSpineAssembly(software, mobile)
  matter.add(spineAssembly.group)
  const chamber = new THREE.Group()
  const scaleWall = new THREE.Group()
  const space = new THREE.Group()
  matter.name = 'aether-matter'
  chamber.name = 'aether-machine-assembly'
  scaleWall.name = 'aether-scale-wall'
  space.name = 'aether-chamber-space'
  root.add(matter, monitors, chamber, scaleWall, space)
  scene.add(root)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const metal = mat(new THREE.MeshPhysicalMaterial({
    color: 0x92928d, metalness: software ? .45 : 1, roughness: software ? .42 : .32,
    envMapIntensity: .72, clearcoat: software ? 0 : .08, clearcoatRoughness: .38,
    iridescence: software ? 0 : .32, iridescenceIOR: 1.38,
    iridescenceThicknessRange: [120, 470], transparent: true,
  }))
  const pointerNdc = { value: new THREE.Vector2() }
  const pointerStrength = { value: 0 }
  const pointerAspect = { value: 1 }
  const surfaceTime = { value: 0 }
  metal.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfacePointer = pointerNdc
    shader.uniforms.uSurfaceStrength = pointerStrength
    shader.uniforms.uSurfaceAspect = pointerAspect
    shader.uniforms.uSurfaceTime = surfaceTime
    shader.vertexShader = /* glsl */ `
      attribute vec3 aArmour;
      attribute vec3 aArmourNormal;
      uniform vec2 uSurfacePointer;
      uniform float uSurfaceStrength;
      uniform float uSurfaceAspect;
      uniform float uSurfaceTime;
      varying float vSurfaceHeat;
      varying vec3 vTilePoint;
    ` + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>',
      /* glsl */ `
        #include <beginnormal_vertex>
        vec4 tileCentre = vec4(0.0, 0.0, 0.0, 1.0);
        float tileUnit = 1.0;
        #ifdef USE_INSTANCING
          tileCentre = instanceMatrix * tileCentre;
          tileUnit = max(length(instanceMatrix[0].xyz), .001);
        #endif
        vec4 tileClip = projectionMatrix * modelViewMatrix * tileCentre;
        vec2 tileDelta = (tileClip.xy / max(tileClip.w, .001) - uSurfacePointer)
          * vec2(uSurfaceAspect, 1.0);
        vSurfaceHeat = exp(-dot(tileDelta, tileDelta) * 20.0) * uSurfaceStrength
          * step(.001, tileClip.w);
        vec2 radialDirection = normalize(tileCentre.xy + vec2(.001));
        float tileRadius = length(tileCentre.xy * vec2(.85, 1.1));
        float tilePhase = tileRadius * 2.55 - uSurfaceTime * .42;
        float tileEnvelope = .5 + .5 * exp(-tileRadius * .12);
        float tileAngle = cos(tilePhase) * .75 * tileEnvelope;
        vec3 tileAxis = vec3(-radialDirection.y, radialDirection.x, 0.0);
        float tileCos = cos(tileAngle);
        float tileSin = sin(tileAngle);
        objectNormal = aArmourNormal * tileCos + cross(tileAxis, aArmourNormal) * tileSin
          + tileAxis * dot(tileAxis, aArmourNormal) * (1.0 - tileCos);
        objectNormal = normalize(objectNormal + vec3(tileDelta * vSurfaceHeat * .20, 0.0));
      `)
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
      vec3 transformed = aArmour * tileCos + cross(tileAxis, aArmour) * tileSin
        + tileAxis * dot(tileAxis, aArmour) * (1.0 - tileCos);
      vTilePoint = aArmour;
      float tileRipple = sin(tilePhase) * .46 * tileEnvelope
        + sin(tileCentre.x * .55 + uSurfaceTime * .22) * .14;
      transformed.z += (tileRipple + vSurfaceHeat * .36) / tileUnit;
      transformed.y += sin(uSurfaceTime * 1.4 + tileCentre.x * 2.0) * vSurfaceHeat * .045;
    `)
    shader.fragmentShader = 'varying float vSurfaceHeat; varying vec3 vTilePoint;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float hammered = sin(vTilePoint.x * 83. + sin(vTilePoint.y * 51.) * 2.3)
        * sin(vTilePoint.y * 76. + cos(vTilePoint.x * 35.));
      float detailFade = 1. - smoothstep(.012, .055, max(fwidth(vTilePoint.x), fwidth(vTilePoint.y)));
      normal = normalize(normal + vec3(hammered * .14,
        sin(vTilePoint.y * 87. + vTilePoint.x * 38.) * .09, 0.) * detailFade);
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = max(.16, roughnessFactor - vSurfaceHeat * .10);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.06, .25, .32) * vSurfaceHeat;')
  }
  metal.customProgramCacheKey = () => 'aether-radial-hex-pointer-v4'
  const silver = mat(new THREE.MeshStandardMaterial({
    color: 0x4d5964, metalness: software ? .35 : .9, roughness: .43, envMapIntensity: .70, transparent: true,
  }))
  const chainsMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x4d5864, metalness: software ? .35 : .9, roughness: .42, envMapIntensity: .65, transparent: true,
  }))
  const dark = mat(new THREE.MeshStandardMaterial({
    color: 0x15282c, metalness: software ? .35 : .9, roughness: .29, envMapIntensity: 1.2, transparent: true,
  }))
  const machineMetal = mat(new THREE.MeshStandardMaterial({
    color: 0x414b56, metalness: software ? .4 : .92, roughness: .46, envMapIntensity: .65, transparent: true,
  }))
  const glow = mat(new THREE.MeshBasicMaterial({
    color: 0x537b8a, transparent: true, opacity: .3,
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

  const wallColumns = software ? 16 : mobile ? 22 : 28
  const wallRows = software ? 10 : mobile ? 13 : 16
  const count = wallColumns * wallRows
  const tileHeight = 5.4 / ((wallRows - 1) * .75 + 1)
  const tileWidth = tileHeight * Math.sqrt(3) / 2
  const feathers = instanced(scaleWall, geo(scaleGeometry(software)), metal, count, false)
  feathers.name = 'aether-scale-tiles'
  const bronze = new THREE.Color().setRGB(.38, .285, .18)
  const teal = new THREE.Color().setRGB(.17, .30, .28)
  const violet = new THREE.Color().setRGB(.29, .19, .30)
  for (let i = 0; i < count; i++) {
    const wallRow = Math.floor(i / wallColumns)
    const wallX = ((i % wallColumns) - (wallColumns - 1) * .5 + ((wallRow % 2) - .5) * .5) * tileWidth
    const wallY = (wallRow - (wallRows - 1) * .5) * tileHeight * .75
    dummy.position.set(wallX, wallY, -.65 + wallX * wallX * .025 + Math.cos(wallY * .7) * .13)
    dummy.rotation.set(wallY * -.02, -wallX * .065, 0)
    dummy.scale.setScalar(tileHeight * .965)
    dummy.updateMatrix()
    feathers.setMatrixAt(i, dummy.matrix)
    const tealWeight = Math.exp(-((wallX - 1.1) ** 2 * .19 + (wallY - .7) ** 2 * .32)) * .85
    const violetWeight = Math.exp(-((wallX + 3.5) ** 2 * .16 + (wallY + .5) ** 2 * .20)) * .52
      + Math.exp(-((wallX - 4.5) ** 2 * .38 + wallY * wallY * .18)) * .38
    color.copy(bronze).lerp(teal, tealWeight).lerp(violet, Math.min(.8, violetWeight))
    color.multiplyScalar(.84 + Math.sin(wallX * .7 + wallY * .93) * .10)
    feathers.setColorAt(i, color)
  }
  const joints = instanced(chamber,
    geo(new THREE.TorusGeometry(1, .09, software ? 5 : 8, software ? 20 : 36)), silver,
    software ? 4 : 6, false)
  for (let i = 0; i < joints.count; i++) {
    const half = joints.count / 2
    const lower = i < half
    dummy.position.set(0, (lower ? -1 : 1) * (2.05 + i % half * .24), 0)
    dummy.rotation.set(Math.PI / 2, 0, 0)
    dummy.scale.setScalar(1.35 + i % half * .12)
    dummy.updateMatrix()
    joints.setMatrixAt(i, dummy.matrix)
  }
  const chainCount = software ? 56 : mobile ? 100 : 152
  const links = instanced(chamber,
    geo(new THREE.TorusGeometry(1, .18, 5, software ? 8 : 12)), chainsMaterial, chainCount, false)
  links.name = 'aether-mechanical-chain'
  for (let i = 0; i < chainCount; i++) {
    const strand = i % 2
    const t = Math.floor(i / 2) / (chainCount / 2 - 1)
    const angle = t * TAU * .8 + strand * Math.PI
    dummy.position.set(Math.sin(angle) * 1.88, (t - .5) * 5.4, Math.cos(angle) * 1.88)
    dummy.rotation.set(.5 + (Math.floor(i / 2) % 2) * Math.PI / 2, angle + Math.PI / 2, Math.sin(angle) * .25)
    dummy.scale.set(.065, .115, .065)
    dummy.updateMatrix()
    links.setMatrixAt(i, dummy.matrix)
  }

  // Each layer keeps its own particle field; the camera passes through the floor
  // between them rather than morphing the device's core into the scale wall.
  const pointCount = software ? 420 : mobile ? 1100 : 2300
  const seeds = new Float32Array(pointCount * 3)
  for (let i = 0; i < pointCount; i++) seeds.set([i / pointCount, (i * .61803398875) % 1, (i * .754877666) % 1], i * 3)
  const pointGeometry = geo(new THREE.BufferGeometry())
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3))
  const coreMaterial = mat(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScroll: { value: 0 }, uWeights: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 0 }, uSize: { value: software ? 28 : mobile ? 25 : 19 },
      uPointMax: { value: 5 }, uPearl: { value: 0 },
      uPointer: pointerNdc, uPointerStrength: pointerStrength, uPointerAspect: pointerAspect,
    },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScroll;
      uniform vec3 uWeights;
      uniform float uSize;
      uniform float uPointMax;
      uniform vec2 uPointer;
      uniform float uPointerStrength;
      uniform float uPointerAspect;
      varying float vBrightness;
      varying float vPointerHeat;
      varying float vPearlTone;
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
        vec4 clip = projectionMatrix * view;
        vec2 delta = (clip.xy / max(clip.w, .001) - uPointer) * vec2(uPointerAspect, 1.0);
        vPointerHeat = exp(-dot(delta, delta) * 22.0) * uPointerStrength
          * (1.0 - uWeights.x) * step(.001, clip.w);
        view.xy += normalize(delta + vec2(.0001)) * vPointerHeat * .32;
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(uSize / max(.1, -view.z) * (1.0 + vPointerHeat * .45), 1.0, uPointMax);
        vBrightness = .35 + .65 * position.z + vPointerHeat * .9;
        vPearlTone = position.y;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uWeights;
      uniform float uPearl;
      varying float vBrightness;
      varying float vPointerHeat;
      varying float vPearlTone;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.0;
        if (r > 1.0) discard;
        vec3 tint = vec3(.65, .30, .83) * uWeights.x + vec3(.22, 1.0, .83) * uWeights.y + vec3(1.0, .66, .24) * uWeights.z;
        tint += vec3(.10, .22, .24) * vPointerHeat;
        float alpha = pow(1.0 - r, 1.8) * uOpacity * vBrightness;
        if (uPearl > .5) {
          vec2 xy = (gl_PointCoord - .5) * 2.0;
          vec3 pearlNormal = vec3(xy, sqrt(max(0.0, 1.0 - r * r)));
          vec3 lightDirection = normalize(vec3(-.45, .65, .72));
          float diffuse = .28 + .72 * max(0.0, dot(pearlNormal, lightDirection));
          float specular = pow(max(0.0, dot(pearlNormal, lightDirection)), 22.0);
          vec3 body = mix(vec3(.16, .23, .29), vec3(.39, .44, .51), vPearlTone);
          body = mix(body, vec3(.40, .27, .47), pow(1.0 - pearlNormal.z, 2.0) * .55);
          tint = body * diffuse + vec3(.67, .78, .91) * specular * .60;
          tint += vec3(.06, .15, .21) * vPointerHeat;
          alpha = (1.0 - smoothstep(.84, 1.0, r)) * uOpacity;
        }
        gl_FragColor = vec4(tint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }))
  const core = new THREE.Points(pointGeometry, coreMaterial)
  core.frustumCulled = false
  matter.add(core)
  const createLayerCore = (parent: THREE.Group, weights: THREE.Vector3, name: string,
    geometry = pointGeometry) => {
    const material = mat(coreMaterial.clone())
    material.uniforms.uWeights.value.copy(weights)
    material.uniforms.uPointer = pointerNdc
    material.uniforms.uPointerStrength = pointerStrength
    material.uniforms.uPointerAspect = pointerAspect
    const points = new THREE.Points(geometry, material)
    points.name = name
    points.frustumCulled = false
    parent.add(points)
    return { material, points }
  }
  const machinePointCount = software ? 600 : mobile ? 1800 : 4200
  const machineSeeds = new Float32Array(machinePointCount * 3)
  for (let i = 0; i < machinePointCount; i++) {
    machineSeeds.set([i / machinePointCount, (i * .61803398875) % 1, (i * .754877666) % 1], i * 3)
  }
  const machinePointGeometry = geo(new THREE.BufferGeometry())
  machinePointGeometry.setAttribute('position', new THREE.BufferAttribute(machineSeeds, 3))
  const machineCore = createLayerCore(chamber, new THREE.Vector3(0, 1, 0), 'aether-machine-core', machinePointGeometry)
  machineCore.material.uniforms.uSize.value = 45
  machineCore.material.uniforms.uPointMax.value = 8
  machineCore.material.uniforms.uPearl.value = 1
  machineCore.material.blending = THREE.NormalBlending
  machineCore.material.depthWrite = true
  const scaleCore = createLayerCore(scaleWall, new THREE.Vector3(0, 0, 1), 'aether-scale-core')

  // Architecture appears around the centre and remains behind the final ring.
  const architecture = mat(new THREE.MeshStandardMaterial({
    color: 0x0a171b, metalness: .7, roughness: .37, envMapIntensity: .75, transparent: true,
    depthWrite: false,
  }))
  const floorMaterial = mat(architecture.clone())
  floorMaterial.side = THREE.DoubleSide
  floorMaterial.forceSinglePass = true
  floorMaterial.depthWrite = true
  const platformWidth = 17
  const platformDepth = 10.5
  const platformZ = -2.75 // Back -8, front +2.5: the camera passes the visible edge.
  const floorGeometry = geo(new THREE.PlaneGeometry(platformWidth, platformDepth, 18, 12))
  const vertices = floorGeometry.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i)
    const y = vertices.getY(i)
    vertices.setZ(i, Math.sin(x * 2.4 + y) * Math.cos(y * 1.8) * .018)
  }
  floorGeometry.computeVertexNormals()
  const floor = mesh(space, floorGeometry, floorMaterial, 0, -3.7, platformZ)
  floor.name = 'aether-separating-floor'
  floor.rotation.x = -Math.PI / 2
  const slabMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x070c10, metalness: .45, roughness: .65, envMapIntensity: .3, transparent: true,
  }))
  const slab = mesh(space, geo(new THREE.BoxGeometry(platformWidth, .26, platformDepth)),
    slabMaterial, 0, -3.86, platformZ)
  slab.name = 'aether-floor-edge'
  // One small reflection target on desktop. Software/mobile keep the cheaper metal floor.
  const floorReflection = !software && !mobile ? new Reflector(geo(new THREE.PlaneGeometry(platformWidth, platformDepth)), {
    textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .004, color: 0x52676d,
  }) : null
  const reflectionTime = { value: 0 }
  const reflectionOpacity = { value: 0 }
  if (floorReflection) {
    floorReflection.position.y = -3.61
    floorReflection.position.z = platformZ
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
        vec2 p = vUv * 43.0;
        float t = uTime * .38;
        float f = sin(p.x + p.y + t) + sin(p.x * 1.5 - p.y * 1.3 - t * .8)
          + sin(p.y * 1.9 + cos(p.x + t)) * .8;
        float light = pow(max(0.0, 1.0 - abs(f)), 12.0);
        vec3 color = mix(vec3(.14, .28, .32), vec3(.28, .34, .40), .5 + sin(p.x * .3) * .5);
        gl_FragColor = vec4(color, light * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  // The underside of the floor becomes the next chamber's illuminated ceiling.
  const caustics = mesh(space, geo(new THREE.PlaneGeometry(platformWidth, platformDepth)),
    causticMaterial, 0, -4.01, platformZ)
  caustics.rotation.x = Math.PI / 2
  const rocks = instanced(space, geo(new THREE.IcosahedronGeometry(1, software ? 0 : 1)),
    architecture, software ? 16 : mobile ? 28 : 48, false)
  for (let i = 0; i < rocks.count; i++) {
    const a = i * 2.399963
    const radius = 2.9 + (i % 9) * .42
    dummy.position.set(Math.cos(a) * radius, -3.51, Math.min(1.8 + Math.sin(i * .7) * .35, Math.sin(a) * radius))
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
  plinth.name = 'aether-machine-plinth'
  const socket = mesh(chamber,
    geo(new THREE.CylinderGeometry(1.75, 2.2, .2, software ? 32 : 64)), machineMetal, 0, -2.89)
  socket.name = 'aether-machine-lower-socket'
  const upperSocket = mesh(chamber,
    geo(new THREE.CylinderGeometry(1.95, 1.6, .24, software ? 32 : 64)), machineMetal, 0, 2.85)
  upperSocket.name = 'aether-machine-upper-socket'
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
    geo(new THREE.CylinderGeometry(.025, .025, 1, 6)), machineMetal, software ? 12 : 24, false)
  for (let i = 0; i < rods.count; i++) {
    const angle = i / rods.count * TAU
    dummy.position.set(Math.sin(angle) * 1.7, -.02, Math.cos(angle) * 1.7)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 5.6, 1)
    dummy.updateMatrix()
    rods.setMatrixAt(i, dummy.matrix)
  }
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
  const reactorLight = new THREE.PointLight(0x7fa8d8, 0, 10, 2)
  reactorLight.position.set(0, -.8, 1.1)
  chamber.add(reactorLight)

  const chamberWorld = new THREE.Vector3()
  const cameraWorld = new THREE.Vector3()
  const projectedCore = new THREE.Vector3()
  const chamberHeight = -40.4
  const floorHeight = chamberHeight - 3.7
  monitorAssembly.setOccluders([matter, chamber])
  const scaleHeight = -48.0
  return {
    getChamberHeight() {
      return space.getWorldPosition(chamberWorld).y
    },
    capture(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
      monitorAssembly.capture(renderer, scene, camera)
    },
    setMediaActive(active: boolean, reducedMotion: boolean) {
      monitorAssembly.setMediaActive(active, reducedMotion)
    },
    getVideoStatus() {
      return monitorAssembly.getVideoStatus()
    },
    getHoveredPanel() {
      return monitorAssembly.getHoveredPanel()
    },
    getMonitorHit(ndc: THREE.Vector2, camera: THREE.Camera) {
      return monitorAssembly.pick(ndc, camera)
    },
    update(time: number, progress: number,
      pointer?: { ndc: THREE.Vector2; strength: number; aspect: number; active?: boolean }, camera?: THREE.Camera) {
      const journey = sampleJourney(progress)
      root.position.y = journey.height
      // Root follows the travelling spine; both mechanical layers stay in world
      // space. Their separation is real even while both are visible together.
      space.position.y = chamberHeight - journey.height
      chamber.position.y = chamberHeight - journey.height
      scaleWall.position.y = scaleHeight - journey.height
      matter.position.y = 0
      matter.rotation.y = journey.structureYaw
      scaleWall.rotation.y = 0
      const emergence = smooth(.205, .29, progress)
      const spineWeight = journey.spine * (1 - smooth(.61, .67, progress))
      const spineOffset = -12 * (1 - emergence) + 10 * smooth(.60, .67, progress)
      spineAssembly.group.position.y = spineOffset
      core.position.y = spineOffset
      matter.visible = spineWeight > .001
      spineAssembly.update(progress, journey.core * spineWeight, emergence)
      const deviceWeight = smooth(.60, .69, progress) * (1 - smooth(.79, .88, progress))
      const scaleWeight = smooth(.735, .785, progress) * (1 - smooth(.91, .985, progress))
      chamber.visible = deviceWeight > .001
      scaleWall.visible = scaleWeight > .001
      metal.opacity = scaleWeight
      silver.opacity = deviceWeight
      chainsMaterial.opacity = deviceWeight * .60
      pointerStrength.value = pointer && Number.isFinite(pointer.strength)
        ? THREE.MathUtils.clamp(pointer.strength, 0, 1) : 0
      if (pointer && Number.isFinite(pointer.ndc.x) && Number.isFinite(pointer.ndc.y)) {
        pointerNdc.value.copy(pointer.ndc)
      } else {
        pointerStrength.value = 0
      }
      pointerAspect.value = pointer && Number.isFinite(pointer.aspect)
        ? Math.max(.25, Math.min(5, pointer.aspect)) : 1
      surfaceTime.value = time
      coreMaterial.uniforms.uTime.value = time
      coreMaterial.uniforms.uScroll.value = progress * 55
      coreMaterial.uniforms.uWeights.value.set(1, 0, 0)
      coreMaterial.uniforms.uOpacity.value = journey.core * spineWeight * .48
      machineCore.material.uniforms.uTime.value = time
      machineCore.material.uniforms.uOpacity.value = deviceWeight * .96
      scaleCore.material.uniforms.uTime.value = time
      scaleCore.material.uniforms.uOpacity.value = scaleWeight * .40

      const architectureWeight = smooth(.60, .69, progress) * (1 - journey.darkness * .77)
        * (1 - journey.scales * .35) * (1 - smooth(.86, .94, progress) * .85)
      space.visible = architectureWeight > .001
      architecture.opacity = architectureWeight
      // The underside remains legible as a ceiling after the camera crosses it.
      floorMaterial.opacity = smooth(.60, .68, progress) * (1 - smooth(.87, .95, progress)) * .97
      floor.visible = floorMaterial.opacity > .001
      slabMaterial.opacity = floorMaterial.opacity
      slab.visible = floor.visible
      causticMaterial.uniforms.uTime.value = time
      causticMaterial.uniforms.uOpacity.value = scaleWeight * .38
      caustics.visible = scaleWeight > .001
      reflectionTime.value = time
      reflectionOpacity.value = architectureWeight * .68
      let aboveFloor = journey.height > floorHeight
      let coreProximity = 0
      if (camera) {
        camera.updateMatrixWorld()
        aboveFloor = camera.getWorldPosition(cameraWorld).y > floorHeight + .03
        if (pointerStrength.value > 0) {
          projectedCore.set(0, chamberHeight, 0).project(camera)
          if (projectedCore.z > -1 && projectedCore.z < 1) {
            const dx = (projectedCore.x - pointerNdc.value.x) * pointerAspect.value
            const dy = projectedCore.y - pointerNdc.value.y
            coreProximity = Math.exp(-(dx * dx + dy * dy) * 16) * pointerStrength.value
          }
        }
      }
      if (floorReflection) floorReflection.visible = architectureWeight > .1 && aboveFloor
      dark.opacity = deviceWeight
      machineMetal.opacity = deviceWeight
      glow.opacity = deviceWeight * (.24 + coreProximity * .08)
      if (deviceWeight > .01) {
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
      reactorLight.intensity = software ? 0 : deviceWeight * (7 + Math.sin(time * 1.5) * .8 + coreProximity * 2.5)
      monitorAssembly.update(time, progress, pointer, camera)
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
