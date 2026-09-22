import * as THREE from 'three'
import { createSceneInteraction } from '../../src/SceneInteraction'
import { createSceneWorlds } from '../../src/SceneWorlds'
import { createSceneMonitors } from '../../src/SceneMonitors'
import { createAtmosphere } from '../../src/Atmosphere'
import { createSceneForest } from '../../src/SceneForest'
import { sampleJourney } from '../../src/Journey'
import { createSceneLayers, sampleLayers } from '../../src/SceneLayers'
import { bindCurtain, createCurtainBounds } from '../../src/SceneCurtains'

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
  probeScalePointer: typeof probeScalePointer
  probeDevicePointer: typeof probeDevicePointer
  probeForestPointer: typeof probeForestPointer
  probeMonitorCapture: typeof probeMonitorCapture
  probeMonitorOcclusion: typeof probeMonitorOcclusion
  sampleWorld: (elapsed: number, progress: number) => {
    chain: number[]
    vertebrae: number[]
    monitors: number[][]
    modelY: number
    chamberY: number
    structureYaw: number
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
  return { yaw, pitch, ndc: field.ndc.toArray(), strength: field.strength, aspect: field.aspect, flowEnergy }
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

function probeScalePointer() {
  const modelScene = new THREE.Scene()
  const assembly = createSceneWorlds(modelScene, true)
  const probeScene = new THREE.Scene()
  const probeCamera = new THREE.PerspectiveCamera(42, 4 / 3, .1, 60)
  probeCamera.position.set(0, -48, 10)
  probeCamera.lookAt(0, -48, 0)
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
  const target = new THREE.WebGLRenderTarget(160, 120)
  const previousTarget = renderer.getRenderTarget()
  const previousAutoClear = renderer.autoClear
  const draw = (x: number, strength: number) => {
    assembly.update(10, .83, { ndc: new THREE.Vector2(x, 0), strength, aspect: 4 / 3 }, probeCamera)
    renderer.setRenderTarget(target)
    renderer.render(probeScene, probeCamera)
    const image = new Uint8Array(160 * 120 * 4)
    renderer.readRenderTargetPixels(target, 0, 0, 160, 120, image)
    return image
  }
  const difference = (a: Uint8Array, b: Uint8Array) => {
    let changed = 0, weight = 0, horizontal = 0
    for (let i = 0; i < a.length; i += 4) {
      const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      if (delta > 12) {
        changed++
        weight += delta
        horizontal += ((i / 4) % 160) / 160 * delta
      }
    }
    return { changed, centroidX: weight ? horizontal / weight : -1 }
  }
  try {
    renderer.autoClear = true
    const baseline = draw(0, 0)
    const left = draw(-.4, 1)
    const right = draw(.4, 1)
    const reset = draw(.4, 0)
    return {
      left: difference(baseline, left), right: difference(baseline, right),
      reset: difference(baseline, reset),
      matricesUnchanged: originalMatrices.every((value, index) => value === tiles.instanceMatrix.array[index]),
    }
  } finally {
    renderer.setRenderTarget(previousTarget)
    renderer.autoClear = previousAutoClear
    probeScene.clear()
    assembly.dispose()
    target.dispose()
  }
}

function probeDevicePointer() {
  const width = 320, height = 200, progress = .72, elapsed = 10
  const probeScene = new THREE.Scene()
  const atmosphere = createAtmosphere(probeScene, false, false)
  const particles = probeScene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const initialSeeds = new Float32Array(particles.geometry.attributes.position.array)
  const state = sampleJourney(progress)
  const probeCamera = new THREE.PerspectiveCamera(42, width / height, .1, 90)
  probeCamera.position.set(
    Math.sin(state.azimuth) * Math.cos(state.elevation) * state.radius,
    state.height + Math.sin(state.elevation) * state.radius,
    Math.cos(state.azimuth) * Math.cos(state.elevation) * state.radius,
  )
  probeCamera.lookAt(0, state.height, 0)
  probeCamera.updateMatrixWorld()
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
    return {
      illuminatedPixels, moved: difference(baseline, moved), restored: difference(baseline, restored),
      scrollSteps, fieldY: particles.position.y, pointer: pointer.ndc.toArray(),
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
  const flow=new THREE.DataTexture(new Uint8Array([128,128,0,255]),1,1)
  flow.needsUpdate=true
  const pointer={ndc:new THREE.Vector2(),strength:0,aspect:width/height,active:true,flowTexture:flow}
  forest.update(elapsed,progress,probeCamera,pointer,1);probeScene.updateMatrixWorld(true)
  const worldBefore=micro.matrixWorld.toArray()
  const target=new THREE.WebGLRenderTarget(width,height)
  const previous={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),
    clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),auto:renderer.autoClear}
  const render=(x:number,y:number,active=true)=>{
    flow.image.data[0]=Math.round(128+x*127);flow.image.data[1]=Math.round(128+y*127);flow.needsUpdate=true
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
  blocker.position.z = 5
  const particles = new THREE.Points(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute([0, 0, 5], 3)), new THREE.PointsMaterial())
  const instances = new THREE.InstancedMesh(boxGeometry, opaque, 1)
  const matrix = new THREE.Matrix4()
  const ndc = new THREE.Vector2()
  const pick = () => monitors.pick(ndc, probeCamera)
  occlusionScene.add(monitors.group, occluders)
  occluders.add(blocker)
  monitors.update(1, .367)
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
    blocker.position.z = -4; ignored.push(pick())
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
    const instancePicks = [20, 0, 20].map(x => {
      instances.setMatrixAt(0, matrix.makeTranslation(x, 0, 5))
      instances.instanceMatrix.needsUpdate = true
      return pick()
    })
    // The actual world registrations must still allow a visible production card.
    worlds ??= createSceneWorlds(worldScene, true)
    const state = sampleJourney(.4)
    probeCamera.position.set(Math.sin(state.azimuth) * state.radius * Math.cos(state.elevation),
      state.height + Math.sin(state.elevation) * state.radius,
      Math.cos(state.azimuth) * state.radius * Math.cos(state.elevation))
    probeCamera.lookAt(0, state.height, 0)
    probeCamera.updateMatrixWorld()
    worlds.update(10, .4)
    worldScene.updateMatrixWorld(true)
    const visibleProduction = worlds.getMonitorHit(new THREE.Vector2(420 / 1440 * 2 - 1, 1 - 380 / 900 * 2), probeCamera)
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
      before, after: snapshot(), observed,
      refraction: String(monitors.group.userData.refraction),
      backgroundFlags: backgroundFlags(),
    }
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
    return { ...success, failure: { ...failure, attempts: failureAttempts } }
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
  probeScalePointer,
  probeDevicePointer,
  probeForestPointer,
  probeMonitorCapture,
  probeMonitorOcclusion,
  sampleWorld(elapsed, progress) {
    worlds ??= createSceneWorlds(worldScene, true)
    worlds.update(elapsed, progress)
    worldScene.updateMatrixWorld(true)
    const chain = worldScene.getObjectByName('aether-spine-chain')
    const vertebrae = worldScene.getObjectByName('aether-spine-vertebrae')
    const monitors = worldScene.getObjectByName('aether-monitors')
    const matter = worldScene.getObjectByName('aether-matter')
    const chamber = worldScene.getObjectByName('aether-chamber-space')
    const machine = worldScene.getObjectByName('aether-machine-assembly')
    const floor = worldScene.getObjectByName('aether-separating-floor')
    const scales = worldScene.getObjectByName('aether-scale-wall')
    const tiles = worldScene.getObjectByName('aether-scale-tiles')
    if (!(chain instanceof THREE.InstancedMesh) || !(vertebrae instanceof THREE.InstancedMesh)
      || !(tiles instanceof THREE.InstancedMesh) || !machine || !floor || !scales
      || !monitors || !matter || !chamber)
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
    editorial?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  },
}
