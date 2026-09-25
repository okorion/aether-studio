import * as THREE from 'three'
import { createReactorFlow } from '../../src/ReactorFlow'
import { createAtmosphere } from '../../src/Atmosphere'
import { REACTOR } from '../../src/Reactor'

const compare = (a: Float32Array, b: Float32Array, count: number) => {
  let meanX = 0, distance = 0, max = 0
  for (let i = 0; i < count; i++) {
    const d = Math.hypot(a[i * 4] - b[i * 4], a[i * 4 + 1] - b[i * 4 + 1], a[i * 4 + 2] - b[i * 4 + 2])
    meanX += a[i * 4] - b[i * 4]
    distance += d
    max = Math.max(max, d)
  }
  return { meanX: meanX / count, meanDistance: distance / count, max }
}

export async function probeReactorFlow() {
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(160, 100)
  const count = 192
  const seeds = new Float32Array(count * 3), lanes = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    seeds.set([(i + .5) / count, i * 2.399963, .5], i * 3)
    lanes[i * 4] = ((i * 29) % count + .5) / count
  }
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 100)
  camera.position.set(0, REACTOR.worldY, 9)
  camera.lookAt(0, REACTOR.worldY, 0)
  camera.updateMatrixWorld(true)
  const control = createReactorFlow(renderer, false, seeds, lanes)
  const driven = createReactorFlow(renderer, false, seeds, lanes)
  if (!control || !driven) throw new Error('GPU float positions are required by this fixture')
  const texture = new THREE.DataTexture(new Uint8Array([202, 128, 200, 255]), 1, 1)
  texture.needsUpdate = true
  const sentinel = new THREE.WebGLRenderTarget(31, 23)
  renderer.setRenderTarget(sentinel)
  renderer.setViewport(2, 3, 17, 13); renderer.setScissor(1, 2, 11, 9); renderer.setScissorTest(true)
  renderer.autoClear = false
  const view = renderer.getViewport(new THREE.Vector4()).toArray()
  const scissor = renderer.getScissor(new THREE.Vector4()).toArray()
  try {
    await Promise.all([control.prepare(), driven.prepare()])
    control.update(0, .735, camera)
    driven.update(0, .735, camera)
    const initial = control.snapshot()!
    for (let frame = 1; frame <= 30; frame++) {
      control.update(frame / 60, .735, camera)
      driven.update(frame / 60, .735, camera, { flowTexture: texture, aspect: 1.6 })
    }
    const stroke = driven.snapshot()!
    const direction = compare(stroke, control.snapshot()!, count)
    for (let frame = 31; frame <= 60; frame++) {
      control.update(frame / 60, .735, camera)
      driven.update(frame / 60, .735, camera)
    }
    const tail = driven.snapshot()!
    const history = compare(tail, control.snapshot()!, count)
    const idle = compare(control.snapshot()!, initial, count)
    driven.update(1, .734, camera)
    const smallReverse = compare(driven.snapshot()!, tail, count)
    driven.update(1, .735, camera)
    let maxTube = 0, minHole = Infinity, finite = true
    for (let i = 0; i < count; i++) {
      const x = tail[i * 4], y = tail[i * 4 + 1], z = tail[i * 4 + 2]
      const angle = Math.atan2(y / 1.68, x / 1.47)
      maxTube = Math.max(maxTube, Math.hypot(x - Math.cos(angle) * 1.47, y - Math.sin(angle) * 1.68, z))
      minHole = Math.min(minHole, Math.hypot(x / 1.47, y / 1.68))
      finite &&= Number.isFinite(x + y + z)
    }
    const beforePauseSteps = driven.getStatus().steps
    driven.update(1.1, .735, camera, undefined, false)
    const paused = compare(driven.snapshot()!, tail, count)
    const pausedSteps = driven.getStatus().steps - beforePauseSteps
    driven.suspend()
    driven.update(100, .735, camera, undefined, false)
    const suspended = compare(driven.snapshot()!, tail, count)
    const restored = createReactorFlow(renderer, false, seeds, lanes, tail)!
    restored.update(100, .735, camera, undefined, false)
    const snapshotRestore = compare(restored.snapshot()!, tail, count)
    restored.dispose()
    const beforeExitSteps = driven.getStatus().steps
    driven.update(101, .8, camera)
    const exited = driven.getStatus()
    driven.update(101, .64, camera)
    driven.update(101, .735, camera)
    const reverse = compare(driven.snapshot()!, initial, count)
    const rendererState = { target: renderer.getRenderTarget() === sentinel,
      viewport: renderer.getViewport(new THREE.Vector4()).toArray(), view,
      scissor: renderer.getScissor(new THREE.Vector4()).toArray(), expectedScissor: scissor,
      scissorTest: renderer.getScissorTest(), autoClear: renderer.autoClear }
    const stepCount = driven.getStatus().steps
    driven.dispose(); driven.dispose(); driven.update(102, .735, camera)
    return { direction, history, idle, smallReverse, maxTube, minHole, finite, paused, pausedSteps, suspended, snapshotRestore,
      exited, exitSteps: exited.steps - beforeExitSteps, reverse, rendererState,
      disposedSteps: driven.getStatus().steps - stepCount, glError: renderer.getContext().getError() }
  } finally {
    control.dispose(); driven.dispose(); texture.dispose(); sentinel.dispose(); renderer.dispose()
  }
}

