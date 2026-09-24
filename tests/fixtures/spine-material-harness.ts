import * as THREE from 'three'
import { createSpineAssembly } from '../../src/SceneSpine'

// Exercise the physical material even when the browser uses software WebGL.
// The production quality fallback intentionally skips this shader branch.
export function probeSpineMaterial(mobile: boolean) {
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(64, 64)
  const errors: string[] = []
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'))
  }
  const scene = new THREE.Scene()
  const assembly = createSpineAssembly(false, mobile)
  scene.add(assembly.group, new THREE.HemisphereLight(0xffffff, 0x778899, 3))
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 100)
  camera.position.set(0, 0, 14)
  camera.lookAt(0, 0, 0)
  const target = new THREE.WebGLRenderTarget(64, 64)
  try {
    assembly.update(.4, 1, 1)
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    const pixels = new Uint8Array(64 * 64 * 4)
    renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels)
    const litPixels = Array.from({ length: 64 * 64 }, (_, i) => pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2]).filter(v => v > 0).length
    return { errors, litPixels, programs: renderer.info.programs?.length ?? 0 }
  } finally {
    assembly.dispose()
    target.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
