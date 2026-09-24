import * as THREE from 'three'
import { createSceneForest } from '../../src/SceneForest'

/** Read projected soil positions from the actual production vertex shader. */
export function probeForestGround(lower: boolean) {
  const scene = new THREE.Scene()
  const forest = createSceneForest(scene, true, false)
  const grove = scene.getObjectByName(lower ? 'aether-forest-lower' : 'aether-forest-upper')!
  const ground = grove.getObjectByName('aether-forest-boundary-plants-motes-mist') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 100)
  const height = lower ? -54 : -7.5
  camera.position.set(0, height, 12); camera.lookAt(0, height, 0); camera.updateMatrixWorld()
  forest.update(10, lower ? .9 : .14, camera)
  scene.updateMatrixWorld(true)
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(1, 1)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType })
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'aSeed', 'aSize', 'aKind']) {
    const a = ground.geometry.getAttribute(name)
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(Array.from(a.array).slice(0, a.itemSize), a.itemSize))
  }
  const material = new THREE.ShaderMaterial({
    uniforms: ground.material.uniforms,
    vertexShader: ground.material.vertexShader.replace(/}\s*$/, 'gl_Position=vec4(0.,0.,0.,1.);gl_PointSize=1.;}'),
    fragmentShader: 'varying vec4 vClip; varying vec3 vWorld; void main(){gl_FragColor=vec4(vClip.xy/vClip.w,vWorld.y,1.);}',
    depthWrite: false, depthTest: false,
  })
  const point = new THREE.Points(geometry, material)
  point.matrixAutoUpdate = false; point.matrix.copy(ground.matrixWorld); point.frustumCulled = false
  const probe = new THREE.Scene(); probe.add(point)
  const read = () => {
    renderer.setRenderTarget(target); renderer.render(probe, camera)
    const pixels = new Float32Array(4); renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixels)
    return Array.from(pixels)
  }
  try {
    const initial = read()
    material.uniforms.uExit.value = .73; material.uniforms.uEntry.value = .21
    const wrapperMoved = read()
    camera.position.x = 4; camera.lookAt(0, height, 0); camera.updateMatrixWorld()
    const cameraMoved = read()
    camera.position.x = 0; camera.lookAt(0, height, 0); camera.updateMatrixWorld()
    return { initial, wrapperMoved, cameraMoved, restored: read() }
  } finally {
    forest.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose(); renderer.forceContextLoss()
  }
}