/** The production vertex shader must consume each grain's own state texel. */
export async function probeAtmosphereGpuFlow(mobile: boolean) {
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(192, 1)
  const scene = new THREE.Scene()
  const atmosphere = createAtmosphere(scene, false, mobile, undefined, { renderer })
  const fallback = createAtmosphere(new THREE.Scene(), true, mobile, undefined, { renderer })
  const particles = scene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const status = atmosphere.getFlowStatus()
  const uv = particles.geometry.getAttribute('aReactorUv')
  const cells = new Set<number>()
  const side = Math.ceil(Math.sqrt(status.count))
  for (let i = 0; i < status.count; i++) cells.add(Math.floor(uv.getX(i) * side) + Math.floor(uv.getY(i) * side) * side)
  const sampleCount = 192
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'aDust', 'aAdvected', 'aReactorUv']) {
    const source = particles.geometry.getAttribute(name)
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(Array.from(source.array).slice(0, sampleCount * source.itemSize), source.itemSize))
  }
  geometry.setAttribute('probeIndex', new THREE.Float32BufferAttribute(Array.from({ length: sampleCount }, (_, i) => i), 1))
  const shader = particles.material.vertexShader.replace(/}\s*$/, `probePosition = p;
    gl_Position=vec4((probeIndex+.5)/${sampleCount}.*2.-1.,0.,0.,1.);gl_PointSize=1.;}`)
  const material = new THREE.ShaderMaterial({ uniforms: particles.material.uniforms,
    vertexShader: 'attribute float probeIndex;varying vec3 probePosition;\n' + shader,
    fragmentShader: 'varying vec3 probePosition;void main(){gl_FragColor=vec4(probePosition,1.);}',
    depthTest: false, depthWrite: false })
  const probe = new THREE.Scene()
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  probe.add(points)
  const camera = new THREE.PerspectiveCamera(42, mobile ? 390 / 844 : 1.6, .1, 100)
  camera.position.set(0, REACTOR.worldY, 9)
  camera.lookAt(0, REACTOR.worldY, 0); camera.updateMatrixWorld(true)
  const target = new THREE.WebGLRenderTarget(sampleCount, 1, { type: THREE.FloatType })
  const read = () => {
    renderer.setRenderTarget(target); renderer.render(probe, camera)
    const values = new Float32Array(sampleCount * 4)
    renderer.readRenderTargetPixels(target, 0, 0, sampleCount, 1, values)
    return values
  }
  try {
    await atmosphere.prepare()
    atmosphere.update(0, .735, 1, undefined, camera)
    const initial = read()
    for (let i = 1; i <= 30; i++) atmosphere.update(i / 60, .735, 1, undefined, camera)
    const later = read()
    const motion = compare(later, initial, sampleCount)
    const liveStatus = atmosphere.getFlowStatus()
    const weight = particles.material.uniforms.uReactorStateWeight.value as number
    atmosphere.setFlowActive(false)
    atmosphere.update(4, .735, 1, undefined, camera)
    const suspended = compare(read(), later, sampleCount)
    const suspendedSteps = atmosphere.getFlowStatus().steps
    atmosphere.update(4, .70, 1, undefined, camera)
    const suspendedFormationWeight = particles.material.uniforms.uReactorStateWeight.value as number
    atmosphere.update(4, .64, 1, undefined, camera)
    const formationWeight = particles.material.uniforms.uReactorStateWeight.value as number
    const suspendedExit = atmosphere.getFlowStatus()
    atmosphere.setFlowActive(true)
    atmosphere.update(4, .735, 1, undefined, camera)
    const restored = compare(read(), initial, sampleCount)
    return { status, liveStatus, uniqueCells: cells.size, baseCount: particles.userData.baseCount,
      motion, weight, suspended, suspendedFormationWeight, formationWeight,
      suspendedExit, suspendedScrollSteps: suspendedExit.steps - suspendedSteps,
      restored, fallback: fallback.getFlowStatus(),
      glError: renderer.getContext().getError() }
  } finally {
    atmosphere.dispose(); fallback.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose()
  }
}
