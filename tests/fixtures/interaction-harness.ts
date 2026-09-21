import * as THREE from 'three'
import { createSceneInteraction } from '../../src/SceneInteraction'

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
  dispose() {
    interaction.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  },
}
