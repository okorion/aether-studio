import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createSpineAssembly } from './SceneSpine'
import { createScaleSurface } from './SceneScaleSurface'
import { createScaleBubbles } from './SceneScaleBubbles'
import { createSceneMonitors } from './SceneMonitors'
import { createSceneRuins } from './SceneRuins'
import { createWaterSurface } from './SceneWater'
import type { createSceneVideo } from './SceneVideo'
import { sampleJourney, smooth } from './Journey'
import { sampleLayers } from './SceneLayers'
import { bindGroupCurtain, createCurtainBounds } from './SceneCurtains'
import { curtainHasCoverage } from './SceneVisibility'
import { lightChoreographyGLSL, sampleLightChoreography, type LightFilmUniforms } from './SceneLighting'
import { REACTOR } from './Reactor'
import { createChamberLight, excludeChamberSpotlight } from './SceneChamberLight'

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
  scaleArtwork?: LightFilmUniforms,
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
  const lowerSpace = new THREE.Group()
  chamber.scale.y = space.scale.y = lowerSpace.scale.y = REACTOR.heightScale
  matter.name = 'aether-matter'
  chamber.name = 'aether-machine-assembly'
  scaleWall.name = 'aether-scale-wall'
  space.name = 'aether-chamber-space'
  lowerSpace.name = 'aether-lower-room-space'
  root.add(matter, monitors, chamber, scaleWall, space, lowerSpace)
  scene.add(root)
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const pointerNdc = { value: new THREE.Vector2() }
  const pointerStrength = { value: 0 }
  const pointerAspect = { value: 1 }
  const surfaceTime = { value: 0 }
  const surfaceExtent = { value: 1 }
  const pointerWaveOrigin = { value: new THREE.Vector2() }
  const pointerWaveAge = { value: -1 }
  const pointerWaveStrength = { value: 0 }
  const pointerWaves = { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }
  const pointerWaveStarts = new Float64Array(8).fill(-Infinity)
  let pointerWaveSlot = 0
  let scalePointerActive = false
  let pointerWaveStart = -Infinity
  const lightDepth = { value: 0 }
  const neutralFlow = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1)
  neutralFlow.needsUpdate = true
  textures.push(neutralFlow)
  const pointerFlow = { value: neutralFlow as THREE.Texture }
  const metal = mat(createScaleSurface(software,
    { pointerNdc, pointerStrength, pointerAspect, pointerFlow, surfaceTime, surfaceExtent,
      pointerWaves, lightDepth }, lightFilm, scaleArtwork))
  const silver = mat(new THREE.MeshStandardMaterial({
    color: 0x72777f, metalness: software ? .45 : .96, roughness: .28, envMapIntensity: .68, transparent: true,
  }))
  const dark = mat(new THREE.MeshStandardMaterial({
    color: 0x19191d, metalness: software ? .35 : .86, roughness: .38, envMapIntensity: .60, transparent: true,
  }))
  const machineMetal = mat(new THREE.MeshStandardMaterial({
    color: 0x454b55, metalness: software ? .4 : .94, roughness: .33, envMapIntensity: .60, transparent: true,
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
        float belowAperture = ${REACTOR.worldY + REACTOR.apertureY * REACTOR.heightScale} - vMachinePoint.y;
        float coneRadius = ${REACTOR.apertureRadius} + max(0., belowAperture) * .20;
        float aperturePool = (1. - smoothstep(coneRadius * .6, coneRadius, length(vMachinePoint.xz)))
          * step(0., belowAperture);
        // A faint local bounce only. Metal must retain dark intervals rather
        // than becoming an emissive light source across the whole socket.
        totalEmissiveRadiance += projectedLight * aperturePool * .018;
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
    surface.customProgramCacheKey = () => `aether-machined-steel-${software ? 'lite' : 'detailed'}-v2`
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

  const wallColumns = software ? 24 : mobile ? 34 : 44
  const originalRows = software ? 14 : mobile ? 20 : 25
  const wallRows = originalRows
  const count = wallColumns * wallRows
  const tileHeight = 5.4 / ((originalRows - 1) * .75 + 1)
  const tileWidth = tileHeight * Math.sqrt(3) / 2
  const feathers = instanced(scaleWall, geo(scaleGeometry(software)), metal, count, false)
  feathers.name = 'aether-scale-tiles'
  const bubbles = createScaleBubbles(software, mobile)
  scaleWall.add(bubbles.points)
  geo(bubbles.geometry)
  mat(bubbles.material)
  const bronze = new THREE.Color().setRGB(.45, .40, .29)
  const teal = new THREE.Color().setRGB(.13, .32, .29)
  const violet = new THREE.Color().setRGB(.36, .18, .41)
  for (let i = 0; i < count; i++) {
    const wallRow = Math.floor(i / wallColumns)
    const wallX = ((i % wallColumns) - (wallColumns - 1) * .5 + ((wallRow % 2) - .5) * .5) * tileWidth
    const wallY = (wallRow - (wallRows - 1) * .5) * tileHeight * .75
    surfaceExtent.value = Math.max(surfaceExtent.value, Math.hypot(wallX, wallY))
    dummy.position.set(wallX, wallY, -.65)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.setScalar(tileHeight * .965)
    dummy.updateMatrix()
    feathers.setMatrixAt(i, dummy.matrix)
    const tealWeight = Math.exp(-((wallX - 1.1) ** 2 * .19 + (wallY - .7) ** 2 * .32)) * .85
    const violetWeight = Math.exp(-((wallX + 3.5) ** 2 * .16 + (wallY + .5) ** 2 * .20)) * .28
      + Math.exp(-((wallX - 4.5) ** 2 * .38 + wallY * wallY * .18)) * .60
    color.copy(bronze).lerp(teal, tealWeight).lerp(violet, Math.min(.8, violetWeight))
    color.multiplyScalar(.88 + Math.sin(wallX * .7 + wallY * .93) * .12)
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

  // The chamber architecture stays anchored independently of the travelling bone.
  const architecture = mat(new THREE.MeshStandardMaterial({
    color: 0x0a171b, metalness: .7, roughness: .37, envMapIntensity: .75, transparent: true,
    depthWrite: false,
  }))
  const floorMaterial = mat(architecture.clone())
  // The lower room owns the underside. Drawing this upper floor's back face
  // puts a blurred reflection over the outgoing reactor above the shared edge.
  floorMaterial.side = THREE.FrontSide
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
  const water = createWaterSurface(floorReflection, platformWidth, platformDepth, lightFilm)
  water.surface.position.set(0, -3.635, platformZ)
  water.surface.rotation.x = -Math.PI / 2
  space.add(water.surface)
  // Preserve the authored contact plane as a non-rendering reference.
  // The compact machine lid still touches its underside.
  const capThickness = REACTOR.capThickness
  const capCentreY = REACTOR.apertureY
  const ceilingY = capCentreY + capThickness * .5
  const ceilingThickness = .18
  const ceilingMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x101217, metalness: .55, roughness: .56, envMapIntensity: .55,
    side: THREE.DoubleSide, depthWrite: true,
  }))
  const ceiling = mesh(space, geo(new THREE.BoxGeometry(64, ceilingThickness, 64)),
    ceilingMaterial, 0, ceilingY + ceilingThickness * .5, platformZ)
  ceiling.name = 'aether-chamber-ceiling'
  ceiling.renderOrder = -2
  // Keep the contact reference, but reveal the chamber through the wrapper.
  // Its annular machine cap provides the particle aperture.
  ceiling.visible = false
  // A separate annulus closes the room without filling the shared aperture.
  const roof = mesh(space, geo(new THREE.RingGeometry(REACTOR.apertureRadius, 46, 96)),
    mat(new THREE.MeshStandardMaterial({ color: 0x101217, metalness: .55, roughness: .56, envMapIntensity: .55, side: THREE.BackSide })), 0, ceilingY, 0)
  roof.name = 'aether-chamber-aperture-roof'
  roof.rotation.x = -Math.PI / 2
  const chamberLight = createChamberLight(space, scene, lightFilm)
  // The scale room owns its ceiling and light, on the incoming side of
  // the same screen edge that clips every upper-room object.
  const ceilingCoverageGLSL = /* glsl */ `
    float ceilingHorizonCoverage(vec3 viewPosition, vec3 viewNormal) {
      vec3 normal = normalize(viewNormal);
      float distanceCoverage = 1. - smoothstep(48., 76., length(viewPosition));
      float facing = abs(dot(normal, normalize(viewPosition)));
      float nearby = 1. - smoothstep(1., 3., abs(dot(normal, viewPosition)));
      return distanceCoverage * mix(1., smoothstep(.015, .12, facing), nearby);
    }
  `
  const undersideMaterial = mat(new THREE.MeshStandardMaterial({
    color: 0x090d12, metalness: .43, roughness: .57, envMapIntensity: .42,
    transparent: true, depthWrite: true,
  }))
  // A finite ceiling edge previously crossed the scale room as a hard screen
  // line. Extend beyond the useful view distance, then fade before either the
  // geometry boundary or camera far clip. Nearby ceiling still occludes fully.
  // Immediately below the floor, distance alone collapses into a few screen
  // pixels. An angular fade softens that horizon without changing the ceiling
  // once the camera has descended three world units into the scale room.
  undersideMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = ceilingCoverageGLSL + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float ceilingCoverage = ceilingHorizonCoverage(vViewPosition, vNormal);
      if (ceilingCoverage < .001) discard;
      diffuseColor.a *= ceilingCoverage;
      #include <opaque_fragment>
    `)
  }
  undersideMaterial.customProgramCacheKey = () => 'aether-ceiling-distance-coverage-v2'
  const undersideGeometry = geo(new THREE.PlaneGeometry(192, 192))
  // Keep the shared relief's world-space scale and centre phase unchanged.
  const undersideUv = undersideGeometry.getAttribute('uv')
  for (let i = 0; i < undersideUv.count; i++) {
    undersideUv.setXY(i, (undersideUv.getX(i) - .5) * 3 + .5,
      (undersideUv.getY(i) - .5) * 3 + .5)
  }
  const underside = mesh(lowerSpace, undersideGeometry, undersideMaterial, 0, -3.755, platformZ)
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
      varying vec3 vCeilingView;
      varying vec3 vCeilingNormal;
      varying vec2 vCeilingUv;
      void main() {
        vCeilingWorld = (modelMatrix * vec4(position, 1.)).xyz;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.);
        vCeilingView = -viewPosition.xyz;
        vCeilingNormal = normalMatrix * normal;
        vCeilingUv = uv;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uLightDepth;
      varying vec3 vCeilingWorld;
      varying vec3 vCeilingView;
      varying vec3 vCeilingNormal;
      varying vec2 vCeilingUv;
      ${lightChoreographyGLSL}
      ${ceilingCoverageGLSL}
      float causticGrain(vec2 p) {
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1.,0.),vec2(127.1,311.7)),
          dot(i+vec2(0.,1.),vec2(127.1,311.7)),dot(i+1.,vec2(127.1,311.7))))*43758.5453);
        return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
      }
      float causticNetwork(vec2 p) {
        // Smooth interfering waves form curved, unequal caustic folds. There
        // are no polygon cells or straight Voronoi borders in this surface.
        float t=uTime*.22;
        vec2 q=p+vec2(sin(p.y*1.37-t),cos(p.x*.93+t*.7))*.85;
        q+=vec2(sin(p.x*.47+p.y*.72+t*.3),sin(p.y*.63-p.x*.38))*.6;
        q+=vec2(sin(q.y*4.2+sin(q.x*2.7)),cos(q.x*3.4+sin(q.y*2.1)))*.085;
        float fold=sin(q.x+sin(q.y*.79)*1.2)+sin(q.y+cos(q.x*.71)*1.1);
        float width=.035+causticGrain(p*2.7)*.08+fwidth(fold)*.7;
        float filigree=.40+.40*causticGrain(p*27.)+.20*causticGrain(p*83.);
        return (pow(width/(width+abs(fold)),2.1)+.13/(1.+fold*fold*4.))*filigree;
      }
      void main() {
        vec2 p = vCeilingWorld.xz * 1.55;
        float t = uTime * .14;
        p += vec2(sin(p.y * .61 + t), cos(p.x * .57 - t * .8)) * .43;
        p += vec2(t * .09, -t * .07);
        float detailFade = 1. - smoothstep(.12, .48, length(fwidth(p)));
        float light = (causticNetwork(p) + causticNetwork(p*1.73+vec2(8.3,2.7))*.30) * detailFade;
        light *= .78 + .22 * sin(p.x * .29 + p.y * .17 + t);
        float edge = 1. - smoothstep(.46, .5,
          max(abs(vCeilingUv.x - .5), abs(vCeilingUv.y - .5)));
        vec3 cloud = aetherLightCloud(vCeilingWorld, vec3(0., -1., 0.), uTime, uLightDepth);
        vec3 color = vec3(.38, .61, .54) + cloud * .12;
        // Reuse the one low-resolution film decoder. Recognizable moving
        // light masses sit over the fine caustic network, with a static fallback.
        vec3 film = aetherFilmRadiance(vCeilingWorld);
        float filmLuma = dot(film, vec3(.2126, .7152, .0722));
        color *= .8 + filmLuma * .65;
        color = mix(color, color*(vec3(.5)+film*2.4), .35);
        float coverage = .035 + light;
        float horizon = ceilingHorizonCoverage(vCeilingView, vCeilingNormal);
        gl_FragColor = vec4(color, min(1., coverage) * edge * horizon * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  // The underside of the floor becomes the next chamber's illuminated ceiling.
  const caustics = mesh(lowerSpace, geo(new THREE.PlaneGeometry(platformWidth, platformDepth)),
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
  const architectureBars = instanced(space, wallGeometry, architecture, 22, false)
  architectureBars.name = 'aether-upper-room-structure'
  for (let i = 0; i < architectureBars.count; i++) {
    const upright = i < 16
    const row = upright ? Math.floor(i / 2) : i - 16
    dummy.position.set(upright ? (i % 2 === 0 ? -7.5 : 7.5) : 0,
      upright ? (ceilingY + floor.position.y) * .5 : ceilingY - .14,
      upright ? 4 - row * 2.2 : 5 - row * 3.4)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(upright ? .34 : 15, upright ? ceilingY - floor.position.y : .28, .3)
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
  // An annular lid provides a real passage for the descending grains.
  // Keep its outer contact and material while opening only the central bore.
  const capMaterial = mat(machineMetal.clone())
  // MeshStandardMaterial.copy resets defines; retain the shared film branch.
  capMaterial.defines = { ...machineMetal.defines }
  capMaterial.transparent = false
  capMaterial.depthWrite = true
  capMaterial.opacity = 1
  capMaterial.onBeforeCompile = machineMetal.onBeforeCompile
  capMaterial.customProgramCacheKey = machineMetal.customProgramCacheKey
  const apertureCap = mesh(chamber,
    geo(new THREE.LatheGeometry([
      [REACTOR.apertureRadius, -capThickness / 2], [REACTOR.capRadius, -capThickness / 2],
      [REACTOR.capRadius, capThickness / 2], [REACTOR.apertureRadius, capThickness / 2],
      [REACTOR.apertureRadius, -capThickness / 2],
    ].map(([r, y]) => new THREE.Vector2(r, y)), software ? 32 : 64)), capMaterial, 0, capCentreY)
  apertureCap.name = 'aether-machine-aperture'
  apertureCap.renderOrder = -1
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
      polar(angle - lean * .25, 4.45, 2.38 + Math.sin(i * 1.7) * .30),
      polar(angle - lean * .6, 6.35, ceilingY),
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
  const chamberHeight = REACTOR.worldY
  const floorHeight = chamberHeight - 3.7 * REACTOR.heightScale
  monitorAssembly.setOccluders([matter, chamber])
  const scaleHeight = -48.0
  // Whole assemblies share a viewport edge. The surfaces remain real 3D,
  // while the outgoing scene reads as a single flat, frayed wrapper.
  const deviceCurtain = createCurtainBounds(-.25)
  const scaleCurtain = createCurtainBounds()
  const boneCurtain = createCurtainBounds()
  bindGroupCurtain(matter, boneCurtain)
  // Attenuate only chamber materials. Global lights also illuminate the
  // incoming scale panels while both rooms share the viewport.
  const chamberMaterials = new Set<THREE.MeshStandardMaterial>()
  for (const room of [chamber, space]) room.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) chamberMaterials.add(material)
    }
  })
  for (const material of chamberMaterials) {
    const fixtureMetal = material === silver || material === dark
      || material === machineMetal || material === capMaterial
    material.emissiveIntensity = 0
    const previous = material.onBeforeCompile
    const previousKey = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer)
      // The shared film modulates light passing through the aperture. This is
      // projected radiance, not a glowing texture painted on every surface.
      if (lightFilm) {
        shader.uniforms.uChamberFilm = lightFilm.map
        shader.uniforms.uChamberFilmReady = lightFilm.ready
      }
      shader.vertexShader = 'varying vec3 vChamberWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec4 chamberPoint=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          chamberPoint=instanceMatrix*chamberPoint;
        #endif
        vChamberWorld=(modelMatrix*chamberPoint).xyz;
        #include <project_vertex>
      `)
      shader.fragmentShader = `
        varying vec3 vChamberWorld;
        ${lightFilm ? 'uniform sampler2D uChamberFilm; uniform float uChamberFilmReady;' : ''}
        vec3 apertureRadiance() {
          vec2 uv=clamp(.5+vChamberWorld.xz*.035,.002,.998);
          vec3 radiance=vec3(.48,.60,.72);
          ${lightFilm ? `if(uChamberFilmReady>.5) {
            vec3 encoded=texture2D(uChamberFilm,uv).rgb;
            radiance=mix(encoded/12.92,pow((encoded+.055)/1.055,vec3(2.4)),step(vec3(.04045),encoded));
          }` : ''}
          // Lift the broad pool while compressing hot video highlights.
          return vec3(.24)+radiance/(vec3(1.)+radiance*.8)*18.;
        }
      ` + shader.fragmentShader
      let direct = THREE.ShaderChunk.lights_fragment_begin
      for (const light of ['Point', 'Directional']) {
        const call = `get${light}LightInfo( ${light.toLowerCase()}Light, geometryPosition, directLight );`
        // Directional lights do not receive geometryPosition in Three's chunk.
        const actual = light === 'Directional' ? 'getDirectionalLightInfo( directionalLight, directLight );' : call
        direct = direct.replace(actual, `${actual} directLight.color = vec3(0.);`)
      }
      direct = direct.replace('getSpotLightInfo( spotLight, geometryPosition, directLight );',
        // The broad room projection has a high radiance gain to reach stone.
        // Applying it unchanged to nearly metallic horizontal collars clips
        // them to white and blooms across the rods. Keep the room light while
        // calibrating its reflected contribution only on the reactor hardware.
        `getSpotLightInfo( spotLight, geometryPosition, directLight );
          directLight.color *= apertureRadiance() * ${fixtureMetal ? '.14' : '1.'};`)
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', direct)
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
        `outgoingLight = reflectedLight.directDiffuse + reflectedLight.directSpecular
          + reflectedLight.indirectSpecular * min(vec3(.90), apertureRadiance() * .065)
          + reflectedLight.indirectDiffuse * .30
          + apertureRadiance() * ${fixtureMetal ? '.0035' : '.0045'}
            * (.18 + .82 * max(0.,dot(normal,normalize(vec3(-.4,.8,.5)))))
          + totalEmissiveRadiance;
        #include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => `${previousKey}-world-film-${lightFilm ? 'film' : 'static'}-${fixtureMetal ? 'steel' : 'room'}-v6`
  }
  bindGroupCurtain(chamber, deviceCurtain)
  bindGroupCurtain(space, deviceCurtain)
  excludeChamberSpotlight(metal)
  excludeChamberSpotlight(undersideMaterial)
  bindGroupCurtain(scaleWall, scaleCurtain)
  bindGroupCurtain(lowerSpace, scaleCurtain)
  return {
    getScaleWaveState() {
      return { origin: pointerWaveOrigin.value.clone(), age: pointerWaveAge.value,
        strength: pointerWaveStrength.value, waves: pointerWaves.value.map(wave => wave.toArray()) }
    },
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
      pointer?: { ndc: THREE.Vector2; rawNdc?: THREE.Vector2; strength: number; aspect: number; active?: boolean; flowTexture?: THREE.Texture }, camera?: THREE.Camera,
      scaleTime = time, mobileView = mobile) {
      const journey = sampleJourney(progress)
      const layers = sampleLayers(progress)
      deviceCurtain.upper.value = layers.monitorExit
      deviceCurtain.lower.value = layers.deviceExit
      scaleCurtain.upper.value = layers.deviceExit
      scaleCurtain.lower.value = layers.forestEntry
      boneCurtain.upper.value = layers.monitorEntry
      boneCurtain.lower.value = layers.monitorExit
      // Only a globally empty curtain can hide a whole room. Main-camera
      // frustum culling here would incorrectly remove reflected geometry.
      const deviceCoverage = curtainHasCoverage(layers.monitorExit, layers.deviceExit)
      lightDepth.value = journey.darkness
      root.position.y = journey.height
      // Root follows the travelling spine; both mechanical layers stay in world
      // space. Their separation is real even while both are visible together.
      space.position.y = lowerSpace.position.y = chamberHeight - journey.height
      chamber.position.y = chamberHeight - journey.height
      scaleWall.position.y = scaleHeight - journey.height
      matter.position.y = 0
      matter.rotation.y = journey.structureYaw
      scaleWall.rotation.y = 0
      const emergence = smooth(.205, .29, progress)
      const spineWeight = smooth(.20, .29, progress) * (1 - smooth(.685, .705, progress))
      const spineOffset = -12 * (1 - emergence)
      spineAssembly.group.position.y = spineOffset
      matter.visible = spineWeight > .001 && curtainHasCoverage(layers.monitorEntry, layers.monitorExit)
      spineAssembly.update(progress, journey.core * spineWeight, emergence, mobileView, camera)
      const deviceWeight = smooth(.59, .615, progress) * (1 - smooth(.79, .88, progress))
      const scaleWeight = smooth(.705, .735, progress) * (1 - smooth(.93, .95, progress))
      chamber.visible = deviceWeight > .001
      scaleWall.visible = scaleWeight > .001
      metal.opacity = scaleWeight
      silver.opacity = deviceWeight
      pointerStrength.value = pointer?.active && Number.isFinite(pointer.strength)
        ? THREE.MathUtils.clamp(pointer.strength, 0, 1) : 0
      const scalePointer = pointer?.rawNdc ?? pointer?.ndc
      if (scalePointer && Number.isFinite(scalePointer.x) && Number.isFinite(scalePointer.y)) {
        pointerNdc.value.copy(scalePointer)
      } else {
        pointerStrength.value = 0
      }
      pointerAspect.value = pointer && Number.isFinite(pointer.aspect)
        ? Math.max(.25, Math.min(5, pointer.aspect)) : 1
      surfaceTime.value = scaleTime
      pointerFlow.value = pointer?.flowTexture ?? neutralFlow
      const nextPointerActive = Boolean(scaleWall.visible && pointer?.active && pointerStrength.value > .1)
      if (nextPointerActive && scalePointer) {
        const moved = pointerWaveOrigin.value.distanceTo(scalePointer) > .035
        if ((!scalePointerActive || moved) && scaleTime - pointerWaveStart >= .20) {
          pointerWaveOrigin.value.copy(scalePointer)
          pointerWaveStart = scaleTime
          pointerWaveStrength.value = Math.min(.34, pointerStrength.value * .34)
          pointerWaves.value[pointerWaveSlot].set(scalePointer.x, scalePointer.y, 0, pointerWaveStrength.value)
          pointerWaveStarts[pointerWaveSlot] = scaleTime
          pointerWaveSlot = (pointerWaveSlot + 1) % pointerWaves.value.length
        }
      }
      scalePointerActive = nextPointerActive
      pointerWaveAge.value = Number.isFinite(pointerWaveStart) ? scaleTime - pointerWaveStart : -1
      if (pointerWaveAge.value > 1.6) pointerWaveStrength.value = 0
      // Keep recent fronts after pointer leave; each expires independently.
      for (let i = 0; i < pointerWaves.value.length; i++) {
        const wave = pointerWaves.value[i]
        wave.z = Number.isFinite(pointerWaveStarts[i]) ? scaleTime - pointerWaveStarts[i] : 2
        if (!scaleWall.visible || wave.z < 0 || wave.z >= 1.6) wave.w = 0
      }
      bubbles.material.uniforms.uTime.value = scaleTime
      bubbles.material.uniforms.uOpacity.value = scaleWeight
      bubbles.points.visible = scaleWeight > .001

      const architectureWeight = smooth(.59, .615, progress) * (1 - journey.darkness * .77)
        * (1 - journey.scales * .35) * (1 - smooth(.86, .94, progress) * .85)
      space.visible = architectureWeight > .001 && deviceCoverage
      architecture.opacity = architectureWeight
      // The underside remains legible as a ceiling after the camera crosses it.
      floorMaterial.opacity = smooth(.60, .68, progress) * (1 - smooth(.87, .95, progress)) * .97
      floor.visible = floorMaterial.opacity > .001
      causticMaterial.uniforms.uTime.value = time
      causticMaterial.uniforms.uOpacity.value = scaleWeight * .46
      causticMaterial.uniforms.uLightDepth.value = sampleLightChoreography(time, progress).depth
      caustics.visible = scaleWeight > .001
      let aboveFloor = journey.height > floorHeight
      if (camera) {
        camera.updateMatrixWorld()
        aboveFloor = camera.getWorldPosition(cameraWorld).y > floorHeight + .03
      }
      // A camera passing through the solid .34m slab otherwise sees its near
      // side as a screen-filling bar. Only its thickness dissolves near the eye;
      // the zero-thickness floor skin and the lower ceiling light stay intact.
      const eyeHeight = camera ? cameraWorld.y : journey.height
      lowerSpace.visible = scaleWeight > .001 && curtainHasCoverage(layers.deviceExit, layers.forestEntry)
      // Eye height cannot hide a whole room while its screen band is visible.
      chamber.visible = deviceWeight > .001 && deviceCoverage
      // Keep upper-room assets only in their outgoing band; the lower ceiling
      // and projected light survive independently after that band closes.
      ruins.update(deviceCoverage ? architectureWeight : 0)
      architectureBars.visible = deviceCoverage
      underside.visible = scaleWeight > .001 && eyeHeight < floorHeight
      const slabDistance = Math.abs(eyeHeight - (floorHeight - .17 * REACTOR.heightScale))
      slabMaterial.opacity = floorMaterial.opacity * smooth(.55, 1.10, slabDistance)
      slab.visible = aboveFloor && floor.visible && slabMaterial.opacity > .015
      // The extended bed now reaches behind the camera. Its grazing near-plane
      // projection would otherwise cover half the viewport at the crossing.
      floorMaterial.opacity *= smooth(.07, .55, Math.abs(eyeHeight - floorHeight))
      floorMaterial.depthWrite = floorMaterial.opacity > .94
      floor.visible = floorMaterial.opacity > .015
      water.update(time, progress, architectureWeight, aboveFloor, camera,
        { upper: layers.monitorExit, lower: layers.deviceExit })
      dark.opacity = deviceWeight
      machineMetal.opacity = deviceWeight
      cableMaterial.opacity = deviceWeight
      glow.opacity = 0
      chamberLight.update(deviceCoverage ? deviceWeight : 0, time)
      const light = sampleLightChoreography(time, progress)
      reactorLight.color.setHSL(light.rimHue, .34, .73)
      reactorLight.intensity = 0
      monitorAssembly.update(time, progress, pointer, camera)
    },
    dispose() {
      chamberLight.dispose()
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
