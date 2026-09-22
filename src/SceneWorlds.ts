import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createSpineAssembly } from './SceneSpine'
import { createSceneMonitors } from './SceneMonitors'
import { createSceneRuins } from './SceneRuins'
import { createWaterSurface } from './SceneWater'
import type { createSceneVideo } from './SceneVideo'
import { sampleJourney, smooth } from './Journey'
import { sampleLayers } from './SceneLayers'
import { bindGroupCurtain, createCurtainBounds } from './SceneCurtains'
import { curtainHasCoverage } from './SceneVisibility'
import { lightChoreographyGLSL, sampleLightChoreography, type LightFilmUniforms } from './SceneLighting'

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

/** Descending articulated matter inside an independently anchored shaft. */
export function createSceneWorlds(
  scene: THREE.Scene, software: boolean, mobile = false,
  externalMedia?: ReturnType<typeof createSceneVideo>, lightFilm?: LightFilmUniforms,
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
  const lightDepth = { value: 0 }
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
    color: 0x929197, metalness: software ? .45 : .96, roughness: .24, envMapIntensity: 1.25, transparent: true,
  }))
  const dark = mat(new THREE.MeshStandardMaterial({
    color: 0x19191d, metalness: software ? .35 : .86, roughness: .38, envMapIntensity: .95, transparent: true,
  }))
  const machineMetal = mat(new THREE.MeshStandardMaterial({
    color: 0x56535a, metalness: software ? .4 : .94, roughness: .32, envMapIntensity: 1.05, transparent: true,
  }))
  const cableMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x242326, metalness: software ? .3 : .76, roughness: .43, envMapIntensity: .9, transparent: true,
  }))
  // Broad oxidation and fine machining break the uniform teal wash. Coordinates
  // are shared in world space, so adjacent collars retain different highlights
  // without a texture, extra pass, or animated surface drift.
  for (const surface of [silver, dark, machineMetal, cableMaterial]) {
    if (lightFilm) surface.defines = { ...surface.defines, AETHER_LIGHT_FILM: 1 }
    surface.onBeforeCompile = shader => {
      shader.uniforms.uMachineTime = surfaceTime
      shader.uniforms.uMachineDepth = lightDepth
      if (lightFilm) {
        shader.uniforms.uLightFilm = lightFilm.map
        shader.uniforms.uLightFilmReady = lightFilm.ready
      }
      shader.vertexShader = 'varying vec3 vMachinePoint;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 machinePoint = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          machinePoint = instanceMatrix * machinePoint;
        #endif
        vMachinePoint = (modelMatrix * machinePoint).xyz;
      `)
      shader.fragmentShader = `
        uniform float uMachineTime;
        uniform float uMachineDepth;
        ${lightChoreographyGLSL}
        varying vec3 vMachinePoint;
        float machinePatina(vec3 p) {
          return .5 + .5 * sin(p.x * 2.7 + sin(p.z * 4.1))
            * sin(p.y * 5.8 + p.z * 1.9);
        }
      ` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        vec3 projectedLight = aetherLightCloud(vMachinePoint, vec3(0., .6, .8), uMachineTime, uMachineDepth);
        totalEmissiveRadiance += projectedLight * .055;
      `)
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float patina = machinePatina(vMachinePoint);
        diffuseColor.rgb *= mix(vec3(.48, .49, .55), vec3(1.0, .96, .88), patina);
      `)
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (1. - machinePatina(vMachinePoint)) * .17
          - .055 * sin(vMachinePoint.y * 39. + vMachinePoint.x * 7.), .18, .62);
      `)
      if (!software) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        float fineFade = 1. - smoothstep(.012, .065, length(fwidth(vMachinePoint)));
        float relief = sin(vMachinePoint.y * 147. + sin(vMachinePoint.x * 29.) * .7)
          * .00075 * fineFade;
        relief += sin(vMachinePoint.x * 27. + vMachinePoint.z * 31.)
          * sin(vMachinePoint.y * 43. - vMachinePoint.z * 19.) * .00115;
        vec3 machineDx = dFdx(-vViewPosition), machineDy = dFdy(-vViewPosition);
        vec3 machineR1 = cross(machineDy, normal), machineR2 = cross(normal, machineDx);
        float machineDet = dot(machineDx, machineR1);
        vec3 machineGradient = sign(machineDet)
          * (dFdx(relief) * machineR1 + dFdy(relief) * machineR2);
        normal = normalize(max(abs(machineDet), .00000001) * normal - machineGradient);
      `)
    }
    surface.customProgramCacheKey = () => `aether-machined-steel-${software ? 'lite' : 'detailed'}-v1`
  }
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
  // A broad, bevelled annular cross-section reads as stamped metal flanges,
  // unlike round torus tubes that resemble stacked rubber tyres.
  const collarProfile = [
    [.84, -.022], [.98, -.022], [1.0, -.009], [1.0, .010],
    [.98, .023], [.84, .023], [.825, .009], [.825, -.009], [.84, -.022],
  ].map(([radius, y]) => new THREE.Vector2(radius, y))
  const joints = instanced(chamber,
    geo(new THREE.LatheGeometry(collarProfile, software ? 28 : 64)), silver,
    software ? 6 : 10, false)
  joints.name = 'aether-machine-collars'
  for (let i = 0; i < joints.count; i++) {
    const half = joints.count / 2
    const lower = i < half
    const layer = i % half
    dummy.position.set(0, lower ? -2.38 - layer * .12 : 2.10 + layer * .18, 0)
    dummy.rotation.set(0, layer * .12, 0)
    dummy.scale.setScalar((lower ? 1.73 : 1.81) + layer * .045)
    dummy.updateMatrix()
    joints.setMatrixAt(i, dummy.matrix)
    joints.setColorAt(i, color.setScalar(.74 + (i % 3) * .13))
  }

  // Scale highlights only. Atmosphere owns the single masked spine current
  // that gathers into the machine O; no duplicate spine or reactor cloud.
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
  const platformWidth = 22
  const platformDepth = 26
  const platformZ = -1.5 // Back -14.5, front +11.5: one bed continues under the camera.
  const floorGeometry = geo(new THREE.PlaneGeometry(platformWidth, platformDepth, 22, 24))
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
    depthWrite: false,
  }))
  const slab = mesh(space, geo(new THREE.BoxGeometry(platformWidth, .34, platformDepth)),
    slabMaterial, 0, -3.87, platformZ)
  slab.name = 'aether-floor-edge'
  // Retain the single 512px target; the water shader adds no scene capture.
  const floorReflection = !software && !mobile ? new Reflector(geo(new THREE.PlaneGeometry(platformWidth, platformDepth)), {
    textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .004, color: 0x52676d,
  }) : null
  const water = createWaterSurface(floorReflection, platformWidth, platformDepth)
  water.surface.position.set(0, -3.635, platformZ)
  water.surface.rotation.x = -Math.PI / 2
  space.add(water.surface)
  // Unlike the translucent wall dressing, the room ceiling seals the next
  // chamber while the incoming current is still converging behind it.
  const ceilingMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x101217, metalness: .55, roughness: .56, envMapIntensity: .55,
    side: THREE.DoubleSide, depthWrite: true,
  }))
  const ceiling = mesh(space, geo(new THREE.PlaneGeometry(64, 64)), ceilingMaterial, 0, 5.8, platformZ)
  ceiling.name = 'aether-chamber-ceiling'
  ceiling.rotation.x = Math.PI / 2
  ceiling.renderOrder = -2
  // A separate, opaque underside keeps the device behind the lower room's
  // ceiling. Its extent covers the camera path beyond the finite flooded bed.
  const undersideMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x090d12, metalness: .43, roughness: .57, envMapIntensity: .42,
    depthWrite: true,
  }))
  const underside = mesh(space, geo(new THREE.PlaneGeometry(64, 64)), undersideMaterial, 0, -3.755, platformZ)
  underside.name = 'aether-floor-underside'
  underside.rotation.x = Math.PI / 2
  underside.renderOrder = -2
  const causticMaterial = mat(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 0 }, uLightDepth: { value: 0 },
      ...(lightFilm ? { uLightFilm: lightFilm.map, uLightFilmReady: lightFilm.ready } : {}),
    },
    defines: lightFilm ? { AETHER_LIGHT_FILM: 1 } : {},
    vertexShader: /* glsl */ `
      varying vec3 vCeilingWorld;
      varying vec2 vCeilingUv;
      void main() {
        vCeilingWorld = (modelMatrix * vec4(position, 1.)).xyz;
        vCeilingUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uLightDepth;
      varying vec3 vCeilingWorld;
      varying vec2 vCeilingUv;
      ${lightChoreographyGLSL}
      vec2 causticSeed(vec2 p) {
        vec3 h = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        h += dot(h, h.yzx + 33.33);
        return fract((h.xx + h.yz) * h.zy);
      }
      float causticNetwork(vec2 p) {
        vec2 cell = floor(p);
        vec2 local = fract(p);
        float nearest = 8.;
        float second = 8.;
        // Nine cheap hash samples form connected, unequal cells. Domain
        // warping below bends their boundaries into a fine moving light net.
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 delta = offset + .18 + causticSeed(cell + offset) * .64 - local;
            float distanceSquared = dot(delta, delta);
            second = min(second, max(nearest, distanceSquared));
            nearest = min(nearest, distanceSquared);
          }
        }
        float boundary = sqrt(second) - sqrt(nearest);
        float antialias = clamp(fwidth(boundary), .008, .075);
        return 1. - smoothstep(.018 - antialias, .062 + antialias, boundary);
      }
      void main() {
        vec2 p = vCeilingWorld.xz * 4.3;
        float t = uTime * .14;
        p += vec2(sin(p.y * .61 + t), cos(p.x * .57 - t * .8)) * .43;
        p += vec2(t * .09, -t * .07);
        float detailFade = 1. - smoothstep(.12, .48, length(fwidth(p)));
        float light = causticNetwork(p) * detailFade;
        light *= .60 + .40 * sin(p.x * .29 + p.y * .17 + t);
        float edge = 1. - smoothstep(.46, .5,
          max(abs(vCeilingUv.x - .5), abs(vCeilingUv.y - .5)));
        vec3 cloud = aetherLightCloud(vCeilingWorld, vec3(0., -1., 0.), uTime, uLightDepth);
        vec3 color = vec3(.10, .19, .21) + cloud * .16;
        // Reuse the one low-resolution film decoder. Recognizable moving
        // light masses sit over the fine caustic network, with a static fallback.
        vec3 film = aetherFilmRadiance(vCeilingWorld);
        float filmLuma = dot(film, vec3(.2126, .7152, .0722));
        color += film * .30;
        float coverage = light + smoothstep(.05, .45, filmLuma) * .48;
        gl_FragColor = vec4(color, min(1., coverage) * edge * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  // The underside of the floor becomes the next chamber's illuminated ceiling.
  const caustics = mesh(space, geo(new THREE.PlaneGeometry(platformWidth, platformDepth)),
    causticMaterial, 0, -3.770, platformZ)
  caustics.rotation.x = Math.PI / 2
  caustics.renderOrder = 1
  const ruins = createSceneRuins(space, software, mobile)
  floorMaterial.bumpMap = ruins.relief
  floorMaterial.bumpScale = .018
  floorMaterial.roughness = .42
  ceilingMaterial.bumpMap = undersideMaterial.bumpMap = ruins.relief
  ceilingMaterial.bumpScale = .014
  undersideMaterial.bumpScale = .009
  machineMetal.bumpMap = ruins.relief
  machineMetal.bumpScale = .008
  const wallGeometry = geo(new THREE.BoxGeometry(1, 1, 1))
  const architectureBars = instanced(space, wallGeometry, architecture, 28, false)
  architectureBars.name = 'aether-upper-room-structure'
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
  backWall.name = 'aether-room-back-wall'
  backWall.scale.set(16, 28, .3)
  // The old plinth bottom was -3.215, leaving a .485 gap above the -3.7 bed.
  // Keep its top and the O/assembly anchor fixed; extend only the footing.
  const plinthTop = -3.045
  const plinthBottom = floor.position.y - .03
  const plinth = mesh(chamber,
    geo(new THREE.CylinderGeometry(2.13, 2.32, plinthTop - plinthBottom, software ? 32 : 64)),
    dark, 0, (plinthTop + plinthBottom) * .5)
  plinth.name = 'aether-machine-plinth'
  const socketProfile = [[1.40, -.085], [2.05, -.085], [2.05, -.025],
    [1.89, .025], [1.82, .095], [1.40, .095], [1.40, -.085]]
    .map(([radius, y]) => new THREE.Vector2(radius, y))
  const socket = mesh(chamber,
    geo(new THREE.LatheGeometry(socketProfile, software ? 32 : 64)), machineMetal, 0, -2.89)
  socket.name = 'aether-machine-lower-socket'
  const upperProfile = [[1.59, -.07], [1.96, -.07], [1.96, .10], [1.88, .15],
    [1.88, .34], [1.61, .34], [1.61, .28], [1.80, .28], [1.80, -.01],
    [1.59, -.01], [1.59, -.07]].map(([radius, y]) => new THREE.Vector2(radius, y))
  const upperSocket = mesh(chamber,
    geo(new THREE.LatheGeometry(upperProfile, software ? 32 : 64)), machineMetal, 0, 2.85)
  upperSocket.name = 'aether-machine-upper-socket'
  // The annular socket alone leaves its entire centre open. A solid lid
  // closes it without moving the supports or the converging particle target.
  const capMaterial = mat(machineMetal.clone())
  // MeshStandardMaterial.copy resets defines; retain the shared film branch.
  capMaterial.defines = { ...machineMetal.defines }
  capMaterial.transparent = false
  capMaterial.depthWrite = true
  capMaterial.opacity = 1
  capMaterial.onBeforeCompile = machineMetal.onBeforeCompile
  capMaterial.customProgramCacheKey = machineMetal.customProgramCacheKey
  const closedCap = mesh(chamber,
    geo(new THREE.CylinderGeometry(1.93, 1.93, .26, software ? 32 : 64)), capMaterial, 0, 3.15)
  closedCap.name = 'aether-machine-closed-cap'
  closedCap.renderOrder = -1
  const bolts = instanced(chamber, geo(new THREE.CylinderGeometry(.037, .041, .055, 6)), silver,
    software ? 32 : 64, false)
  bolts.name = 'aether-machine-fasteners'
  for (let i = 0; i < bolts.count; i++) {
    const half = bolts.count / 2
    const a = (i % half) / half * TAU + .035
    const radius = i < half ? 1.98 : 1.84
    dummy.position.set(Math.sin(a) * radius, i < half ? -2.90 : 3.215, Math.cos(a) * radius)
    dummy.rotation.set(0, a, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    bolts.setMatrixAt(i, dummy.matrix)
  }
  const supportAngles = [.13, .49, 1.18, 1.47, 2.22, 2.72, 3.12, 3.79, 4.06, 4.88, 5.36, 5.91]
    .filter((_, i) => !software || i % 2 === 0)
  const rods = instanced(chamber,
    geo(new THREE.CylinderGeometry(.019, .024, 1, 6)), machineMetal, supportAngles.length, false)
  rods.name = 'aether-machine-supports'
  for (let i = 0; i < rods.count; i++) {
    const angle = supportAngles[i]
    const radius = 1.72 + Math.sin(i * 2.3) * .055
    dummy.position.set(Math.sin(angle) * radius, -.015, Math.cos(angle) * radius)
    dummy.rotation.set(Math.sin(angle) * .017, angle, Math.cos(angle) * .013)
    dummy.scale.set(i % 4 === 0 ? 1.4 : 1, 5.64, 1)
    dummy.updateMatrix()
    rods.setMatrixAt(i, dummy.matrix)
  }
  const ribs = instanced(chamber, geo(new THREE.BoxGeometry(1, 1, 1)), machineMetal,
    supportAngles.length * 2 + (software ? 24 : 48), false)
  ribs.name = 'aether-machine-clamps-ribs'
  for (let i = 0; i < ribs.count; i++) {
    const isClamp = i < supportAngles.length * 2
    const index = i % supportAngles.length
    const ribIndex = i - supportAngles.length * 2
    const ribsPerBand = software ? 12 : 24
    const angle = isClamp ? supportAngles[index] : (ribIndex % ribsPerBand) / ribsPerBand * TAU
    const upper = isClamp ? i < supportAngles.length : ribIndex < ribsPerBand
    const radius = isClamp ? 1.75 : 1.91
    dummy.position.set(Math.sin(angle) * radius, isClamp ? (upper ? 1.72 : -1.89) : (upper ? 3.01 : -2.86), Math.cos(angle) * radius)
    dummy.rotation.set(0, angle, 0)
    dummy.scale.set(isClamp ? .15 : .026, isClamp ? .040 : .14, isClamp ? .10 : .06)
    dummy.updateMatrix()
    ribs.setMatrixAt(i, dummy.matrix)
    ribs.setColorAt(i, color.setScalar(isClamp ? .92 : .50))
  }
  // Different attachment heights, diameters and sag make these independent
  // heavy feeds rather than repeated decorative loops. They share one draw.
  const cableParts: THREE.BufferGeometry[] = []
  const cableCount = software ? 7 : mobile ? 10 : 14
  const polar = (angle: number, radius: number, y: number) =>
    new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius)
  for (let i = 0; i < cableCount; i++) {
    const angle = i * 2.399963 + .27
    const lean = Math.sin(i * 2.1) * .37
    const lower = i % 5 === 4
    const path = new THREE.CatmullRomCurve3(lower ? [
      polar(angle, 1.74, -2.82), polar(angle + .10, 2.12, -3.05),
      polar(angle + lean, 3.12, -3.19), polar(angle + lean * .5, 5.7, -3.35),
    ] : [
      polar(angle, 1.71, 2.87 + (i % 3) * .065),
      polar(angle + lean * .3, 2.20, 1.98 + Math.sin(i * 1.3) * .3),
      polar(angle + lean, 3.15, 1.45 + Math.cos(i * 1.9) * .72),
      polar(angle - lean * .25, 4.45, 2.43 + Math.sin(i * 1.7) * .85),
      polar(angle - lean * .6, 6.35, 5.35 + Math.cos(i * 1.5)),
    ])
    cableParts.push(new THREE.TubeGeometry(path, software ? 18 : 38,
      i % 4 === 0 ? .065 : .021 + (i % 3) * .009, software ? 5 : 7, false))
  }
  const mergedCables = mergeGeometries(cableParts)
  cableParts.forEach(part => part.dispose())
  if (!mergedCables) throw new Error('Unable to build machine cable feeds')
  const cables = mesh(chamber, geo(mergedCables), cableMaterial)
  cables.name = 'aether-machine-cable-feeds'
  const luminousRings = instanced(chamber,
    geo(new THREE.TorusGeometry(1, .005, 4, software ? 36 : 80)), glow, 4, false)
  for (let i = 0; i < luminousRings.count; i++) {
    dummy.position.set(0, i < 2 ? -2.40 - i * .24 : 2.13 + (i - 2) * .36, 0)
    dummy.rotation.set(Math.PI / 2, 0, 0)
    dummy.scale.setScalar(1.77 + (i % 2) * .1)
    dummy.updateMatrix()
    luminousRings.setMatrixAt(i, dummy.matrix)
  }
  const reactorLight = new THREE.PointLight(0xc4bdd2, 0, 10, 2)
  // Keep the light count stable as the chamber appears. Hiding a light's
  // parent recompiles EVERY lit material with a different NUM_POINT_LIGHTS.
  reactorLight.position.set(0, -40.4 - .8, 1.1)
  scene.add(reactorLight)

  const chamberWorld = new THREE.Vector3()
  const cameraWorld = new THREE.Vector3()
  const projectedCore = new THREE.Vector3()
  const chamberHeight = -40.4
  const floorHeight = chamberHeight - 3.7
  monitorAssembly.setOccluders([matter, chamber])
  const scaleHeight = -48.0
  // Whole assemblies share a viewport edge. The surfaces remain real 3D,
  // while the outgoing scene reads as a single flat, frayed wrapper.
  const deviceCurtain = createCurtainBounds(-.25)
  const scaleCurtain = createCurtainBounds()
  bindGroupCurtain(chamber, deviceCurtain)
  bindGroupCurtain(space, deviceCurtain)
  bindGroupCurtain(scaleWall, scaleCurtain)
  return {
    getChamberHeight() {
      return space.getWorldPosition(chamberWorld).y
    },
    prepare(renderer: THREE.WebGLRenderer) {
      monitorAssembly.prepare(renderer)
      if (floorReflection) renderer.initRenderTarget(floorReflection.getRenderTarget())
    },
    capture(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scheduled = true) {
      // The monitor's low-resolution refraction must not recursively render
      // another complete floor reflection during the chamber overlap.
      const reflected = floorReflection?.visible
      if (floorReflection) floorReflection.visible = false
      try {
        monitorAssembly.capture(renderer, scene, camera, scheduled, Boolean(reflected && space.visible))
      } finally {
        if (floorReflection) floorReflection.visible = reflected ?? false
      }
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
      const layers = sampleLayers(progress)
      deviceCurtain.upper.value = layers.monitorExit
      deviceCurtain.lower.value = scaleCurtain.lower.value = layers.forestEntry
      // Only a globally empty curtain can hide a whole room. Main-camera
      // frustum culling here would incorrectly remove reflected geometry.
      const deviceCoverage = curtainHasCoverage(layers.monitorExit, layers.forestEntry)
      lightDepth.value = journey.darkness
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
      const spineWeight = smooth(.20, .29, progress) * (1 - smooth(.685, .705, progress))
      const spineOffset = -12 * (1 - emergence) + 10 * smooth(.60, .67, progress)
      spineAssembly.group.position.y = spineOffset
      matter.visible = spineWeight > .001
      spineAssembly.update(progress, journey.core * spineWeight, emergence)
      const deviceWeight = smooth(.59, .615, progress) * (1 - smooth(.79, .88, progress))
      const scaleWeight = smooth(.725, .75, progress) * (1 - smooth(.93, .95, progress))
      chamber.visible = deviceWeight > .001
      scaleWall.visible = scaleWeight > .001
      metal.opacity = scaleWeight
      silver.opacity = deviceWeight
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
      scaleCore.material.uniforms.uTime.value = time
      scaleCore.material.uniforms.uOpacity.value = scaleWeight * .40

      const architectureWeight = smooth(.59, .615, progress) * (1 - journey.darkness * .77)
        * (1 - journey.scales * .35) * (1 - smooth(.86, .94, progress) * .85)
      space.visible = architectureWeight > .001 && deviceCoverage
      architecture.opacity = architectureWeight
      // The underside remains legible as a ceiling after the camera crosses it.
      floorMaterial.opacity = smooth(.60, .68, progress) * (1 - smooth(.87, .95, progress)) * .97
      floor.visible = floorMaterial.opacity > .001
      causticMaterial.uniforms.uTime.value = time
      causticMaterial.uniforms.uOpacity.value = scaleWeight * .19
      causticMaterial.uniforms.uLightDepth.value = sampleLightChoreography(time, progress).depth
      caustics.visible = scaleWeight > .001
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
      // A camera passing through the solid .34m slab otherwise sees its near
      // side as a screen-filling bar. Only its thickness dissolves near the eye;
      // the zero-thickness floor skin and the lower ceiling light stay intact.
      const eyeHeight = camera ? cameraWorld.y : journey.height
      const inLowerRoom = eyeHeight <= floorHeight - .03
      // Once the eye enters the lower room, no upper-floor device can remain
      // visible through a near-plane gap or beyond a screen-diagonal seam.
      chamber.visible = deviceWeight > .001 && !inLowerRoom && deviceCoverage
      // Broken banks and long upper-room supports cross below the bed in world
      // space. A ceiling cannot occlude those protruding bottoms from below.
      // Keep only the plain back wall as the lower room's distant enclosure.
      ruins.update(inLowerRoom ? 0 : architectureWeight)
      architectureBars.visible = !inLowerRoom
      underside.visible = scaleWeight > .001 && eyeHeight < floorHeight
      const slabDistance = Math.abs(eyeHeight - (floorHeight - .17))
      slabMaterial.opacity = floorMaterial.opacity * smooth(.55, 1.10, slabDistance)
      slab.visible = aboveFloor && floor.visible && slabMaterial.opacity > .015
      // The extended bed now reaches behind the camera. Its grazing near-plane
      // projection would otherwise cover half the viewport at the crossing.
      floorMaterial.opacity *= smooth(.07, .55, Math.abs(eyeHeight - floorHeight))
      floorMaterial.depthWrite = floorMaterial.opacity > .94
      floor.visible = floorMaterial.opacity > .015
      water.update(time, progress, architectureWeight, aboveFloor, camera,
        { upper: layers.monitorExit, lower: layers.forestEntry })
      dark.opacity = deviceWeight
      machineMetal.opacity = deviceWeight
      cableMaterial.opacity = deviceWeight
      glow.opacity = deviceWeight * (.12 + coreProximity * .045)
      const light = sampleLightChoreography(time, progress)
      reactorLight.color.setHSL(light.rimHue, .34, .73)
      reactorLight.intensity = software ? 0 : deviceWeight * (4.3 * light.rimIntensity + coreProximity * 1.7)
      monitorAssembly.update(time, progress, pointer, camera)
    },
    dispose() {
      ruins.dispose()
      spineAssembly.dispose()
      monitorAssembly.dispose()
      water.dispose()
      scene.remove(root)
      scene.remove(reactorLight)
      floorReflection?.dispose()
      instances.forEach((item) => item.dispose())
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
      textures.forEach((item) => item.dispose())
    },
  }
}
