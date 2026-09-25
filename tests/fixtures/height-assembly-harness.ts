import * as THREE from 'three'
import { createAtmosphere } from '../../src/Atmosphere'
import { createSceneMonitors } from '../../src/SceneMonitors'
import { monitorCatalog } from '../../src/MonitorCatalog'
import { FLOWER_WORLD_Y } from '../../src/FlowerAssembly'
import { createSceneEmblem } from '../../src/SceneEmblem'
import { createLightFilmUniforms } from '../../src/SceneLighting'

export function probeHeightAssembly() {
  const scene = new THREE.Scene(), atmosphere = createAtmosphere(scene, true, false)
  const source = scene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const renderer = new THREE.WebGLRenderer(); renderer.setSize(1, 1)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType })
  const geometry = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(attribute.itemSize), attribute.itemSize))
  }
  geometry.getAttribute('position').setXYZ(0, .27, 1.43, .3)
  geometry.getAttribute('aDust').setXYZW(0, .3, 1, .2, -2)
  geometry.getAttribute('aFlowerNormal').setXYZ(0, 0, 1, 0)
  const material = new THREE.ShaderMaterial({ uniforms: source.material.uniforms,
    vertexShader: 'varying vec3 probePosition;\n' + source.material.vertexShader.replace(/}\s*$/,
      'probePosition = p; gl_Position = vec4(0.,0.,0.,1.); gl_PointSize = 1.; }'),
    fragmentShader: 'varying vec3 probePosition; void main(){gl_FragColor=vec4(probePosition,1.);}', depthTest: false })
  const probe = new THREE.Scene(), point = new THREE.Points(geometry, material)
  point.position.y = FLOWER_WORLD_Y; point.frustumCulled = false; probe.add(point)
  const camera = new THREE.PerspectiveCamera(); camera.position.z = 20
  const monitors = createSceneMonitors(true, false, undefined, [monitorCatalog[0]])
  const parent = new THREE.Group(); parent.position.y = FLOWER_WORLD_Y; parent.add(monitors.group)
  const read = (cameraY: number, localY: number, baseline = false, blocked = false) => {
    geometry.getAttribute('aFlowerPosition').setXYZW(0, 0, localY, blocked ? 3.53 : 1, 0)
    geometry.getAttribute('aFlowerPosition').needsUpdate = true
    geometry.getAttribute('aDust').setW(0, baseline ? -1 : -2)
    geometry.getAttribute('aDust').needsUpdate = true
    camera.position.y = cameraY
    atmosphere.update(10, .4, 1, undefined, camera, blocked ? monitors.getParticleObstacles() : [])
    // Freeze yaw to inspect vertical travel and a frontal card in the same coordinates.
    material.uniforms.uSpineYaw.value = 0
    renderer.setRenderTarget(target); renderer.render(probe, camera)
    const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel)
    return Array.from(pixel).slice(0, 3)
  }
  const filmTexture = new THREE.Texture(), chrome = new THREE.MeshPhysicalMaterial()
  const emblem = createSceneEmblem({ software: true, mobile: false,
    silver: { chrome, darkChrome: chrome }, film: createLightFilmUniforms(filmTexture) })
  try {
    const heights = Array.from({ length: 41 }, (_, i) => FLOWER_WORLD_Y + 12 - i * .5)
    const upper = heights.map(y => read(y, 3)), lower = heights.map(y => read(y, -3))
    const reverse = [...heights].reverse().map(y => read(y, 3)).reverse()
    const baseline = heights.map(y => read(y, 3, true))
    monitors.update(10, .303)
    // Put a baseline flower seed exactly on the current lens plane.
    const panel = monitors.group.children[0]
    panel.position.z = 3.53; panel.rotation.set(0, 0, 0)
    const blocked = read(FLOWER_WORLD_Y, 0, true, true)
    const obstacle = monitors.getParticleObstacles()[0]
    const local = new THREE.Vector3(...blocked as [number, number, number]).add(new THREE.Vector3(0,FLOWER_WORLD_Y,0)).applyMatrix4(obstacle.inverse)
    const opacities = [.87, .90, .925, .95, 1, .95, .90].map(p => {
      emblem.update(10, p)
      const values: number[] = []
      emblem.group.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material)) values.push(o.material.opacity) })
      return values
    })
    return { upper, lower, reverse, baseline, local: local.toArray(), clearance: obstacle.half.z,
      count: source.userData.flowerCount, extra: source.userData.reinforcementCount,
      opacities, error: renderer.getContext().getError() }
  } finally {
    atmosphere.dispose(); monitors.dispose(); emblem.dispose(); chrome.dispose(); filmTexture.dispose()
    geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose(); renderer.forceContextLoss()
  }
}
