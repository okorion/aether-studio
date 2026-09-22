import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createAtmosphere } from '../src/Atmosphere'
import { createSceneInteraction } from '../src/SceneInteraction'
import { sampleJourney } from '../src/Journey'

// Real input listeners and production scene objects, without a browser or GL
// context. These check the deformation driver/lifecycle; pixels require GPU QA.
function inputEnvironment() {
  class ElementStub extends EventTarget {
    dataset: Record<string, string> = {}
    closest() { return null }
  }
  class PointerStub extends Event {
    pointerType = 'mouse'
    pointerId = 1
    button = 0
    constructor(type: string, public clientX: number, public clientY: number) { super(type) }
  }
  const windowEvents = new EventTarget()
  const documentEvents = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: () => null,
    documentElement: { classList: { add() {}, remove() {} } },
  })
  const globals: Record<string, unknown> = {
    window: windowEvents, document: documentEvents, location: { hash: '#home' },
    Element: ElementStub, PointerEvent: PointerStub, innerWidth: 640, innerHeight: 480,
  }
  const previous = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const canvas = new ElementStub() as unknown as HTMLCanvasElement
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 4 / 3, .1, 90)
  camera.position.z = 12
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const input = createSceneInteraction(scene, camera, canvas, false, true)
  let elapsed = 0
  return {
    input, scene, camera, canvas,
    send(type: string, x = 320, y = 240) {
      const event = new PointerStub(type, x, y)
      Object.defineProperty(event, 'target', { value: canvas })
      windowEvents.dispatchEvent(event)
    },
    step(seconds = 1 / 60) {
      elapsed += seconds
      return { elapsed, ...input.update(seconds, elapsed, 1) }
    },
    dispose() {
      input.dispose()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    },
  }
}

test('@interaction vertical orbit exposes the top on downward drag and the underside on upward drag', () => {
  for (const progress of [0, .98]) {
    for (const down of [true, false]) {
      const env = inputEnvironment()
      try {
        const journey = sampleJourney(progress)
        env.input.setOrbitEnabled(journey.orbitEnabled)
        env.send('pointerdown')
        env.send('pointermove', 320, down ? 380 : 100)
        let view = env.step()
        for (let i = 0; i < 90; i++) view = env.step()
        expect(down ? view.pitch : -view.pitch).toBeGreaterThan(.4)
        expect(view.yaw).toBe(0)
        const baseCameraY = journey.height + Math.sin(journey.elevation) * journey.radius
        const chosenCameraY = journey.height
          + Math.sin(THREE.MathUtils.clamp(journey.elevation + view.pitch * journey.orbitWeight, -.72, .72)) * journey.radius
        expect(down ? chosenCameraY - baseCameraY : baseCameraY - chosenCameraY).toBeGreaterThan(1)
        env.send('pointerup')
        const settled = env.step(4)
        expect(settled.pitch).toBeCloseTo(view.pitch, 3)
      } finally { env.dispose() }
    }
  }
})

test('@interaction horizontal direction and middle lock survive vertical inversion without queued motion', () => {
  const env = inputEnvironment()
  try {
    env.send('pointerdown')
    env.send('pointermove', 500, 240)
    let view = env.step(2)
    expect(view.yaw).toBeLessThan(-.2)
    expect(view.pitch).toBe(0)
    env.input.setOrbitEnabled(false)
    const retained = view
    env.send('pointermove', 120, 380)
    env.send('pointerup')
    env.send('pointerdown')
    env.send('pointermove', 520, 100)
    env.send('pointerup')
    view = env.step(2)
    expect(view.yaw).toBeCloseTo(retained.yaw, 10)
    expect(view.pitch).toBe(0)
    expect(view.field.active).toBe(true)
    env.input.setOrbitEnabled(true)
    view = env.step(2)
    expect(view.yaw).toBeCloseTo(retained.yaw, 10)
    expect(view.pitch).toBe(0)
  } finally { env.dispose() }
})

test('@interaction a stopped device responds to mouse motion and recovers without changing its scroll shape', () => {
  const env = inputEnvironment()
  const atmosphere = createAtmosphere(env.scene, true, false)
  const particles = env.scene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const uniforms = particles.material.uniforms
  const seeds = Array.from(particles.geometry.attributes.position.array)
  const baseState = () => ({
    scroll: uniforms.uScroll.value as number,
    step: uniforms.uScrollStep.value as number,
    weights: (uniforms.uWeights.value as THREE.Vector4).toArray(),
    y: particles.position.y,
  })
  const step = (seconds = 1 / 60, progress = .72) => {
    const view = env.step(seconds)
    atmosphere.update(view.elapsed, progress, 1, view.field)
    return view
  }
  try {
    env.input.setOrbitEnabled(false)
    step()
    const base = baseState()
    expect(uniforms.uDevicePointerStrength.value).toBe(0)
    for (let i = 0; i < 24; i++) {
      env.send('pointermove', 180 + i * 10, 240)
      step()
    }
    expect(uniforms.uDevicePointerStrength.value).toBeGreaterThan(.8)
    expect(particles.userData.devicePointerStrength).toBe(uniforms.uDevicePointerStrength.value)
    expect(baseState()).toEqual(base)
    expect(base.step).toBe(0)
    expect(base.y).toBe(-40.4)
    for (let i = 0; i < 180; i++) step()
    expect(uniforms.uDevicePointerStrength.value).toBe(0)
    expect(baseState()).toEqual(base)
    expect(Array.from(particles.geometry.attributes.position.array)).toEqual(seeds)

    // Strong input in the spine cannot activate the device deformation. Its
    // scroll driver still stops, reverses, and returns to the original phase.
    env.send('pointermove', 220, 180)
    step(.2, .4)
    step(1 / 60, .4)
    expect(uniforms.uPointerStrength.value).toBeGreaterThan(.5)
    expect(uniforms.uDevicePointerStrength.value).toBe(0)
    const spine = baseState()
    step(.1, .42)
    expect(uniforms.uScrollStep.value).toBeGreaterThan(0)
    step(.1, .4)
    expect(uniforms.uScrollStep.value).toBeLessThan(0)
    step(.1, .4)
    expect(baseState()).toEqual(spine)

    // Excluded UI/non-home input clears the actual field immediately, rather
    // than leaving a deformation behind until its ordinary idle decay ends.
    env.send('pointermove', 380, 200)
    step(.2)
    expect(uniforms.uDevicePointerStrength.value).toBeGreaterThan(.5)
    env.input.setActive(false)
    step()
    expect(uniforms.uDevicePointerStrength.value).toBe(0)
  } finally {
    atmosphere.dispose()
    env.dispose()
  }
})
