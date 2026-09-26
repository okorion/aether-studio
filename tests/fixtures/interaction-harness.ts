import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { createSceneInteraction } from '../../src/SceneInteraction'
import { createSceneWorlds } from '../../src/SceneWorlds'
import { createSceneMonitors } from '../../src/SceneMonitors'
import { createAtmosphere } from '../../src/Atmosphere'
import { createSceneForest } from '../../src/SceneForest'
import { sampleJourney } from '../../src/Journey'
import { sampleScaleOffset } from '../../src/ScaleStage'
import { createSceneLayers, sampleEmblemCurtain, sampleLayers } from '../../src/SceneLayers'
import { bindCurtain, bindGroupCurtain, createCurtainBounds } from '../../src/SceneCurtains'
import { createLightFilmUniforms } from '../../src/SceneLighting'
import { createWaterSurface } from '../../src/SceneWater'
import { createPointerFlow } from '../../src/PointerFlow'

type Snapshot = {
  yaw: number
  pitch: number
  zoom: number
  burst: number
  illuminatedPixels: number
  rightmostPixel: number
}

export type InteractionHarness = {
  step: (seconds: number) => Snapshot
  reset: (reducedMotion?: boolean) => void
  setOrbitEnabled: (enabled: boolean) => void
  sampleJourney: typeof sampleJourney
  sampleLayers: typeof sampleLayers
  sampleEditorial: typeof sampleEditorial
  stepField: typeof stepField
  probeCurtainPixels: typeof probeCurtainPixels
  probeEmblemCurtainPixels: typeof probeEmblemCurtainPixels
  probeWorldSurfaceDepth: typeof probeWorldSurfaceDepth
  probeProductionBoundaryPixels: typeof probeProductionBoundaryPixels
  probeOutgoingBonePixels: typeof probeOutgoingBonePixels
  probeScalePointer: typeof probeScalePointer
  probeScaleBubbles: typeof probeScaleBubbles
  probeDevicePointer: typeof probeDevicePointer
  probeForestPointer: typeof probeForestPointer
  probeMonitorCapture: typeof probeMonitorCapture
  probeWaterCaptureVisibility: typeof probeWaterCaptureVisibility
  probeMonitorOcclusion: typeof probeMonitorOcclusion
  probeMonitorMotion: typeof probeMonitorMotion
  probePointerForestPixels: typeof probePointerForestPixels
  sampleWorld: (elapsed: number, progress: number) => {
    chain: number[]
    vertebrae: number[]
    monitors: number[][]
    modelY: number
    chamberY: number
    structureYaw: number
    boneLocalY: number
    boneWorldY: number
    boneVisible: boolean
    fixed: { machineY: number; floorY: number; scaleY: number; machineVisible: boolean; scaleVisible: boolean }
    scaleTiles: number[]
  }
  dispose: () => void
}

declare global {
  interface Window {
    interactionHarness: InteractionHarness
  }
}

// This entry is bundled in memory by the tests. It never ships with the site.
// A black, static scene isolates the real trail shader from ambient animation.
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(innerWidth, innerHeight)
renderer.setClearColor(0x000000)
const canvas = renderer.domElement
canvas.id = 'interaction-canvas'
document.body.appendChild(canvas)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 90)
camera.position.z = 10
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
let time = 0
let interaction = createSceneInteraction(scene, camera, canvas, false, true)
const pixels = new Uint8Array(innerWidth * innerHeight * 4)
// This scene is never rendered. Inspect the real instance transforms without
// another WebGL context or a costly production-scene screenshot per sample.
const worldScene = new THREE.Scene()
const worldFilmTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
worldFilmTexture.needsUpdate = true
const worldFilm = createLightFilmUniforms(worldFilmTexture)
let worlds: ReturnType<typeof createSceneWorlds> | undefined
const worldPosition = new THREE.Vector3()
const editorialScene = new THREE.Scene()
let editorial: ReturnType<typeof createSceneLayers> | undefined

function advanceInteraction(seconds: number) {
  const steps = Math.max(1, Math.ceil(seconds / .05))
  let output = interaction.update(0, time, 1)
  for (let i = 0; i < steps; i++) {
    time += seconds / steps
    output = interaction.update(seconds / steps, time, 1)
  }
  return output
}

function stepField(seconds: number) {
  const { yaw, pitch, field } = advanceInteraction(seconds)
  const bytes=field.flowTexture.image.data as Uint8Array
  let flowEnergy=0
  for(let i=0;i<bytes.length;i+=4)flowEnergy+=Math.abs(bytes[i]-128)+Math.abs(bytes[i+1]-128)
  return { yaw, pitch, active: field.active, ndc: field.ndc.toArray(), strength: field.strength, aspect: field.aspect, flowEnergy }
}

function probePointerForestPixels() {
  const isolated = new THREE.Scene()
  const input = createSceneInteraction(isolated, camera, canvas, false, true)
  const motes = isolated.getObjectByName('aether-pointer-motes')!
  const ribbon = isolated.getObjectByName('aether-pointer-ribbons')!
  const target = new THREE.WebGLRenderTarget(320, 240)
  const previous = renderer.getRenderTarget()
  const image = new Uint8Array(320 * 240 * 4)
  let elapsed = 0
  const sweep = (progress: number) => {
    const rows = progress < .5 ? [.85, .5, .15] : [.15, .5, .85]
    for (const y of rows) for (let x = .12; x < .9; x += .08) {
      input.update(.08, elapsed += .08, 1, progress)
      const event = new PointerEvent('pointermove', {
        bubbles: true, pointerType: 'mouse', clientX: innerWidth * x, clientY: innerHeight * y,
      })
      Object.defineProperty(event, 'timeStamp', { value: elapsed * 1000 })
      canvas.dispatchEvent(event)
    }
    input.update(.02, elapsed += .02, 1, progress)
  }
  try {
    input.setOrbitEnabled(false)
    return [0, .15, .4, .72, .765, .83, .89, 1, .45, 0].map(progress => {
      // Seed a complete forest first, then move its boundary across live trails.
      if (progress === .15) sweep(0)
      if (progress === .89) sweep(1)
      sweep(progress)
      const layers = sampleLayers(progress)
      const read = () => {
        renderer.setRenderTarget(target)
        renderer.render(isolated, camera)
        renderer.readRenderTargetPixels(target, 0, 0, 320, 240, image)
        let lit = 0, leaked = 0
        for (let i = 0; i < image.length; i += 4) {
          if (image[i] + image[i + 1] + image[i + 2] < 9) continue
          lit++
          const x = ((i / 4) % 320 + .5) / 320
          const y = (Math.floor(i / 4 / 320) + .5) / 240 - (x - .5) * .2
          // Exclude only the antialiased fringe, not whole point sprites.
          if (y < layers.forestExit - .02 && y > layers.forestEntry + .02) leaked++
        }
        return { lit, leaked }
      }
      const together = read()
      const ribbonVisible = ribbon.visible
      ribbon.visible = false
      const pointsOnly = read()
      ribbon.visible = ribbonVisible
      return { progress, together, pointsOnly, motesVisible: motes.visible }
    })
  } finally {
    renderer.setRenderTarget(previous)
    target.dispose()
    input.dispose()
  }
}

function sampleEditorial(progress: number) {
  editorial ??= createSceneLayers(editorialScene)
  editorial.update(progress, camera)
  editorialScene.updateMatrixWorld(true)
  return ['aether-statement-wrapper', 'aether-scale-wrapper'].map(name => {
    const panel = editorialScene.getObjectByName(name) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
    if (!panel) throw new Error(`Missing editorial layer ${name}`)
    return {
      matrix: panel.matrixWorld.toArray(), visible: panel.visible,
      opacity: panel.material.uniforms.uOpacity.value as number,
      inkOffset: panel.material.uniforms.uInkOffset.value as number,
      top: panel.material.uniforms.uTop.value as number,
      bottom: panel.material.uniforms.uBottom.value as number,
    }
  })
}

