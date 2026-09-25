import * as THREE from 'three'
import { createAtmosphere } from '../../src/Atmosphere'
import { createSceneWorlds } from '../../src/SceneWorlds'
import { createFlowerAttributes } from '../../src/FlowerGeometry'

export function sampleRotation(progress = .4, mobile = false, lane = .3, heightSeed = .27) {
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
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([heightSeed, 1.43, .3], 3))
  geometry.setAttribute('aDust', new THREE.Float32BufferAttribute([lane, 1, .2, 0], 4))
  geometry.setAttribute('aAdvected', new THREE.Float32BufferAttribute([0], 1))
  const flowers = createFlowerAttributes(new Float32Array([heightSeed, 1.43, .3]), new Float32Array([lane, 1, .2, 0]), new Float32Array([0]))
  geometry.setAttribute('aFlowerPosition', new THREE.BufferAttribute(flowers.positions, 4))
  geometry.setAttribute('aFlowerNormal', new THREE.BufferAttribute(flowers.normals, 3))
  geometry.setAttribute('aFlowerColor', new THREE.BufferAttribute(flowers.colors, 3))
  // Execute the production vertex shader, then read its local position from
  // a float pixel. No duplicated CPU field equations stand in for the shader.
  const vertex = grains.material.vertexShader.replace(/}\s*$/, 'probePosition = p; gl_Position = vec4(0., 0., 0., 1.); gl_PointSize = 1.; }')
  const material = new THREE.ShaderMaterial({
    uniforms: grains.material.uniforms,
    vertexShader: 'varying vec3 probePosition;\n' + vertex,
    fragmentShader: 'varying vec3 probePosition; varying float vAlpha; void main() { gl_FragColor = vec4(probePosition, vAlpha); }',
    depthTest: false, depthWrite: false,
  })
  const probe = new THREE.Scene()
  const point = new THREE.Points(geometry, material)
  point.frustumCulled = false
  probe.add(point)
  const read = (progress: number, moving = false, time = 10, bokeh = false, phase = 1.43) => {
    atmosphere.update(time, progress, 1)
    const flower = lane === .3 && !moving && !bokeh && progress < .6
    material.defines = flower ? { FLOWER_SURFACE: 1 } : {}
    material.needsUpdate = true
    geometry.getAttribute('position').setY(0, phase)
    geometry.getAttribute('position').needsUpdate = true
    geometry.getAttribute('aDust').setW(0, bokeh ? 1 : 0)
    geometry.getAttribute('aDust').needsUpdate = true
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
      movingReverse: read(progress, true), reverse: read(progress),
      idle: read(progress, false, 18), idleReverse: read(progress, false, 10),
      movingIdle: read(progress, true, 18), bokeh: read(progress, false, 10, true),
      thinned: read(progress, false, 10, false, 1.2),
      reactorMoving: read(.71, true), reactorBokeh: read(.71, false, 10, true),
      forestMoving: read(.065, true), forestBokeh: read(.065, false, 10, true) }
  } finally {
    worlds.dispose(); atmosphere.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose()
  }
}
