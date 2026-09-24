import * as THREE from 'three'
import { createSceneEmblem, type EmblemVariant } from '../../src/SceneEmblem'
import { createLightFilmUniforms } from '../../src/SceneLighting'

/** Uses the production materials/capture, including a transparent film-like backdrop. */
export function probeEmblemMaterial(variant: EmblemVariant, mobile: boolean) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
  renderer.setSize(320, 200)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const errors: string[] = []
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    errors.push(gl.getProgramInfoLog(program) ?? '', gl.getShaderInfoLog(vertex) ?? '', gl.getShaderInfoLog(fragment) ?? '')
  }
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0e2430)
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 90)
  camera.position.z = 4.8
  const light = new THREE.DirectionalLight(0xe6fbff, 4)
  light.position.set(-2, 3, 4)
  scene.add(light, new THREE.AmbientLight(0x8cb7c4, .3))
  const background = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({
    color: 0x194552, transparent: true, opacity: 1,
  }))
  background.position.z = -3
  scene.add(background)
  const filmTexture = new THREE.DataTexture(new Uint8Array([80, 160, 224, 255]), 1, 1)
  filmTexture.needsUpdate = true
  const film = createLightFilmUniforms(filmTexture)
  film.ready.value = 1
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xc9e4da, metalness: 1, roughness: .16 })
  const darkChrome = new THREE.MeshPhysicalMaterial({ color: 0x3d686b, metalness: 1, roughness: .22 })
  const emblem = createSceneEmblem({ variant, software: false, mobile, silver: { chrome, darkChrome }, film })
  const gl = renderer.getContext()
  const read = () => {
    const pixels = new Uint8Array(320 * 200 * 4)
    gl.readPixels(0, 0, 320, 200, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels
  }
  try {
    renderer.render(scene, camera)
    const before = read()
    scene.add(emblem.group)
    emblem.update(12, 0)
    emblem.prepare(renderer)
    emblem.capture(renderer, scene, camera)
    renderer.render(scene, camera)
    const after = read()
    let changed = 0
    for (let i = 0; i < after.length; i += 4) {
      if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) > 12) changed++
    }
    return { errors, programs: renderer.info.programs?.length ?? 0, changed, status: emblem.getStatus() }
  } finally {
    emblem.dispose(); filmTexture.dispose(); chrome.dispose(); darkChrome.dispose()
    background.geometry.dispose(); background.material.dispose()
    renderer.dispose(); renderer.forceContextLoss()
  }
}
