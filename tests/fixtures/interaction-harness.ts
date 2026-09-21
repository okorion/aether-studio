import * as THREE from 'three'
import { createSceneInteraction } from '../../src/SceneInteraction'
import { createSceneWorlds } from '../../src/SceneWorlds'
import { createSceneMonitors } from '../../src/SceneMonitors'
import { sampleJourney } from '../../src/Journey'

type Snapshot = {
  yaw: number
  pitch: number
  zoom: number
  burst: number
  illuminatedPixels: number
}

export type InteractionHarness = {
  step: (seconds: number) => Snapshot
  reset: (reducedMotion?: boolean) => void
  setOrbitEnabled: (enabled: boolean) => void
  sampleJourney: typeof sampleJourney
  probeMonitorCapture: typeof probeMonitorCapture
  sampleWorld: (elapsed: number, progress: number) => {
    chain: number[]
    vertebrae: number[]
    monitors: number[][]
    modelY: number
    chamberY: number
    structureYaw: number
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
    const steps = Math.max(1, Math.ceil(seconds / 0.05))
    let output = { yaw: 0, pitch: 0, zoom: 0, burst: 0 }
    for (let i = 0; i < steps; i++) {
      time += seconds / steps
      output = interaction.update(seconds / steps, time, 1)
    }
    renderer.render(scene, camera)
    const gl = renderer.getContext()
    gl.readPixels(0, 0, innerWidth, innerHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let illuminatedPixels = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 30) illuminatedPixels++
    }
    return { ...output, illuminatedPixels }
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
  probeMonitorCapture,
  sampleWorld(elapsed, progress) {
    worlds ??= createSceneWorlds(worldScene, true)
    worlds.update(elapsed, progress)
    worldScene.updateMatrixWorld(true)
    const chain = worldScene.getObjectByName('aether-spine-chain')
    const vertebrae = worldScene.getObjectByName('aether-spine-vertebrae')
    const monitors = worldScene.getObjectByName('aether-monitors')
    const matter = worldScene.getObjectByName('aether-matter')
    const chamber = worldScene.getObjectByName('aether-chamber-space')
    if (!(chain instanceof THREE.InstancedMesh) || !(vertebrae instanceof THREE.InstancedMesh)
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
    }
  },
  dispose() {
    interaction.dispose()
    worlds?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  },
}
