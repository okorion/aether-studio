import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { prepareSceneShaders } from '../src/ScenePreparation'

// The real GL path is measured separately. These cover cancellation and
// render-target ownership so async preparation cannot corrupt another frame.
test('@interaction shader preparation restores the render target and warms both output paths', async () => {
  let current: THREE.WebGLRenderTarget | null = null
  const calls: Array<THREE.WebGLRenderTarget | null> = []
  let disposed = false
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { current = target },
    render: () => {},
    compileAsync: async () => {
      calls.push(current)
      current?.addEventListener('dispose', () => { disposed = true })
    },
  } as unknown as THREE.WebGLRenderer
  await prepareSceneShaders(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => false)
  expect(calls).toHaveLength(2)
  expect(calls[0]?.texture.type).toBe(THREE.HalfFloatType)
  expect(calls[1]).toBeNull()
  expect(current).toBeNull()
  expect(disposed).toBe(true)
})

test('@interaction cancelled shader preparation never starts a second compile', async () => {
  let current: THREE.WebGLRenderTarget | null = null
  let finish!: () => void
  let cancelled = false
  let calls = 0
  let disposed = false
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { current = target },
    compileAsync: () => {
      calls++
      current?.addEventListener('dispose', () => { disposed = true })
      return new Promise<void>(resolve => { finish = resolve })
    },
  } as unknown as THREE.WebGLRenderer
  const pending = prepareSceneShaders(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => cancelled)
  expect(current).toBeNull()
  cancelled = true
  finish()
  await pending
  expect(calls).toBe(1)
  expect(disposed).toBe(true)
})

test('@interaction preparation uploads shared static textures once and leaves videos and render targets alone', async () => {
  const scene = new THREE.Scene()
  const staticTexture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)
  const video = new THREE.VideoTexture({} as HTMLVideoElement)
  const captured = new THREE.WebGLRenderTarget(1, 1)
  const material = new THREE.ShaderMaterial({uniforms: {
    staticA: {value: staticTexture}, staticB: {value: staticTexture},
    video: {value: video}, captured: {value: captured.texture},
  }})
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material)
  mesh.visible = false
  scene.add(mesh)
  const uploads: THREE.Texture[] = []
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    compileAsync: async () => {},
    initTexture: (texture: THREE.Texture) => { uploads.push(texture) },
  } as unknown as THREE.WebGLRenderer
  await prepareSceneShaders(renderer, scene, new THREE.PerspectiveCamera(), () => false)
  expect(uploads.length).toBe(1)
  expect(uploads[0] === staticTexture).toBe(true)
  material.dispose(); mesh.geometry.dispose(); staticTexture.dispose(); video.dispose(); captured.dispose()
})

test('@interaction a failed compile releases its target and propagates to the existing scene fallback', async () => {
  const previous = new THREE.WebGLRenderTarget(1, 1)
  let current: THREE.WebGLRenderTarget | null = previous
  let disposed = false
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { current = target },
    compileAsync: () => {
      current?.addEventListener('dispose', () => { disposed = true })
      throw new Error('compile failed')
    },
  } as unknown as THREE.WebGLRenderer
  await expect(prepareSceneShaders(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => false))
    .rejects.toThrow('compile failed')
  expect(current === previous).toBe(true)
  expect(disposed).toBe(true)
  previous.dispose()
})

test('@interaction failed first-use priming restores hidden objects and reflection callbacks', async () => {
  const scene = new THREE.Scene()
  const hidden = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial())
  hidden.visible = false
  const reflect = () => { throw new Error('reflection must not run during priming') }
  hidden.onBeforeRender = reflect
  scene.add(hidden)
  let current: THREE.WebGLRenderTarget | null = null
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { current = target },
    compileAsync: async () => {},
    render: () => {
      expect(hidden.visible).toBe(true)
      expect(hidden.frustumCulled).toBe(false)
      expect(hidden.onBeforeRender === reflect).toBe(false)
      throw new Error('lost during upload')
    },
  } as unknown as THREE.WebGLRenderer
  await expect(prepareSceneShaders(renderer, scene, new THREE.PerspectiveCamera(), () => false))
    .rejects.toThrow('lost during upload')
  expect(current).toBeNull()
  expect(hidden.visible).toBe(false)
  expect(hidden.frustumCulled).toBe(true)
  expect(hidden.onBeforeRender === reflect).toBe(true)
  hidden.geometry.dispose(); hidden.material.dispose()
})

// Completion reports must remain behind the work they describe.
test('@interaction progress waits for both compiles and never reports a first frame', async () => {
  const stages: string[] = []
  const finishes: Array<() => void> = []
  const renderer = {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    compileAsync: () => new Promise<void>(resolve => finishes.push(resolve)),
  } as unknown as THREE.WebGLRenderer
  const pending = prepareSceneShaders(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => false, stage => stages.push(stage))
  expect(stages).toEqual(['textures'])
  finishes[0]()
  await Promise.resolve()
  expect(stages).toEqual(['textures', 'linear', 'geometry'])
  finishes[1]()
  await pending
  expect(stages).toEqual(['textures', 'linear', 'geometry', 'shaders'])
})

test('@interaction cancellation during the display compile cannot report new readiness', async () => {
  let cancelled = false
  let finish!: () => void
  let calls = 0
  const stages: string[] = []
  const renderer = {
    getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
    compileAsync: () => ++calls === 1 ? Promise.resolve() : new Promise<void>(resolve => { finish = resolve }),
  } as unknown as THREE.WebGLRenderer
  const pending = prepareSceneShaders(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), () => cancelled, stage => stages.push(stage))
  await Promise.resolve()
  cancelled = true
  finish()
  await pending
  expect(stages).toEqual(['textures', 'linear', 'geometry'])
})
