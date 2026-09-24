import * as THREE from 'three'
import { createAtmosphere } from '../../src/Atmosphere'
import { createSceneWorlds } from '../../src/SceneWorlds'
import { sampleJourney } from '../../src/Journey'

export function probeReactor(mobile: boolean, software: boolean) {
  const scene = new THREE.Scene()
  const worlds = createSceneWorlds(scene, software, mobile)
  const atmosphere = createAtmosphere(scene, software, mobile)
  const grains = scene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const aperture = scene.getObjectByName('aether-machine-aperture') as THREE.Mesh
  const renderer = new THREE.WebGLRenderer()
  const count = 192
  renderer.setSize(count, 1)
  const target = new THREE.WebGLRenderTarget(count, 1, { type: THREE.FloatType })
  const camera = new THREE.PerspectiveCamera(42, mobile ? 390 / 844 : 1440 / 900, .1, 100)
  const geometry = new THREE.BufferGeometry()
  // Sample actual seeded production grains, including fixed, moving and bokeh.
  for (const name of ['position', 'aDust', 'aAdvected']) {
    const attr = grains.geometry.getAttribute(name)
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(Array.from(attr.array).slice(0, count * attr.itemSize), attr.itemSize))
  }
  geometry.setAttribute('probeIndex', new THREE.Float32BufferAttribute(Array.from({ length: count }, (_, i) => i), 1))
  const vertex = grains.material.vertexShader.replace(/}\s*$/, `probePosition = (modelMatrix * vec4(p, 1.)).xyz; gl_Position = vec4((probeIndex + .5) / ${count}. * 2. - 1., 0., 0., 1.); gl_PointSize = 1.; }`)
  const material = new THREE.ShaderMaterial({ uniforms: grains.material.uniforms,
    vertexShader: 'attribute float probeIndex; varying vec3 probePosition;\n' + vertex,
    fragmentShader: 'varying vec3 probePosition; void main(){ gl_FragColor = vec4(probePosition, 1.); }', depthTest: false, depthWrite: false })
  const probe = new THREE.Scene()
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  probe.add(points)
  const read = (progress: number, time = 10) => {
    worlds.update(time, progress); atmosphere.update(time, progress, 1); atmosphere.update(time, progress, 1)
    scene.updateMatrixWorld(true)
    points.position.copy(grains.position)
    renderer.setRenderTarget(target); renderer.render(probe, camera)
    const pixels = new Float32Array(count * 4)
    renderer.readRenderTargetPixels(target, 0, 0, count, 1, pixels)
    return Array.from({ length: count }, (_, i) => Array.from(pixels.slice(i * 4, i * 4 + 3)))
  }
  try {
    const start = read(.640)
    const centre = aperture.getWorldPosition(new THREE.Vector3())
    const box = new THREE.Box3().setFromObject(aperture)
    const attr = aperture.geometry.getAttribute('position')
    let bore = Infinity
    for (let i = 0; i < attr.count; i++) bore = Math.min(bore, Math.hypot(attr.getX(i), attr.getZ(i)))
    const ray = new THREE.Raycaster(new THREE.Vector3(centre.x, box.max.y + 1, centre.z), new THREE.Vector3(0, -1, 0))
    const centreHits = ray.intersectObject(aperture).length
    ray.ray.origin.x += (bore + (box.max.x - centre.x)) / 2
    const rimHits = ray.intersectObject(aperture).length
    const j = sampleJourney(.640)
    const radius = j.radius + (mobile ? 4.8 : 0)
    camera.position.set(Math.sin(j.azimuth) * Math.cos(j.elevation) * radius, j.height + Math.sin(j.elevation) * radius, Math.cos(j.azimuth) * Math.cos(j.elevation) * radius)
    camera.lookAt(0, j.height, 0); camera.updateMatrixWorld(true)
    const projection = start.map(p => new THREE.Vector3(...p as [number, number, number]).project(camera).toArray())
    const mid = read(.690), end = read(.735), stopped = read(.690, 200)
    const frozen = read(.690, 200)
    // Long visits cannot amplify phase changes when formation advances.
    const continuity = [10, 10000].map(time => {
      const before = read(.690, time), after = read(.691, time)
      return Math.max(...before.map((p, i) => Math.hypot(...p.map((v, axis) => after[i][axis] - v))))
    })
    const idle = read(.735, 10), idleLater = read(.735, 10.1)
    const idleSpeed = Math.max(...idle.map((p, i) => Math.hypot(...p.map((v, axis) => idleLater[i][axis] - v))))
    read(.78); read(.61); read(.74)
    const reverse = read(.640)
    return { start, mid, end, stopped, frozen, reverse, continuity, idleSpeed, centre: centre.toArray(), bore, centreHits, rimHits,
      projection, centreProjection: centre.clone().project(camera).toArray() }
  } finally { worlds.dispose(); atmosphere.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose() }
}
