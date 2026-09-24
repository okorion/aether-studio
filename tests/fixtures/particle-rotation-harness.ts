import * as THREE from 'three'
import { createAtmosphere } from '../../src/Atmosphere'
import { createSceneWorlds } from '../../src/SceneWorlds'

export function sampleRotation(progress = .4, mobile = false) {
  const scene = new THREE.Scene()
  const worlds = createSceneWorlds(scene, true, mobile)
  const matter = scene.getObjectByName('aether-matter')!
  const atmosphere = createAtmosphere(scene, true, mobile)
  const grains = scene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(1, 1)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType })
  const camera = new THREE.PerspectiveCamera()
  camera.position.z = 20
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([.25, 1.2, .3], 3))
  geometry.setAttribute('aDust', new THREE.Float32BufferAttribute([.3, 1, .2, 0], 4))
  geometry.setAttribute('aAdvected', new THREE.Float32BufferAttribute([0], 1))
  // Execute the production vertex shader, then read its local position from
  // a float pixel. No duplicated CPU field equations stand in for the shader.
  const vertex = grains.material.vertexShader.replace(/}\s*$/, 'probePosition = p; gl_Position = vec4(0., 0., 0., 1.); gl_PointSize = 1.; }')
  const material = new THREE.ShaderMaterial({
    uniforms: grains.material.uniforms,
    vertexShader: 'varying vec3 probePosition;\n' + vertex,
    fragmentShader: 'varying vec3 probePosition; void main() { gl_FragColor = vec4(probePosition, 1.); }',
    depthTest: false, depthWrite: false,
  })
  const probe = new THREE.Scene()
  const point = new THREE.Points(geometry, material)
  point.frustumCulled = false
  probe.add(point)
  const read = (progress: number, moving = false) => {
    atmosphere.update(10, progress, 1)
    geometry.getAttribute('position').setX(0, .25)
    geometry.getAttribute('position').needsUpdate = true
    geometry.getAttribute('aAdvected').setX(0, moving ? 1 : 0)
    geometry.getAttribute('aAdvected').needsUpdate = true
    renderer.setRenderTarget(target)
    renderer.render(probe, camera)
    const pixel = new Float32Array(4)
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel)
    return Array.from(pixel)
  }
  try {
    const start = read(progress)
    worlds.update(10, progress)
    matter.updateMatrix()
    const inverseStart = matter.matrix.clone().invert()
    worlds.update(10, progress + .015)
    matter.updateMatrix()
    const expected = new THREE.Vector3(...start.slice(0, 3) as [number, number, number])
      .applyMatrix4(inverseStart).applyMatrix4(matter.matrix).toArray()
    const anchorStart = grains.position.y
    const end = read(progress + .015)
    const anchorEnd = grains.position.y
    atmosphere.update(10, .64, 1)
    const outgoingY = scene.getObjectByName('aether-outgoing-bone-current')!.position.y
    return { start, expected, end, anchors: [anchorStart, anchorEnd, outgoingY],
      movingStart: read(progress, true), moving: read(progress + .015, true),
      movingReverse: read(progress, true), reverse: read(progress) }
  } finally {
    worlds.dispose(); atmosphere.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose()
  }
}