function probeCurtainPixels() {
  const probeScene = new THREE.Scene()
  const probeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10)
  probeCamera.position.z = 3
  probeCamera.updateMatrixWorld()
  const bounds = createCurtainBounds()
  const standard = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xff0000, depthWrite: true,
  })
  // Water and other custom shaders write gl_Position themselves. Exercise
  // that production hook separately from MeshStandard's project_vertex chunk.
  const custom = new THREE.ShaderMaterial({
    depthWrite: true,
    vertexShader: `void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
    fragmentShader: 'void main() { gl_FragColor = vec4(1., 0., 0., 1.); }',
  })
  bindCurtain(standard, bounds)
  bindCurtain(custom, bounds)
  const geometry = new THREE.PlaneGeometry(2, 2)
  const front = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(geometry, standard)
  const backgroundMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff })
  const background = new THREE.Mesh(geometry, backgroundMaterial)
  background.position.z = -1
  // Render the blue background AFTER the depth-writing foreground. A cut-out
  // which merely writes transparent color will leave a green depth hole.
  front.renderOrder = 0
  background.renderOrder = 1
  probeScene.add(front, background)
  const target = new THREE.WebGLRenderTarget(160, 120, { depthBuffer: true })
  const saved = {
    target: renderer.getRenderTarget(),
    autoClear: renderer.autoClear,
    clearColor: renderer.getClearColor(new THREE.Color()),
    clearAlpha: renderer.getClearAlpha(),
  }
  const states = [
    { name: 'first-band', upper: .78, lower: .24 },
    { name: 'moved-band', upper: .47, lower: .06 },
    { name: 'hidden-above', upper: -.25, lower: -.5 },
    { name: 'hidden-below', upper: 1.5, lower: 1.25 },
  ]
  const results = []
  try {
    renderer.autoClear = true
    renderer.setClearColor(0x00ff00, 1)
    // Same aspect at two RT resolutions, then portrait. The edge must remain
    // in normalized screen coordinates, independent of framebuffer pixels.
    for (const [width, height] of [[160, 120], [320, 240], [120, 160]]) {
      const aspect = width / height
      probeCamera.left = -aspect
      probeCamera.right = aspect
      probeCamera.updateProjectionMatrix()
      front.scale.set(aspect * 1.1, 1.1, 1)
      background.scale.copy(front.scale)
      target.setSize(width, height)
      for (const state of states) {
        bounds.upper.value = state.upper
        bounds.lower.value = state.lower
        const images = [standard, custom].map(material => {
          front.material = material
          renderer.setRenderTarget(target)
          renderer.render(probeScene, probeCamera)
          const image = new Uint8Array(width * height * 4)
          renderer.readRenderTargetPixels(target, 0, 0, width, height, image)
          return image
        })
        const samples = images.map(image => {
          let foreground = 0, background = 0, unknown = 0
          let checkedInside = 0, checkedOutside = 0, wrongInside = 0, wrongOutside = 0
          const mask = new Uint8Array(width * height)
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const pixel = y * width + x
            const offset = pixel * 4
            const red = image[offset] > 150 && image[offset + 1] < 10 && image[offset + 2] < 10
            const blue = image[offset + 2] > 150 && image[offset] < 10 && image[offset + 1] < 10
            if (red) foreground++
            else if (blue) background++
            else unknown++
            mask[pixel] = Number(red)
            // Readback starts at the framebuffer bottom, matching shader UVs.
            // Exclude only the narrow stochastic fringe from absolute checks.
            const edge = (y + .5) / height - ((x + .5) / width - .5) * .20
            if (edge > state.lower + .022 && edge < state.upper - .022) {
              checkedInside++
              if (!red) wrongInside++
            } else if (edge < state.lower - .022 || edge > state.upper + .022) {
              checkedOutside++
              if (!blue) wrongOutside++
            }
          }
          return { mask, stats: { foreground, background, unknown, checkedInside, checkedOutside, wrongInside, wrongOutside } }
        })
        let maskMismatch = 0
        for (let pixel = 0; pixel < width * height; pixel++)
          if (samples[0].mask[pixel] !== samples[1].mask[pixel]) maskMismatch++
        results.push({
          size: [width, height], state: state.name, maskMismatch,
          samples: samples.map(sample => sample.stats),
        })
      }
    }
    return results
  } finally {
    renderer.setRenderTarget(saved.target)
    renderer.autoClear = saved.autoClear
    renderer.setClearColor(saved.clearColor, saved.clearAlpha)
    target.dispose()
    standard.dispose()
    custom.dispose()
    backgroundMaterial.dispose()
    geometry.dispose()
    probeScene.clear()
  }
}

function probeEmblemCurtainPixels() {
  const width = 240, height = 160
  const probeScene = new THREE.Scene()
  const probeCamera = new THREE.OrthographicCamera(-1.5, 1.5, 1, -1, .1, 10)
  probeCamera.position.z = 3
  probeCamera.updateMatrixWorld()
  const emblem = new THREE.Group()
  const bounds = createCurtainBounds()
  const ringGeometry = new THREE.TorusGeometry(.81, .105, 12, 72)
  const glyphShape = new THREE.Shape()
  glyphShape.absellipse(0, 0, .29, .48, 0, Math.PI * 2, false, 0)
  const glyphHole = new THREE.Path()
  glyphHole.absellipse(0, 0, .16, .32, 0, Math.PI * 2, true, 0)
  glyphShape.holes.push(glyphHole)
  const glyphGeometry = new THREE.ExtrudeGeometry(glyphShape, { depth: .08, bevelEnabled: false, curveSegments: 24 })
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff0000, depthWrite: true })
  const glyphMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, depthWrite: true })
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  const glyph = new THREE.Mesh(glyphGeometry, glyphMaterial)
  glyph.position.z = .15
  emblem.add(ring, glyph)
  // Use the production group binding, including both ring and glyph materials.
  bindGroupCurtain(emblem, bounds)
  const backgroundGeometry = new THREE.PlaneGeometry(3.2, 2.2)
  const backgroundMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff })
  const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial)
  background.position.z = -1
  background.renderOrder = 10
  probeScene.add(emblem, background)
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true })
  const saved = {
    target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
    autoClear: renderer.autoClear, color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
  }
  const draw = () => {
    renderer.setRenderTarget(target)
    renderer.render(probeScene, probeCamera)
    const image = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, image)
    return image
  }
  const isRed = (image: Uint8Array, offset: number) => image[offset] > 150 && image[offset + 1] < 10 && image[offset + 2] < 10
  const isBlue = (image: Uint8Array, offset: number) => image[offset + 2] > 150 && image[offset] < 10 && image[offset + 1] < 10
  try {
    renderer.autoClear = true
    renderer.setClearColor(0x00ff00, 1)
    const baseline = draw()
    return [.89, .90, .915].map(progress => {
      const state = sampleEmblemCurtain(progress)
      bounds.upper.value = state.upper
      bounds.lower.value = state.lower
      const image = draw()
      let baselineRingPixels = 0, hiddenRingPixels = 0, visibleRingPixels = 0
      let checkedAbove = 0, redAbove = 0, depthHoles = 0, missingBelow = 0, changedBackground = 0
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const originalRed = isRed(baseline, offset)
        if (originalRed) baselineRingPixels++
        const edge = (y + .5) / height - ((x + .5) / width - .5) * .20
        if (edge > state.upper + .022) {
          checkedAbove++
          if (originalRed) hiddenRingPixels++
          if (isRed(image, offset)) redAbove++
          // The background is submitted last: a hidden depth-writing ring
          // leaves green here, even if its own red output has been suppressed.
          if (!isBlue(image, offset)) depthHoles++
        } else if (edge < state.upper - .022 && edge > state.lower + .022 && originalRed) {
          visibleRingPixels++
          if (!isRed(image, offset)) missingBelow++
        }
        if (!originalRed && !isBlue(image, offset)) changedBackground++
      }
      return { progress, upper: state.upper, baselineRingPixels, hiddenRingPixels, visibleRingPixels,
        checkedAbove, redAbove, depthHoles, missingBelow, changedBackground }
    })
  } finally {
    renderer.setRenderTarget(saved.target, saved.face, saved.mip)
    renderer.autoClear = saved.autoClear
    renderer.setClearColor(saved.color, saved.alpha)
    target.dispose()
    ringGeometry.dispose()
    glyphGeometry.dispose()
    backgroundGeometry.dispose()
    ringMaterial.dispose()
    glyphMaterial.dispose()
    backgroundMaterial.dispose()
    probeScene.clear()
  }
}

function probeWorldSurfaceDepth() {
  worlds ??= createSceneWorlds(worldScene, true, false, undefined, worldFilm)
  const width = 160, height = 120
  const probeScene = new THREE.Scene()
  const probeCamera = new THREE.PerspectiveCamera(42, width / height, .1, 100)
  const markerGeometry = new THREE.PlaneGeometry(1, 1)
  // A transparent, fully opaque marker is submitted after BOTH opaque and
  // transparent production surfaces. Only their actual depth can block it.
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1, depthWrite: false })
  const marker = new THREE.Mesh(markerGeometry, markerMaterial)
  marker.renderOrder = 100
  probeScene.add(marker)
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true })
  const saved = {
    target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
    autoClear: renderer.autoClear, color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
  }
  const required = (name: string) => {
    const object = worldScene.getObjectByName(name)
    if (!(object instanceof THREE.Mesh)) throw new Error(`Missing production surface ${name}`)
    return object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>
  }
  const atProgress = (progress: number) => {
    const state = sampleJourney(progress)
    probeCamera.position.set(
      Math.sin(state.azimuth) * Math.cos(state.elevation) * state.radius,
      state.height + Math.sin(state.elevation) * state.radius,
      Math.cos(state.azimuth) * Math.cos(state.elevation) * state.radius,
    )
    probeCamera.lookAt(0, state.height, 0)
    probeCamera.updateMatrixWorld()
    worlds!.update(10, progress, undefined, probeCamera)
    worldScene.updateMatrixWorld(true)
  }
  const read = () => {
    renderer.setRenderTarget(target)
    renderer.render(probeScene, probeCamera)
    const image = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, image)
    return image
  }
  const red = (image: Uint8Array, offset: number) => image[offset] > 150 && image[offset + 1] < 10 && image[offset + 2] < 10
  try {
    renderer.autoClear = true
    renderer.setClearColor(0x0000ff, 1)
    atProgress(.70)
    const plinth = new THREE.Box3().setFromObject(required('aether-machine-plinth'))
    const floor = new THREE.Box3().setFromObject(required('aether-separating-floor'))
    const capMesh = required('aether-machine-aperture')
    if (!(capMesh.material instanceof THREE.MeshStandardMaterial)) throw new Error('The annular cap must retain its production standard material')
    const cap = new THREE.Box3().setFromObject(capMesh)
    const socket = new THREE.Box3().setFromObject(required('aether-machine-upper-socket'))
    const ceiling = new THREE.Box3().setFromObject(required('aether-chamber-ceiling'))
    const underside = new THREE.Box3().setFromObject(required('aether-floor-underside'))
    const contact = { plinthBottom: plinth.min.y, floorMin: floor.min.y, floorMax: floor.max.y,
      capBottom: cap.min.y, capTop: cap.max.y, socketTop: socket.max.y,
      scaleCorePresent: Boolean(worldScene.getObjectByName('aether-scale-core')),
      capFilmDefine: capMesh.material.defines?.AETHER_LIGHT_FILM as number | undefined,
      ceilingY: ceiling.min.y, ceilingTop: ceiling.max.y, ceilingWidth: ceiling.max.x - ceiling.min.x,
      ceilingVisible: required('aether-chamber-ceiling').visible,
      undersideY: underside.max.y, undersideWidth: underside.max.x - underside.min.x }
    const visibility = [.70, .76, .82, .70].map(progress => {
      atProgress(progress)
      return {
        eyeY: probeCamera.position.y,
        machine: worldScene.getObjectByName('aether-machine-assembly')!.visible,
        ruins: worldScene.getObjectByName('aether-flooded-ruins')!.visible,
        upperStructure: worldScene.getObjectByName('aether-upper-room-structure')!.visible,
        underside: required('aether-floor-underside').visible,
      }
    })
    const cases = [
      { name: 'aether-separating-floor', progress: .70, ndcY: -.55 },
      { name: 'aether-floor-underside', progress: .82, ndcY: .80 },
      { name: 'aether-machine-aperture', progress: .67, ndcY: null },
    ].map(entry => {
      atProgress(entry.progress)
      const source = required(entry.name)
      let effectivelyVisible = true
      for (let object: THREE.Object3D | null = source; object; object = object.parent)
        effectivelyVisible &&= object.visible
      // Keep the actual geometry, compiled material hooks, world transform,
      // depth policy and camera; isolate unrelated room lights and meshes.
      const surface = new THREE.Mesh(source.geometry, source.material)
      surface.matrixAutoUpdate = false
      surface.matrix.copy(source.matrixWorld)
      surface.renderOrder = source.renderOrder
      const surfacePoint = source.getWorldPosition(new THREE.Vector3())
      const raycaster = new THREE.Raycaster()
      if (entry.ndcY !== null) {
        raycaster.setFromCamera(new THREE.Vector2(0, entry.ndcY), probeCamera)
        const intersection = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -surfacePoint.y), new THREE.Vector3())
        if (!intersection) throw new Error(`The production camera ray misses ${entry.name}`)
        surfacePoint.copy(intersection)
      } else {
        raycaster.ray.origin.copy(probeCamera.position)
        raycaster.ray.direction.copy(surfacePoint).sub(probeCamera.position).normalize()
      }
      marker.position.copy(surfacePoint).addScaledVector(raycaster.ray.direction, 1)
      marker.quaternion.copy(probeCamera.quaternion)
      const depth = -marker.position.clone().applyMatrix4(probeCamera.matrixWorldInverse).z
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(probeCamera.fov) / 2) * depth
      marker.scale.set(halfHeight * .25, halfHeight * .15, 1)
      const baseline = read()
      surface.visible = effectivelyVisible
      probeScene.add(surface)
      const blocked = read()
      let markerPixels = 0, checkedOccluded = 0, exposedMarker = 0, outsideCurtain = 0, leakedPixels = 0
      const leakedDepthGaps: number[] = []
      const layers = sampleLayers(entry.progress)
      for (let offset = 0; offset < baseline.length; offset += 4) if (red(baseline, offset)) {
        markerPixels++
        const pixel = offset / 4, x = pixel % width, y = Math.floor(pixel / width)
        const uvX = (x + .5) / width, uvY = (y + .5) / height
        const boundary = uvY - (uvX - .5) * .20
        const lowerRoom = entry.name === 'aether-floor-underside'
        const lower = lowerRoom ? layers.forestEntry : layers.deviceExit
        const upper = lowerRoom ? layers.deviceExit : layers.monitorExit
        if (boundary <= lower + .022 || boundary >= upper - .022) {
          outsideCurtain++
          continue
        }
        // A camera-facing marker may itself straddle the horizontal surface.
        // Only require occlusion where the actual geometry lies in front of
        // that pixel's marker hit. This is an independent ray/GL depth check,
        // not an assumption that the marker's centre determines every pixel.
        raycaster.setFromCamera(new THREE.Vector2(uvX * 2 - 1, uvY * 2 - 1), probeCamera)
        const surfaceHit = raycaster.intersectObject(surface, false)[0]
        const markerHit = raycaster.intersectObject(marker, false)[0]
        // Exclude nearly coplanar samples: CPU triangle intersection and the
        // 24-bit raster depth differ by ~1.6mm at this grazing floor angle.
        if (!surfaceHit || !markerHit || surfaceHit.distance >= markerHit.distance - .005) {
          exposedMarker++
          continue
        }
        checkedOccluded++
        if (red(blocked, offset)) { leakedPixels++; leakedDepthGaps.push(markerHit.distance - surfaceHit.distance) }
      }
      probeScene.remove(surface)
      return { name: entry.name, progress: entry.progress, effectivelyVisible, depthWrite: source.material.depthWrite,
        markerPixels, checkedOccluded, exposedMarker, outsideCurtain, leakedPixels, leakedDepthGaps }
    })
    return { contact, visibility, cases }
  } finally {
    renderer.setRenderTarget(saved.target, saved.face, saved.mip)
    renderer.autoClear = saved.autoClear
    renderer.setClearColor(saved.color, saved.alpha)
    target.dispose()
    markerGeometry.dispose()
    markerMaterial.dispose()
    // The borrowed production geometry/material remain owned by worlds.
    probeScene.clear()
  }
}

function probeProductionBoundaryPixels() {
  worlds ??= createSceneWorlds(worldScene, true, false, undefined, worldFilm)
  const width = 160, height = 120
  const probeScene = new THREE.Scene()
  const probeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 20)
  probeCamera.position.z = 5
  probeCamera.updateMatrixWorld()
  const target = new THREE.WebGLRenderTarget(width, height)
  // A full-screen plane isolates the REAL production material/binding from
  // sparse geometry coverage. Constant output changes color only, not discard.
  const geometry = new THREE.PlaneGeometry(5, 5)
  geometry.setAttribute('aArmour', geometry.getAttribute('position').clone())
  geometry.setAttribute('aArmourNormal', geometry.getAttribute('normal').clone())
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3))
  const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
    color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() }
  const cases = [
    { name: 'aether-spine-vertebrae', region: 'bone', progress: [.635, .65, .665] },
    { name: 'aether-machine-aperture', region: 'device', progress: [.735, .745, .755, .82] },
    { name: 'aether-scale-tiles', region: 'scales', progress: [.735, .745, .755, .90] },
    { name: 'aether-floor-underside', region: 'scales', progress: [.745, .755] },
  ] as const
  const results = []
  try {
    renderer.autoClear = true
    renderer.setClearColor(0x0000ff, 1)
    for (const entry of cases) {
      const source = worldScene.getObjectByName(entry.name)
      if (!(source instanceof THREE.Mesh) || Array.isArray(source.material)) throw new Error(`Missing production material ${entry.name}`)
      const production = source.material as THREE.MeshStandardMaterial
      const material = production.clone()
      material.defines = { ...production.defines }
      material.transparent = false
      material.opacity = 1
      material.side = THREE.DoubleSide
      material.onBeforeCompile = (shader, activeRenderer) => {
        production.onBeforeCompile.call(production, shader, activeRenderer)
        const end = shader.fragmentShader.lastIndexOf('}')
        shader.fragmentShader = shader.fragmentShader.slice(0, end)
          + '\ngl_FragColor = vec4(1., 0., 0., 1.);\n' + shader.fragmentShader.slice(end)
      }
      material.customProgramCacheKey = () => production.customProgramCacheKey() + '-boundary-pixel-probe'
      const surface = new THREE.Mesh(geometry, material)
      probeScene.add(surface)
      try {
        for (const progress of entry.progress) {
          worlds.update(10, progress)
          const layers = sampleLayers(progress)
          // Expected region comes from the timeline contract, not uniforms read
          // back out of the material under test.
          const upper = entry.region === 'bone' ? layers.monitorEntry
            : entry.region === 'device' ? layers.monitorExit : layers.deviceExit
          const lower = entry.region === 'bone' ? layers.monitorExit
            : entry.region === 'device' ? layers.deviceExit : layers.forestEntry
          renderer.setRenderTarget(target)
          renderer.render(probeScene, probeCamera)
          const image = new Uint8Array(width * height * 4)
          renderer.readRenderTargetPixels(target, 0, 0, width, height, image)
          let checkedInside = 0, checkedOutside = 0, missingInside = 0, leakedOutside = 0
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4
            const boundary = (y + .5) / height - ((x + .5) / width - .5) * .20
            const red = image[offset] > 150 && image[offset + 1] < 10 && image[offset + 2] < 10
            if (boundary > lower + .022 && boundary < upper - .022) {
              checkedInside++
              if (!red) missingInside++
            } else if (boundary < lower - .022 || boundary > upper + .022) {
              checkedOutside++
              if (red) leakedOutside++
            }
          }
          results.push({ name: entry.name, progress, checkedInside, checkedOutside, missingInside, leakedOutside })
        }
      } finally {
        probeScene.remove(surface)
        material.dispose()
      }
    }
    return results
  } finally {
    renderer.setRenderTarget(saved.target)
    renderer.autoClear = saved.autoClear
    renderer.setClearColor(saved.color, saved.alpha)
    geometry.dispose()
    target.dispose()
  }
}

function probeOutgoingBonePixels() {
  const width = 320, height = 200
  const probeScene = new THREE.Scene()
  const atmosphere = createAtmosphere(probeScene, false, false)
  const grains = probeScene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const outgoing = probeScene.getObjectByName('aether-outgoing-bone-current') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  if (!outgoing) throw new Error('Missing outgoing production bone current')
  const originalMaterial = outgoing.material
  const referenceMaterial = grains.material.clone()
  referenceMaterial.uniforms = { ...grains.material.uniforms,
    uWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
    uFieldOpacity: { value: 1 }, uExitEdge: { value: -.5 },
    uDeviceEntryWipe: { value: 0 }, uDevicePointerStrength: { value: 0 },
  }
  const reference = new THREE.Points(grains.geometry, referenceMaterial)
  reference.frustumCulled = false
  reference.visible = false
  const outgoingFlowers = outgoing.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const originalFlowerMaterial = outgoingFlowers.material
  const referenceFlowerMaterial = originalFlowerMaterial.clone()
  referenceFlowerMaterial.uniforms = referenceMaterial.uniforms
  const referenceFlowers = new THREE.Points(outgoingFlowers.geometry, referenceFlowerMaterial)
  referenceFlowers.frustumCulled = false
  reference.add(referenceFlowers)
  probeScene.add(reference)
  const coverageMaterial = originalMaterial.clone()
  coverageMaterial.uniforms = originalMaterial.uniforms
  // Retain the actual position/point size and both circular/curtain discards;
  // remove shimmer/color so the time and scroll checks measure geometry only.
  coverageMaterial.fragmentShader = coverageMaterial.fragmentShader.replace(
    'gl_FragColor = vec4(color, shape * vAlpha * entry);',
    'if (vAlpha <= 0.) discard; gl_FragColor = vec4(1., 1., 1., 1.);')
  const flowerCoverageMaterial = originalFlowerMaterial.clone()
  flowerCoverageMaterial.uniforms = originalFlowerMaterial.uniforms
  flowerCoverageMaterial.fragmentShader = coverageMaterial.fragmentShader
  const probeCamera = new THREE.PerspectiveCamera(42, width / height, .1, 100)
  const target = new THREE.WebGLRenderTarget(width, height)
  const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
    color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() }
  const at = (progress: number, time: number) => {
    const state = sampleJourney(progress)
    probeCamera.position.set(Math.sin(state.azimuth) * Math.cos(state.elevation) * state.radius,
      state.height + Math.sin(state.elevation) * state.radius,
      Math.cos(state.azimuth) * Math.cos(state.elevation) * state.radius)
    probeCamera.lookAt(0, state.height, 0)
    probeCamera.updateMatrixWorld()
    atmosphere.update(time, progress, 1, undefined, probeCamera)
    atmosphere.update(time, progress, 1, undefined, probeCamera)
    for (const name of ['aether-current-particles', 'aether-current-filaments', 'aether-volume-shafts'])
      probeScene.getObjectByName(name)!.visible = false
    // Compare the unmasked field at the same fixed world anchor as the
    // production flowers, rather than at the travelling camera focus.
    reference.position.copy(outgoing.position)
  }
  const read = () => {
    renderer.setRenderTarget(target)
    renderer.render(probeScene, probeCamera)
    const image = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, image)
    return image
  }
  const changed = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, value, i) => sum + Number(value !== b[i]), 0)
  try {
    renderer.autoClear = true
    renderer.setClearColor(0x000000, 0)
    const cases = [.635, .65, .665].map(progress => {
      at(progress, 10)
      const masked = read()
      outgoing.visible = false
      reference.visible = true
      const unmasked = read()
      reference.visible = false
      const lower = sampleLayers(progress).monitorExit
      let visibleAbove = 0, changedAbove = 0, hiddenBaseline = 0, leakedBelow = 0
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const boundary = (y + .5) / height - ((x + .5) / width - .5) * .20
        const lit = unmasked[offset] + unmasked[offset + 1] + unmasked[offset + 2] > 6
        if (boundary > lower + .05 && lit) {
          visibleAbove++
          if (masked.slice(offset, offset + 4).some((value, i) => value !== unmasked[offset + i])) changedAbove++
        } else if (boundary < lower - .05) {
          if (lit) hiddenBaseline++
          if (masked[offset] || masked[offset + 1] || masked[offset + 2] || masked[offset + 3]) leakedBelow++
        }
      }
      return { progress, visibleAbove, changedAbove, hiddenBaseline, leakedBelow }
    })
    outgoing.material = coverageMaterial
    outgoingFlowers.material = flowerCoverageMaterial
    at(.645, 10)
    const initial = read()
    at(.645, 12)
    const idle = read()
    // Only the distant belt orbits with time; flowers follow scroll alone.
    // Hold time fixed for the forward/reverse comparison.
    at(.66, 10)
    const forward = read()
    at(.645, 10)
    const reverse = read()
    const closed = [.59, .70].map(progress => {
      at(progress, 10)
      return outgoing.visible
    })
    return { cases, geometryShared: outgoing.geometry === grains.geometry,
      flowerGeometryShared: outgoingFlowers.geometry === (grains.children[0] as THREE.Points).geometry,
      idleChanged: changed(initial, idle), forwardChanged: changed(initial, forward),
      reverseChanged: changed(initial, reverse), closed }
  } finally {
    outgoing.material = originalMaterial
    outgoingFlowers.material = originalFlowerMaterial
    probeScene.remove(reference)
    referenceMaterial.dispose()
    referenceFlowerMaterial.dispose()
    coverageMaterial.dispose()
    flowerCoverageMaterial.dispose()
    atmosphere.dispose()
    target.dispose()
    renderer.setRenderTarget(saved.target)
    renderer.autoClear = saved.autoClear
    renderer.setClearColor(saved.color, saved.alpha)
  }
}

function probeScalePointer() {
  const flow = createPointerFlow()
  const modelScene = new THREE.Scene()
  const assembly = createSceneWorlds(modelScene, true)
  const probeScene = new THREE.Scene()
  const probeCamera = new THREE.PerspectiveCamera(42, 4 / 3, .1, 60)
  // Follow the panel's scroll offset to isolate pointer shading from framing.
  const panelY = sampleJourney(.83).height + sampleScaleOffset(.83)
  probeCamera.position.set(0, panelY, 10)
  probeCamera.lookAt(0, panelY, 0)
  probeCamera.updateMatrixWorld()
  assembly.update(10, .83)
  modelScene.updateMatrixWorld(true)
  const tiles = modelScene.getObjectByName('aether-scale-tiles')
  if (!(tiles instanceof THREE.InstancedMesh)) throw new Error('The actual scale tiles must exist')
  const originalMatrices = Array.from(tiles.instanceMatrix.array)
  // Render only the actual production material/geometry, with fixed light and
  // time. Ambient particle animation cannot masquerade as pointer response.
  probeScene.attach(tiles)
  probeScene.add(new THREE.AmbientLight(0xffffff, 2))
  // Uniform ambient light cannot reveal a rigid face's changing normal. A
  // fixed oblique key observes the actual hinge shading, without depending
  // on the removed pointer-driven albedo boost or an artificial normal bend.
  const key = new THREE.DirectionalLight(0xffffff, 4)
  key.position.set(-4, panelY + 5, 6)
  key.target.position.set(0, panelY, 0)
  probeScene.add(key, key.target)
  const target = new THREE.WebGLRenderTarget(160, 120)
  const previousTarget = renderer.getRenderTarget()
  const previousAutoClear = renderer.autoClear
  const draw = (x: number, strength: number, flowTexture?: THREE.Texture, elapsed = 6.5, rawX = x) => {
    assembly.update(elapsed, .83, { ndc: new THREE.Vector2(x, 0), strength,
      rawNdc: new THREE.Vector2(rawX, 0), active: strength > 0, aspect: 4 / 3, flowTexture }, probeCamera)
    renderer.setRenderTarget(target)
    renderer.render(probeScene, probeCamera)
    const image = new Uint8Array(160 * 120 * 4)
    renderer.readRenderTargetPixels(target, 0, 0, 160, 120, image)
    return image
  }
  const difference = (a: Uint8Array, b: Uint8Array) => {
    let changed = 0, weight = 0, horizontal = 0, radius = 0, leftChanged = 0, rightChanged = 0
    for (let i = 0; i < a.length; i += 4) {
      const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      if (delta > 12) {
        changed++
        if ((i / 4) % 160 < 56) leftChanged++
        if ((i / 4) % 160 > 104) rightChanged++
        weight += delta
        horizontal += ((i / 4) % 160) / 160 * delta
        radius += Math.hypot(((i / 4) % 160) / 160 - .5,
          Math.floor(i / 4 / 160) / 120 - .5) * delta
      }
    }
    return { changed, leftChanged, rightChanged, centroidX: weight ? horizontal / weight : -1,
      centroidRadius: weight ? radius / weight : -1 }
  }
  try {
    renderer.autoClear = true
    const baseline = draw(0, 0)
    const resetBaseline = draw(0, 0, undefined, 8.5)
    const left = draw(-.4, 1)
    // Compare new right input with the SAME remaining left wake.
    const laterBaseline = draw(0, 0, undefined, 6.8)
    const right = draw(.4, 1, undefined, 6.8)
    const reset = draw(.4, 0, undefined, 8.5)
    for (let i = 0; i < 8; i++) {
      flow.move(-.55 + i * .05, 0, 4 / 3)
      flow.update(.035)
    }
    const wake = draw(-.3, 0, flow.texture, 8.5)
    for (let i = 0; i < 150; i++) flow.update(1 / 60)
    const wakeReset = draw(-.3, 0, flow.texture, 8.5)
    const wave = draw(.9, 0, undefined, 7.35)
    const middleWave = draw(.9, 0, undefined, 8.55)
    const overlap = draw(-.4, 1, undefined, 8.55)
    const outerWave = draw(.9, 0, undefined, 9.65)
    const edgeWave = draw(.9, 0, undefined, 10.15)
    const rest = draw(.9, 0, undefined, 13.0)
    const nextBeat = draw(.9, 0, undefined, 14.35)
    const edgeBaseline = draw(0, 0, undefined, 15.0)
    const edge = draw(.98, 1, undefined, 15.0)
    const rawBaseline = draw(0, 0, undefined, 16.2)
    const raw = draw(0, 1, undefined, 16.2, -.4)
    for (let i = 0; i <= 40; i++) {
      const x = -.4 + i * .02
      assembly.update(18 + i * .06, .83, { ndc: new THREE.Vector2(x, 0),
        rawNdc: new THREE.Vector2(x, 0), active: true, strength: 1, aspect: 4 / 3 }, probeCamera)
    }
    const slowMove = assembly.getScaleWaveState()
    assembly.update(20.55, .83)
    const afterLeave = assembly.getScaleWaveState()
    assembly.update(22.1, .83)
    const afterDecay = assembly.getScaleWaveState()
    return {
      left: difference(baseline, left), right: difference(laterBaseline, right),
      reset: difference(resetBaseline, reset),
      edge: difference(edgeBaseline, edge),
      raw: difference(rawBaseline, raw),
      wake: difference(resetBaseline, wake), wakeReset: difference(resetBaseline, wakeReset),
      wave: difference(baseline, wave),
      middleWave: difference(baseline, middleWave),
      overlap: difference(middleWave, overlap),
      outerWave: difference(baseline, outerWave),
      edgeWave: difference(baseline, edgeWave),
      rest: difference(baseline, rest),
      nextBeat: difference(wave, nextBeat),
      wakeHistory: { active: slowMove.waves, afterLeave: afterLeave.waves, afterDecay: afterDecay.waves },
      slowMove: { originX: slowMove.origin.x, age: slowMove.age, strength: slowMove.strength },
      matricesUnchanged: originalMatrices.every((value, index) => value === tiles.instanceMatrix.array[index]),
    }
  } finally {
    renderer.setRenderTarget(previousTarget)
    renderer.autoClear = previousAutoClear
    probeScene.clear()
    assembly.dispose()
    target.dispose()
    flow.dispose()
  }
}

function probeScaleBubbles() {
  const scene = new THREE.Scene()
  const assembly = createSceneWorlds(scene, true)
  assembly.update(0, .83)
  const bubbles = scene.getObjectByName('aether-scale-bubbles')
  if (!(bubbles instanceof THREE.Points) || !(bubbles.material instanceof THREE.ShaderMaterial))
    throw new Error('Scale bubbles are missing')
  const geometry = bubbles.geometry
  const material = bubbles.material
  const initialPositions = Array.from(geometry.getAttribute('position').array)
  const probeScene = new THREE.Scene()
  probeScene.attach(bubbles)
  bubbles.position.set(0, 0, 0)
  const camera = new THREE.PerspectiveCamera(42, 4 / 3, .1, 60)
  camera.position.set(0, 0, 18)
  camera.lookAt(0, 0, 0)
  const target = new THREE.WebGLRenderTarget(160, 120)
  const previousTarget = renderer.getRenderTarget()
  const previousAutoClear = renderer.autoClear
  const draw = (time: number) => {
    material.uniforms.uTime.value = time
    material.uniforms.uOpacity.value = 1
    renderer.setRenderTarget(target)
    renderer.render(probeScene, camera)
    const image = new Uint8Array(160 * 120 * 4)
    renderer.readRenderTargetPixels(target, 0, 0, 160, 120, image)
    return image
  }
  const changed = (a: Uint8Array, b: Uint8Array) => {
    let pixels = 0
    for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 2)
        pixels++
    return pixels
  }
  let geometryDisposed = false, materialDisposed = false
  geometry.addEventListener('dispose', () => { geometryDisposed = true })
  material.addEventListener('dispose', () => { materialDisposed = true })
  let result: { count: number; movingPixels: number; frozenPixels: number; positionsUnchanged: boolean } | undefined
  try {
    renderer.autoClear = true
    const first = draw(0)
    const moved = draw(2)
    const frozen = draw(2)
    result = {
      count: geometry.getAttribute('position').count,
      movingPixels: changed(first, moved), frozenPixels: changed(moved, frozen),
      positionsUnchanged: initialPositions.every((value, i) => value === geometry.getAttribute('position').array[i]),
    }
  } finally {
    renderer.setRenderTarget(previousTarget)
    renderer.autoClear = previousAutoClear
    probeScene.clear()
    assembly.dispose()
    target.dispose()
  }
  if (!geometryDisposed || !materialDisposed || !result) throw new Error('Bubble resources were not disposed')
  return result
}

function probeDevicePointer() {
  const width = 320, height = 200, progress = .72, elapsed = 10
  const probeScene = new THREE.Scene()
  const atmosphere = createAtmosphere(probeScene, false, false)
  const particles = probeScene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const initialSeeds = new Float32Array(particles.geometry.attributes.position.array)
  const probeCamera = new THREE.PerspectiveCamera(42, width / height, .1, 90)
  const positionCamera = (p: number) => {
    const state = sampleJourney(p)
    probeCamera.position.set(
      Math.sin(state.azimuth) * Math.cos(state.elevation) * state.radius,
      state.height + Math.sin(state.elevation) * state.radius,
      Math.cos(state.azimuth) * Math.cos(state.elevation) * state.radius,
    )
    probeCamera.lookAt(0, state.height, 0)
    probeCamera.updateMatrixWorld()
  }
  positionCamera(progress)
  // A world-space point on the device's right arc locates the actual cursor;
  // all deformation remains in the production vertex shader.
  const projectedArc = new THREE.Vector3(1.47, -40.4, 0).project(probeCamera)
  const pointer = { ndc: new THREE.Vector2(projectedArc.x, projectedArc.y), strength: 0, aspect: width / height, active: true }
  const target = new THREE.WebGLRenderTarget(width, height)
  const saved = {
    target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
    autoClear: renderer.autoClear, clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
  }
  const scrollSteps: number[] = []
  const draw = (strength: number) => {
    pointer.strength = strength
    atmosphere.update(elapsed, progress, 1, pointer)
    atmosphere.update(elapsed, progress, 1, pointer)
    scrollSteps.push(particles.material.uniforms.uScrollStep.value as number)
    renderer.setRenderTarget(target)
    renderer.render(probeScene, probeCamera)
    const bytes = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes)
    return bytes
  }
  const difference = (base: Uint8Array, image: Uint8Array) => {
    let changedBytes = 0, changedRgbPixels = 0, changedAlphaPixels = 0, addedCoverage = 0
    for (let i = 0; i < base.length; i++) if (base[i] !== image[i]) changedBytes++
    for (let i = 0; i < base.length; i += 4) {
      const rgb = Math.abs(base[i] - image[i]) + Math.abs(base[i + 1] - image[i + 1]) + Math.abs(base[i + 2] - image[i + 2])
      if (rgb > 12) changedRgbPixels++
      // Pointer lighting changes RGB but not fragment alpha. Changed alpha
      // coverage therefore verifies actual projected geometry displacement.
      if (Math.abs(base[i + 3] - image[i + 3]) > 2) changedAlphaPixels++
      if (base[i + 3] <= 1 && image[i + 3] > 3) addedCoverage++
    }
    return { changedBytes, changedRgbPixels, changedAlphaPixels, addedCoverage }
  }
  try {
    renderer.autoClear = true
    renderer.setClearColor(0x000000, 0)
    const baseline = draw(0)
    const moved = draw(1)
    const restored = draw(0)
    let illuminatedPixels = 0
    for (let i = 0; i < baseline.length; i += 4)
      if (baseline[i] + baseline[i + 1] + baseline[i + 2] > 10) illuminatedPixels++
    const fieldY = particles.position.y
    const ringDiameter = (scale: number) => {
      // Measure the requested diameter head-on; the oblique journey view also
      // contains unscaled depth and point-sprite widths in its horizontal span.
      probeCamera.position.set(0, -40.4, 12)
      probeCamera.lookAt(0, -40.4, 0)
      probeCamera.updateMatrixWorld()
      particles.material.uniforms.uReactorScale.value = scale
      const visibility = probeScene.children.map(object => object.visible)
      probeScene.children.forEach(object => { object.visible = object === particles })
      renderer.setRenderTarget(target)
      renderer.render(probeScene, probeCamera)
      const bytes = new Uint8Array(width * height * 4)
      renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes)
      let minX = width, maxX = 0, minY = height, maxY = 0
      for (let i = 0; i < bytes.length; i += 4) {
        if (bytes[i] + bytes[i + 1] + bytes[i + 2] < 12) continue
        const x = i / 4 % width, y = Math.floor(i / 4 / width)
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
      probeScene.children.forEach((object, i) => { object.visible = visibility[i] })
      return [maxX - minX + 1, maxY - minY + 1]
    }
    const authoredScale = particles.material.uniforms.uReactorScale.value as number
    const fullDiameter = ringDiameter(1)
    const reducedDiameter = ringDiameter(authoredScale)
    const diameterRatio = reducedDiameter.map((diameter, i) => diameter / fullDiameter[i])
    const chamberEntry = [.635, .65, .68].map(p => {
      positionCamera(p)
      atmosphere.update(elapsed, p, 1, undefined, probeCamera)
      atmosphere.update(elapsed, p, 1, undefined, probeCamera)
      // Isolate the actual current grains. Light beams have their own
      // overlapping coverage and cannot stand in for particle masking.
      probeScene.getObjectByName('aether-current-filaments')!.visible = false
      probeScene.getObjectByName('aether-volume-shafts')!.visible = false
      probeScene.getObjectByName('aether-outgoing-bone-current')!.visible = false
      const renderGrains = () => {
        renderer.setRenderTarget(target)
        renderer.render(probeScene, probeCamera)
        const image = new Uint8Array(width * height * 4)
        renderer.readRenderTargetPixels(target, 0, 0, width, height, image)
        return image
      }
      const uniforms = particles.material.uniforms
      const edge = uniforms.uDeviceEntryEdge.value as number
      const wipe = uniforms.uDeviceEntryWipe.value as number
      const masked = renderGrains()
      // Counterfactual baseline at identical time, geometry and camera. Only
      // the production mask is disabled; no replacement shader is involved.
      uniforms.uDeviceEntryWipe.value = 0
      const unmasked = renderGrains()
      uniforms.uDeviceEntryWipe.value = wipe
      let hiddenBaseline = 0, leakedAbove = 0, visibleBelow = 0, changedBelow = 0
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const boundary = (y + .5) / height - ((x + .5) / width - .5) * .20
        const lit = unmasked[offset] + unmasked[offset + 1] + unmasked[offset + 2] > 6
        // Point sprites inherit the centre's clip varying. Exclude their
        // maximum 6px radius plus the sloped 0.009 grain / 0.004 fringe.
        if (boundary > edge + .05) {
          if (lit) hiddenBaseline++
          if (masked[offset] || masked[offset + 1] || masked[offset + 2] || masked[offset + 3]) leakedAbove++
        } else if (boundary < edge - .05 && lit) {
          visibleBelow++
          for (let channel = 0; channel < 4; channel++)
            if (masked[offset + channel] !== unmasked[offset + channel]) { changedBelow++; break }
        }
      }
      return { progress: p, edge, wipe, hiddenBaseline, leakedAbove, visibleBelow, changedBelow }
    })
    const roomVisibility = [.70, .76, .82, .70].map(p => {
      positionCamera(p)
      atmosphere.update(elapsed, p, 1, undefined, probeCamera)
      return ['aether-current-particles', 'aether-current-filaments', 'aether-volume-shafts']
        .map(name => probeScene.getObjectByName(name)!.visible)
    })
    return {
      illuminatedPixels, moved: difference(baseline, moved), restored: difference(baseline, restored),
      scrollSteps, fieldY, diameterRatio, pointer: pointer.ndc.toArray(), chamberEntry, roomVisibility,
      seedsUnchanged: initialSeeds.every((value, index) => value === particles.geometry.attributes.position.array[index]),
    }
  } finally {
    renderer.setRenderTarget(saved.target, saved.face, saved.mip)
    renderer.setClearColor(saved.clearColor, saved.clearAlpha)
    renderer.autoClear = saved.autoClear
    atmosphere.dispose()
    target.dispose()
  }
}

function probeForestPointer(progress: number) {
  const width=384, height=240, elapsed=10
  const probeScene=new THREE.Scene()
  const forest=createSceneForest(probeScene,false,false)
  const state=sampleJourney(progress)
  const probeCamera=new THREE.PerspectiveCamera(42,width/height,.1,120)
  probeCamera.position.set(Math.sin(state.azimuth)*Math.cos(state.elevation)*state.radius,
    state.height+Math.sin(state.elevation)*state.radius,
    Math.cos(state.azimuth)*Math.cos(state.elevation)*state.radius)
  probeCamera.lookAt(0,state.height,0);probeCamera.updateMatrixWorld()
  const grove=probeScene.getObjectByName(progress<.5?'aether-forest-upper':'aether-forest-lower')!
  const micro=grove.getObjectByName('aether-forest-microfoliage') as THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>
  grove.children.forEach(child=>{if(child!==micro)child.visible=false})
  const original=Array.from(micro.geometry.attributes.position.array)
  const flowBytes=new Uint8Array([128,128,0,255])
  const flow=new THREE.DataTexture(flowBytes,1,1)
  flow.needsUpdate=true
  const pointer={ndc:new THREE.Vector2(),strength:0,aspect:width/height,active:true,flowTexture:flow}
  forest.update(elapsed,progress,probeCamera,pointer,1);probeScene.updateMatrixWorld(true)
  const worldBefore=micro.matrixWorld.toArray()
  const target=new THREE.WebGLRenderTarget(width,height)
  const previous={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),
    clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),auto:renderer.autoClear}
  const render=(x:number,y:number,active=true)=>{
    flowBytes[0]=Math.round(128+x*127);flowBytes[1]=Math.round(128+y*127);flow.needsUpdate=true
    pointer.active=active
    forest.update(elapsed,progress,probeCamera,pointer,1)
    renderer.setRenderTarget(target);renderer.render(probeScene,probeCamera)
    const pixels=new Uint8Array(width*height*4)
    renderer.readRenderTargetPixels(target,0,0,width,height,pixels)
    return pixels
  }
  const difference=(base:Uint8Array,moved:Uint8Array)=>{
    let changed=0,added=0
    for(let i=3;i<base.length;i+=4){if(base[i]!==moved[i])changed++;if(!base[i]&&moved[i])added++}
    return{changed,added}
  }
  const centroid=(pixels:Uint8Array)=>{
    let count=0,x=0,y=0
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]){count++;const p=(i-3)/4;x+=p%width;y+=Math.floor(p/width)}
    return{count,x:x/Math.max(1,count),y:y/Math.max(1,count)}
  }
  try{
    renderer.autoClear=true;renderer.setClearColor(0,0)
    const base=render(0,0)
    const right=render(.85,0),left=render(-.85,0),up=render(0,.85)
    const reset=render(0,0),excluded=render(.85,0,false)
    return {baseline:centroid(base),right:centroid(right),left:centroid(left),up:centroid(up),
      moved:difference(base,right),restored:difference(base,reset),excluded:difference(base,excluded),
      geometryUnchanged:original.every((v,i)=>v===micro.geometry.attributes.position.array[i]),
      worldUnchanged:worldBefore.every((v,i)=>v===micro.matrixWorld.elements[i]),
      pointerLight:micro.material.uniforms.uPointerStrength.value as number}
  }finally{
    renderer.setRenderTarget(previous.target,previous.face,previous.mip)
    renderer.setClearColor(previous.clear,previous.alpha);renderer.autoClear=previous.auto
    forest.dispose();target.dispose();flow.dispose()
  }
}

function probeMonitorMotion() {
  const monitors = createSceneMonitors(true, false)
  const probeCamera = new THREE.PerspectiveCamera(42, 1.6, .1, 90)
  probeCamera.position.set(0, 0, 12)
  probeCamera.lookAt(0, 0, 0)
  probeCamera.updateMatrixWorld()
  const snapshot = () => monitors.group.children.map(panel => ({
    position: panel.position.toArray(), quaternion: panel.quaternion.toArray(), scale: panel.scale.toArray(),
  }))
  let time = 0
  try {
    const scroll = [.303, .367, .431, .495, .559, .623, .303].map(progress => {
      monitors.update(++time, progress)
      return snapshot()
    })
    const hover = [1, 2].map(index => {
      const progress = .303 + index * .064
      // Settle previous hover before selecting the opposite side of the stack.
      for (let frame = 0; frame < 90; frame++) monitors.update(time += 1 / 60, progress)
      const before = snapshot()[index]
      monitors.group.updateMatrixWorld(true)
      const center = monitors.group.children[index].getWorldPosition(new THREE.Vector3()).project(probeCamera)
      const pointer = { ndc: new THREE.Vector2(center.x, center.y), strength: 1, aspect: 1.6, active: true }
      for (let frame = 0; frame < 60; frame++) monitors.update(time += 1 / 60, progress, pointer, probeCamera)
      const after = snapshot()[index]
      const selected = monitors.getHoveredPanel()
      for (let frame = 0; frame < 90; frame++) monitors.update(time += 1 / 60, progress)
      return { index, before, after, restored: snapshot()[index], selected }
    })

    // Raycast the REAL production chain and card geometry along projected card
    // samples. Bounding-box Z alone would not prove camera-space occlusion.
    worlds ??= createSceneWorlds(worldScene, true, false, undefined, worldFilm)
    const chain = worldScene.getObjectByName('aether-spine-chain')
    if (!(chain instanceof THREE.InstancedMesh)) throw new Error('Missing production chain')
    const raycaster = new THREE.Raycaster()
    const chainDepth = [.367, .431, .495, .559, .623].map((progress, index) => {
      const state = sampleJourney(progress)
      probeCamera.position.set(Math.sin(state.azimuth) * Math.cos(state.elevation) * state.radius,
        state.height + Math.sin(state.elevation) * state.radius,
        Math.cos(state.azimuth) * Math.cos(state.elevation) * state.radius)
      probeCamera.lookAt(0, state.height, 0)
      probeCamera.updateMatrixWorld()
      worlds!.update(time, progress)
      worldScene.updateMatrixWorld(true)
      chain.computeBoundingSphere()
      const panel = worldScene.getObjectByName(`aether-monitor-${index + 1}`)
      if (!(panel instanceof THREE.Mesh)) throw new Error('Missing production monitor')
      let overlaps = 0, inFront = 0, minimumGap = Infinity
      for (let row = 0; row < 33; row++) for (let column = 0; column < 49; column++) {
        const point = panel.localToWorld(new THREE.Vector3((column / 48 - .5) * 5.5, (row / 32 - .5) * 3.3, .035)).project(probeCamera)
        raycaster.setFromCamera(new THREE.Vector2(point.x, point.y), probeCamera)
        const cardHit = raycaster.intersectObject(panel, false)[0]
        const chainHit = raycaster.intersectObject(chain, false)[0]
        if (!cardHit || !chainHit) continue
        overlaps++
        const gap = chainHit.distance - cardHit.distance
        minimumGap = Math.min(minimumGap, gap)
        if (gap > 0) inFront++
      }
      return { progress, overlaps, inFront, minimumGap: Number.isFinite(minimumGap) ? minimumGap : null }
    })
    return { scroll, hover, chainDepth }
  } finally { monitors.dispose() }
}

function probeMonitorOcclusion() {
  const monitors = createSceneMonitors(true, false)
  const occlusionScene = new THREE.Scene()
  const occluders = new THREE.Group()
  const probeCamera = new THREE.PerspectiveCamera(42, 1.6, .1, 90)
  probeCamera.position.set(0, 0, 12)
  probeCamera.lookAt(0, 0, 0)
  probeCamera.updateMatrixWorld()
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const opaque = new THREE.MeshBasicMaterial()
  const blocker = new THREE.Mesh(boxGeometry, opaque)
  const particles = new THREE.Points(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute([0, 0, 5], 3)), new THREE.PointsMaterial())
  const instances = new THREE.InstancedMesh(boxGeometry, opaque, 1)
  const matrix = new THREE.Matrix4()
  const ndc = new THREE.Vector2()
  const pick = () => monitors.pick(ndc, probeCamera)
  occlusionScene.add(monitors.group, occluders)
  occluders.add(blocker)
  monitors.update(1, .367)
  monitors.group.updateMatrixWorld(true)
  const panelCenter = monitors.group.children[1].getWorldPosition(new THREE.Vector3())
  const projected = panelCenter.clone().project(probeCamera)
  ndc.set(projected.x, projected.y)
  const rayPoint = (z: number) => probeCamera.position.clone().lerp(panelCenter,
    (z - probeCamera.position.z) / (panelCenter.z - probeCamera.position.z))
  const blockingPoint = rayPoint(5)
  blocker.position.copy(blockingPoint)
  particles.geometry.attributes.position.setXYZ(0, blockingPoint.x, blockingPoint.y, blockingPoint.z)
  monitors.setOccluders([occluders])
  try {
    const foreground = pick()
    monitors.update(2, .367, { ndc, strength: 1, aspect: 1.6, active: true }, probeCamera)
    const hovered = monitors.getHoveredPanel()
    const ignored: (number | null)[] = []
    occluders.visible = false; ignored.push(pick()); occluders.visible = true
    blocker.visible = false; ignored.push(pick()); blocker.visible = true
    opaque.visible = false; ignored.push(pick()); opaque.visible = true
    opaque.depthWrite = false; ignored.push(pick()); opaque.depthWrite = true
    opaque.transparent = true; opaque.opacity = .5; ignored.push(pick()); opaque.opacity = 1
    blocker.position.copy(rayPoint(-4)); ignored.push(pick())
    blocker.position.set(20, 0, 5)
    let offRayCasts = 0
    const raycast = blocker.raycast
    blocker.raycast = function (...args) { offRayCasts++; raycast.apply(this, args) }
    ignored.push(pick())
    occluders.remove(blocker)
    occluders.add(particles)
    monitors.setOccluders([occluders])
    ignored.push(pick())
    occluders.add(instances)
    monitors.setOccluders([occluders])
    const instancePicks = [20, blockingPoint.x, 20].map(x => {
      instances.setMatrixAt(0, matrix.makeTranslation(x, blockingPoint.y, blockingPoint.z))
      instances.instanceMatrix.needsUpdate = true
      return pick()
    })
    // The actual world registrations must still allow a visible production card.
    worlds ??= createSceneWorlds(worldScene, true, false, undefined, worldFilm)
    const state = sampleJourney(.4)
    probeCamera.position.set(Math.sin(state.azimuth) * state.radius * Math.cos(state.elevation),
      state.height + Math.sin(state.elevation) * state.radius,
      Math.cos(state.azimuth) * state.radius * Math.cos(state.elevation))
    probeCamera.lookAt(0, state.height, 0)
    probeCamera.updateMatrixWorld()
    worlds.update(10, .4)
    worldScene.updateMatrixWorld(true)
    const productionCenter = worldScene.getObjectByName('aether-monitor-1')!.getWorldPosition(new THREE.Vector3()).project(probeCamera)
    const visibleProduction = worlds.getMonitorHit(new THREE.Vector2(productionCenter.x, productionCenter.y), probeCamera)
    return { foreground, hovered, ignored, offRayCasts, instancePicks, visibleProduction }
  } finally {
    monitors.dispose()
    instances.dispose()
    particles.geometry.dispose()
    particles.material.dispose()
    boxGeometry.dispose()
    opaque.dispose()
    occlusionScene.clear()
  }
}

function probeMonitorCapture(pixelRatio: number, usePreviousTarget: boolean) {
  const monitors = createSceneMonitors(false, false)
  const captureScene = new THREE.Scene()
  const probe = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
  captureScene.add(probe, monitors.group)
  monitors.update(0, .4)
  const previousTarget = usePreviousTarget ? new THREE.WebGLRenderTarget(96, 80) : null
  if (previousTarget) {
    previousTarget.viewport.set(4, 6, 72, 60)
    previousTarget.scissor.set(5, 7, 68, 56)
    previousTarget.scissorTest = true
  }
  const saved = {
    target: renderer.getRenderTarget(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(),
    pixelRatio: renderer.getPixelRatio(),
    autoClear: renderer.autoClear,
    xrEnabled: renderer.xr.enabled,
    render: renderer.render,
  }
  const gl = renderer.getContext()
  const snapshot = () => ({
    targetRestored: renderer.getRenderTarget() === previousTarget,
    viewport: renderer.getViewport(new THREE.Vector4()).toArray(),
    currentViewport: renderer.getCurrentViewport(new THREE.Vector4()).toArray(),
    glViewport: Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array),
    glScissor: Array.from(gl.getParameter(gl.SCISSOR_BOX) as Int32Array),
    glScissorTest: gl.isEnabled(gl.SCISSOR_TEST),
    pixelRatio: renderer.getPixelRatio(),
    autoClear: renderer.autoClear,
    xrEnabled: renderer.xr.enabled,
    visible: monitors.group.visible,
  })
  const backgroundFlags = () => monitors.group.children.map((panel) =>
    ((panel as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uHasBackground.value as number,
  )
  const observed: {
    targetSize: number[]
    glViewport: number[]
    currentViewport: number[]
    visible: boolean
    autoClear: boolean
    xrEnabled: boolean
  }[] = []
  // Observe actual WebGL state inside the real draw, after capture selects its
  // target. Computing the expected dimensions alone would miss double DPR.
  probe.onBeforeRender = (activeRenderer) => {
    const activeTarget = activeRenderer.getRenderTarget()
    observed.push({
      targetSize: activeTarget ? [activeTarget.width, activeTarget.height] : [],
      glViewport: Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array),
      currentViewport: activeRenderer.getCurrentViewport(new THREE.Vector4()).toArray(),
      visible: monitors.group.visible,
      autoClear: activeRenderer.autoClear,
      xrEnabled: activeRenderer.xr.enabled,
    })
  }
  try {
    renderer.setRenderTarget(null)
    renderer.setPixelRatio(pixelRatio)
    renderer.setViewport(8, 10, 320, 240)
    renderer.setScissor(10, 12, 300, 220)
    renderer.setScissorTest(true)
    renderer.setRenderTarget(previousTarget)
    renderer.autoClear = false
    renderer.xr.enabled = true
    const before = snapshot()
    monitors.capture(renderer, captureScene, camera)
    const success = {
      before, after: snapshot(), observed: [...observed],
      refraction: String(monitors.group.userData.refraction),
      backgroundFlags: backgroundFlags(),
    }
    const captureAt = (name: string, progress: number, scheduled: boolean, x = 0, indirect = false) => {
      monitors.update(10, progress)
      monitors.group.position.x = x
      const count = observed.length
      monitors.capture(renderer, captureScene, camera, scheduled, indirect)
      return { name, draws: observed.length - count, groupVisible: monitors.group.visible }
    }
    const visibility = [
      captureAt('visible-unscheduled', .4, false),
      captureAt('closed-entry', .24, true),
      captureAt('entry-first-unscheduled', .4, false),
      captureAt('visible-unscheduled-again', .4, false),
      captureAt('visible-scheduled', .4, true),
      captureAt('closed-exit', .69, true),
      captureAt('reverse-first-unscheduled', .4, false),
      captureAt('offscreen', .4, true, 200),
      captureAt('indirect-reflection', .4, false, 200, true),
      captureAt('offscreen-again', .4, true, 200),
      captureAt('frustum-reentry-unscheduled', .4, false),
    ]
    // Fail after a valid capture, proving that stale render-target textures are
    // replaced by the fallback and a failed capture is not retried every frame.
    let failureAttempts = 0
    renderer.render = () => {
      failureAttempts++
      throw new Error('Intentional monitor capture failure')
    }
    monitors.capture(renderer, captureScene, camera)
    const failure = {
      after: snapshot(),
      refraction: String(monitors.group.userData.refraction),
      backgroundFlags: backgroundFlags(),
    }
    monitors.capture(renderer, captureScene, camera)
    return { ...success, visibility, failure: { ...failure, attempts: failureAttempts } }
  } finally {
    renderer.render = saved.render
    renderer.setRenderTarget(null)
    renderer.setPixelRatio(saved.pixelRatio)
    renderer.setViewport(saved.viewport)
    renderer.setScissor(saved.scissor)
    renderer.setScissorTest(saved.scissorTest)
    renderer.setRenderTarget(saved.target)
    renderer.autoClear = saved.autoClear
    renderer.xr.enabled = saved.xrEnabled
    monitors.dispose()
    previousTarget?.dispose()
    probe.geometry.dispose()
    probe.material.dispose()
    captureScene.clear()
  }
}

function probeWaterCaptureVisibility() {
  const waterScene = new THREE.Scene()
  const floorGeometry = new THREE.PlaneGeometry(8, 8)
  const reflector = new Reflector(floorGeometry, { textureWidth: 64, textureHeight: 64, multisample: 0 })
  const water = createWaterSurface(reflector, 8, 8)
  water.surface.position.y = -1
  water.surface.rotation.x = -Math.PI / 2
  waterScene.add(water.surface)
  const bounds = createCurtainBounds()
  bindGroupCurtain(water.surface, bounds)
  const mainCamera = new THREE.PerspectiveCamera(42, 4 / 3, .1, 50)
  mainCamera.position.set(0, 1, 5)
  mainCamera.lookAt(0, -1, 0)
  mainCamera.updateMatrixWorld()
  const overheadCamera = new THREE.PerspectiveCamera(42, 4 / 3, .1, 50)
  overheadCamera.position.set(0, 8, .01)
  overheadCamera.lookAt(0, -1, 0)
  overheadCamera.updateMatrixWorld()
  const target = new THREE.WebGLRenderTarget(128, 96)
  const saved = { render: renderer.render, target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(), autoClear: renderer.autoClear }
  let reflectedFrames = 0
  renderer.render = function (...args) {
    if (this.getRenderTarget() === reflector.getRenderTarget()) reflectedFrames++
    saved.render.apply(this, args)
  }
  const draw = (name: string, upper: number, lower: number, view = mainCamera) => {
    bounds.upper.value = upper
    bounds.lower.value = lower
    // The update camera stays fixed while the actual render camera may differ.
    // Reflection eligibility must follow that real pass, not cached main UVs.
    water.update(10 + reflectedFrames, .7, 1, true, mainCamera, { upper, lower })
    const before = reflectedFrames
    renderer.setRenderTarget(target)
    renderer.render(waterScene, view)
    return { name, reflected: reflectedFrames - before, visible: water.surface.visible }
  }
  try {
    renderer.autoClear = true
    return [draw('open', 1.5, -.5), draw('closed', -.25, -.5),
      draw('open-reentry', 1.5, -.5), draw('open-moving-light', 1.5, -.5),
      draw('surface-below-band', 1.2, .9), draw('other-camera-sees-band', 1.2, .9, overheadCamera),
      draw('open-reverse', 1.5, -.5)]
  } finally {
    renderer.render = saved.render
    renderer.setRenderTarget(saved.target, saved.face, saved.mip)
    renderer.autoClear = saved.autoClear
    water.dispose()
    reflector.dispose()
    floorGeometry.dispose()
    target.dispose()
    waterScene.clear()
  }
}

window.interactionHarness = {
  step(seconds) {
    const { yaw, pitch, zoom, burst } = advanceInteraction(seconds)
    renderer.render(scene, camera)
    const gl = renderer.getContext()
    gl.readPixels(0, 0, innerWidth, innerHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let illuminatedPixels = 0
    let rightmostPixel = -1
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 30) {
        illuminatedPixels++
        rightmostPixel = Math.max(rightmostPixel, (i / 4) % innerWidth)
      }
    }
    return { yaw, pitch, zoom, burst, illuminatedPixels, rightmostPixel }
  },
  reset(reducedMotion = false) {
    interaction.dispose()
    time = 0
    interaction = createSceneInteraction(scene, camera, canvas, reducedMotion, true)
  },
  setOrbitEnabled(enabled) {
    interaction.setOrbitEnabled(enabled)
  },
  sampleJourney,
  sampleLayers,
  sampleEditorial,
  stepField,
  probeCurtainPixels,
  probeEmblemCurtainPixels,
  probeWorldSurfaceDepth,
  probeProductionBoundaryPixels,
  probeOutgoingBonePixels,
  probeScalePointer,
  probeScaleBubbles,
  probeDevicePointer,
  probeForestPointer,
  probeMonitorCapture,
  probeWaterCaptureVisibility,
  probeMonitorOcclusion,
  probeMonitorMotion,
  probePointerForestPixels,
  sampleWorld(elapsed, progress) {
    worlds ??= createSceneWorlds(worldScene, true, false, undefined, worldFilm)
    worlds.update(elapsed, progress)
    worldScene.updateMatrixWorld(true)
    const chain = worldScene.getObjectByName('aether-spine-chain')
    const vertebrae = worldScene.getObjectByName('aether-spine-vertebrae')
    const monitors = worldScene.getObjectByName('aether-monitors')
    const matter = worldScene.getObjectByName('aether-matter')
    const bone = worldScene.getObjectByName('aether-spine-assembly')
    const chamber = worldScene.getObjectByName('aether-chamber-space')
    const machine = worldScene.getObjectByName('aether-machine-assembly')
    const floor = worldScene.getObjectByName('aether-separating-floor')
    const scales = worldScene.getObjectByName('aether-scale-wall')
    const tiles = worldScene.getObjectByName('aether-scale-tiles')
    if (!(chain instanceof THREE.InstancedMesh) || !(vertebrae instanceof THREE.InstancedMesh)
      || !(tiles instanceof THREE.InstancedMesh) || !machine || !floor || !scales
      || !monitors || !matter || !chamber || !bone)
      throw new Error('The real spine, chain, monitors, matter, and chamber must be present')
    const modelY = matter.getWorldPosition(worldPosition).y
    const chamberY = chamber.getWorldPosition(worldPosition).y
    return {
      chain: Array.from(chain.instanceMatrix.array),
      vertebrae: Array.from(vertebrae.instanceMatrix.array),
      monitors: monitors.children.map(panel => panel.matrix.toArray()),
      modelY,
      chamberY,
      structureYaw: matter.rotation.y,
      boneLocalY: bone.position.y,
      boneWorldY: bone.getWorldPosition(worldPosition).y,
      boneVisible: matter.visible && bone.visible,
      fixed: {
        machineY: machine.getWorldPosition(worldPosition).y,
        floorY: floor.getWorldPosition(worldPosition).y,
        scaleY: scales.getWorldPosition(worldPosition).y,
        machineVisible: machine.visible,
        scaleVisible: scales.visible,
      },
      scaleTiles: Array.from(tiles.instanceMatrix.array),
    }
  },
  dispose() {
    interaction.dispose()
    worlds?.dispose()
    worldFilmTexture.dispose()
    editorial?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  },
}
