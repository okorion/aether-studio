import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSceneInteraction } from '../src/SceneInteraction'
import { pointerStreakCanSpawn, samplePointerStreakScope } from '../src/SceneInteractionScope'
import { sampleLayers } from '../src/SceneLayers'

test('@interaction flying streaks follow both forest boundaries, including their diagonal corners', () => {
  for (const progress of [0, .1, .145, .15, .18, .2, .4, .72, .83, .855, .875, .89, .915, .925, 1]) {
    const scope = samplePointerStreakScope(progress)
    const forest = sampleLayers(progress)
    expect(scope.exit).toBe(forest.forestExit)
    expect(scope.entry).toBe(forest.forestEntry)
  }
  for (const progress of [0, 1]) {
    const scope = samplePointerStreakScope(progress)
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1])
      expect(pointerStreakCanSpawn(scope, x, y)).toBe(true)
  }
  for (const progress of [.2, .235, .45, .63, .72, .83, .85]) {
    const scope = samplePointerStreakScope(progress)
    expect(scope.visible).toBe(false)
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1])
      expect(pointerStreakCanSpawn(scope, x, y)).toBe(false)
  }
  const outgoing = samplePointerStreakScope(.15)
  const incoming = samplePointerStreakScope(.89)
  // At the midpoint, the same horizontal pointer sweep crosses the slanted
  // boundary in opposite directions for the outgoing and incoming forests.
  expect(pointerStreakCanSpawn(outgoing, -.8, 0)).toBe(true)
  expect(pointerStreakCanSpawn(outgoing, .8, 0)).toBe(false)
  expect(pointerStreakCanSpawn(incoming, -.8, 0)).toBe(false)
  expect(pointerStreakCanSpawn(incoming, .8, 0)).toBe(true)
  expect(samplePointerStreakScope(-2)).toEqual(samplePointerStreakScope(0))
  expect(samplePointerStreakScope(2)).toEqual(samplePointerStreakScope(1))
  expect(samplePointerStreakScope(Number.NaN)).toEqual(samplePointerStreakScope(0))
  for (const [x, y] of [[NaN, 0], [0, Infinity], [1.01, 0], [0, -1.01]])
    expect(pointerStreakCanSpawn(outgoing, x, y)).toBe(false)
})

// Real production listeners and geometry buffers, without a browser or GL.
// Final fragment coverage during flight is deliberately left to GPU QA.
function inputEnvironment(software: boolean) {
  class ElementStub extends EventTarget {
    dataset: Record<string, string> = {}
    closest() { return null }
  }
  class PointerStub extends Event {
    pointerType = 'mouse'
    pointerId = 1
    button = 0
    constructor(public clientX: number, public clientY: number) { super('pointermove') }
  }
  const windowEvents = new EventTarget()
  const documentEvents = Object.assign(new EventTarget(), {
    hidden: false, querySelector: () => null,
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
  const input = createSceneInteraction(scene, camera, canvas, false, software)
  const ribbon = scene.getObjectByName('aether-pointer-ribbons') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  const motes = scene.children.find(child => child instanceof THREE.Points) as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  let elapsed = 0
  let progress = 0
  return {
    input, ribbon, motes,
    stage(p: number) {
      progress = p
      return input.update(0, elapsed, 1, progress)
    },
    step(seconds = .05) {
      elapsed += seconds
      return input.update(seconds, elapsed, 1, progress)
    },
    move(x: number, y: number) {
      const event = new PointerStub(x, y)
      Object.defineProperty(event, 'timeStamp', { value: elapsed * 1000 })
      Object.defineProperty(event, 'target', { value: canvas })
      windowEvents.dispatchEvent(event)
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

test('@interaction leaving the forest clears ribbons and motes while surface input keeps responding', () => {
  for (const software of [false, true]) {
    const env = inputEnvironment(software)
    const stroke = (y: number) => {
      for (let i = 0; i < 6; i++) {
        env.move(160 + i * 40, y)
        env.step()
      }
    }
    try {
      env.stage(0)
      stroke(240)
      expect(env.ribbon.visible).toBe(true)
      expect(env.ribbon.geometry.drawRange.count).toBeGreaterThan(0)
      const moteBirths = Array.from(env.motes.geometry.getAttribute('aBirth').array)
      expect(moteBirths.some(birth => birth >= 0)).toBe(true)
      env.input.setOrbitEnabled(false)
      for (const p of [.45, .72, .83]) {
        env.stage(p)
        stroke(240)
        const state = env.step()
        expect(env.ribbon.visible).toBe(false)
        expect(env.ribbon.geometry.drawRange.count).toBe(0)
        expect(env.motes.visible).toBe(false)
        expect(Array.from(env.motes.geometry.getAttribute('aBirth').array).every(birth => birth === -100)).toBe(true)
        expect(state.field.active).toBe(true)
        expect(state.field.strength).toBeGreaterThan(.5)
        const bytes = state.field.flowTexture.image.data as Uint8Array
        expect(bytes.some((value, index) => index % 4 < 2 && value !== 128)).toBe(true)
        expect(state.yaw).toBe(0)
        expect(state.pitch).toBe(0)
      }
      expect(Array.from(env.motes.geometry.getAttribute('aBirth').array)).not.toEqual(moteBirths)
      env.stage(.89)
      // The lower forest occupies the screen bottom. Moving in the remaining
      // upper scale area must not seed streaks that appear when it recedes.
      stroke(60)
      expect(env.ribbon.visible).toBe(true)
      expect(env.ribbon.geometry.drawRange.count).toBe(0)
      expect(Array.from(env.motes.geometry.getAttribute('aBirth').array).every(birth => birth === -100)).toBe(true)
      stroke(420)
      expect(env.ribbon.geometry.drawRange.count).toBeGreaterThan(0)
      expect(Array.from(env.motes.geometry.getAttribute('aBirth').array).some(birth => birth >= 0)).toBe(true)
      env.stage(.83)
      env.stage(1)
      expect(env.ribbon.geometry.drawRange.count).toBe(0)
      expect(Array.from(env.motes.geometry.getAttribute('aBirth').array).every(birth => birth === -100)).toBe(true)
      stroke(240)
      expect(env.ribbon.geometry.drawRange.count).toBeGreaterThan(0)
      env.step(1.6)
      expect(env.ribbon.geometry.drawRange.count).toBeGreaterThan(0)
      env.step(1.4)
      expect(env.ribbon.geometry.drawRange.count).toBe(0)
      expect(env.ribbon.frustumCulled).toBe(false)
      expect(env.ribbon.material.depthTest).toBe(false)
      expect(env.ribbon.material.depthWrite).toBe(false)
    } finally { env.dispose() }
  }
})
