import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createSpineAssembly } from '../src/SceneSpine'

// Offline source for the aperture film: only Aether geometry and materials.
// It is never imported by the runtime bundle and creates no runtime render pass.
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(256, 160)
renderer.toneMapping = THREE.ACESFilmicToneMapping
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x010204)
const environment = new RoomEnvironment()
const pmrem = new THREE.PMREMGenerator(renderer)
const target = pmrem.fromScene(environment)
scene.environment = target.texture
const spine = createSpineAssembly(false, false)
scene.add(spine.group)
spine.group.getObjectByName('aether-spine-chain')!.visible = false
const camera = new THREE.PerspectiveCamera(43, 256 / 160, .1, 50)
camera.position.set(0, .4, 4.3)
camera.lookAt(0, 0, 0)
const key = new THREE.DirectionalLight(0xd8eaff, 5)
key.position.set(-3, 2, 4)
const rim = new THREE.DirectionalLight(0xdc76db, 3)
rim.position.set(3, -1, 1)
scene.add(key, rim)
export function frame(second: number) {
  const phase = (second % 14) / 14 * Math.PI * 2
  spine.update(.4 + Math.sin(phase) * .025, 1, 1)
  spine.group.rotation.set(.1 * Math.sin(phase), phase, -.1)
  spine.group.position.y = Math.sin(phase) * .35
  const pulse = Math.pow(.5 + .5 * Math.cos(phase - 1.3), 3)
  scene.environmentIntensity = .10 + pulse * 1.8
  key.intensity = .3 + pulse * 8
  rim.intensity = .1 + Math.pow(.5 + .5 * Math.sin(phase), 3) * 4
  key.position.x = Math.sin(phase) * 4
  renderer.toneMappingExposure = .40 + pulse * 1.4
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL('image/png').split(',')[1]
}
export function dispose() {
  spine.dispose(); target.dispose(); pmrem.dispose(); environment.dispose(); renderer.dispose()
}
