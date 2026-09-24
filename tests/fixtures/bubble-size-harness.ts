import * as THREE from 'three'
import { createScaleBubbles } from '../../src/SceneScaleBubbles'

export function probeBubbleSize(ratio: number, passScale: number) {
  const renderer = new THREE.WebGLRenderer({ alpha: true })
  renderer.setPixelRatio(ratio)
  renderer.setSize(64, 64)
  const bubbles = createScaleBubbles(false, false)
  // One close, large bubble exercises the production size cap.
  bubbles.geometry.setDrawRange(0, 1)
  bubbles.geometry.getAttribute('position').setXYZ(0, 0, 0, 0)
  bubbles.geometry.getAttribute('aBubbleSeed').setX(0, 1)
  bubbles.material.uniforms.uOpacity.value = 1
  const camera = new THREE.PerspectiveCamera(5, 1, .1, 20)
  camera.position.z = 3
  const scene = new THREE.Scene()
  scene.add(bubbles.points)
  const size = Math.round(64 * ratio * passScale)
  const target = new THREE.WebGLRenderTarget(size, size)
  try {
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    const pixels = new Uint8Array(size * size * 4)
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)
    let low = size, high = -1
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3] > 2) { low = Math.min(low, x); high = Math.max(high, x) }
    }
    return (high - low + 1) / (ratio * passScale)
  } finally {
    bubbles.geometry.dispose(); bubbles.material.dispose(); target.dispose()
    renderer.dispose(); renderer.forceContextLoss()
  }
}
