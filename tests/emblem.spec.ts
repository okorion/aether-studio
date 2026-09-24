import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSceneEmblem, type EmblemVariant } from '../src/SceneEmblem'
import { createLightFilmUniforms } from '../src/SceneLighting'

function setup(variant: EmblemVariant = 'glass', software = false, mobile = false) {
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xc9e4da, metalness: 1, roughness: .16,
    envMapIntensity: 2, clearcoat: 1, clearcoatRoughness: .1, iridescence: .8,
    iridescenceIOR: 1.35, iridescenceThicknessRange: [100, 390] })
  const darkChrome = new THREE.MeshPhysicalMaterial({ color: 0x3d686b, metalness: 1,
    roughness: .22, envMapIntensity: 1.7, clearcoat: 1, iridescence: .7 })
  const filmTexture = new THREE.DataTexture(new Uint8Array([64, 96, 192, 255]), 1, 1)
  const film = createLightFilmUniforms(filmTexture)
  const emblem = createSceneEmblem({ variant, software, mobile, silver: { chrome, darkChrome }, film })
  const scene = new THREE.Scene()
  const world = new THREE.Group()
  const neighbor = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial())
  world.add(emblem.group, neighbor)
  scene.add(world)
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 90)
  camera.position.z = 8
  camera.updateMatrixWorld()
  emblem.update(0, 0)
  const mesh = (name: string) => emblem.group.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>
  return { emblem, scene, world, neighbor, camera, chrome, darkChrome, film, filmTexture, mesh,
    dispose() {
      emblem.dispose(); chrome.dispose(); darkChrome.dispose(); filmTexture.dispose()
      neighbor.geometry.dispose(); neighbor.material.dispose()
    } }
}

function rendererDouble(onRender: () => void = () => {}, width = 2400, height = 1500) {
  const previous = new THREE.WebGLRenderTarget(11, 13)
  let target: THREE.WebGLRenderTarget | null = previous
  let cubeFace = 3, mipLevel = 2
  const draws: Array<THREE.WebGLRenderTarget | null> = []
  const prepared: THREE.WebGLRenderTarget[] = []
  const textures: THREE.Texture[] = []
  const renderer = {
    autoClear: false,
    xr: { enabled: true }, shadowMap: { autoUpdate: true },
    getDrawingBufferSize: (size: THREE.Vector2) => size.set(width, height),
    getRenderTarget: () => target,
    getActiveCubeFace: () => cubeFace,
    getActiveMipmapLevel: () => mipLevel,
    setRenderTarget(next: THREE.WebGLRenderTarget | null, face = 0, level = 0) {
      target = next; cubeFace = face; mipLevel = level
    },
    initTexture(texture: THREE.Texture) { textures.push(texture) },
    initRenderTarget(next: THREE.WebGLRenderTarget) { prepared.push(next) },
    render() { draws.push(target); onRender() },
  } as unknown as THREE.WebGLRenderer
  return { renderer, previous, draws, prepared, textures,
    state: () => ({ target, cubeFace, mipLevel, autoClear: renderer.autoClear,
      xr: renderer.xr.enabled, shadows: renderer.shadowMap.autoUpdate }),
    dispose: () => previous.dispose() }
}

function compiledSource(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader } as Parameters<THREE.Material['onBeforeCompile']>[0]
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  return shader
}

test('@interaction silver emblem preserves its original geometry, material recipe, ribbons and scroll pose', () => {
  const fixture = setup('silver')
  const { emblem, mesh, world, neighbor } = fixture
  try {
    const ring = mesh('aether-emblem-ring')
    const inner = mesh('aether-emblem-inner-ring')
    const glyph = mesh('aether-emblem-glyph')
    const ribbons = emblem.group.getObjectByName('aether-emblem-ribbons')!
    expect((ring.geometry as THREE.TorusGeometry).parameters).toMatchObject({ radius: .89, tube: .052, radialSegments: 12, tubularSegments: 144 })
    expect((inner.geometry as THREE.TorusGeometry).parameters).toMatchObject({ radius: .84, tube: .009 })
    expect(inner.position.z).toBe(-.035)
    expect((glyph.geometry as THREE.ExtrudeGeometry).parameters.options).toMatchObject({ depth: .055,
      bevelSegments: 3, bevelSize: .014, bevelThickness: .013, curveSegments: 32 })
    expect(glyph.position.z).toBe(.03)
    expect(ribbons.children).toHaveLength(4)
    for (const [index, object] of ribbons.children.entries()) {
      const tail = object as THREE.Mesh<THREE.TubeGeometry, THREE.MeshPhysicalMaterial>
      expect(tail.geometry.parameters).toMatchObject({ tubularSegments: 180,
        radius: index % 2 === 0 ? .015 : .007, radialSegments: index % 2 === 0 ? 6 : 5, closed: false })
      expect(tail.parent).toBe(ribbons)
    }
    expect(ring.material.color.getHex()).toBe(0xc9e4da)
    expect(ring.material.metalness).toBe(1)
    expect(ring.material.envMapIntensity).toBe(2)
    expect(ring.material.depthWrite).toBe(true)
    expect(glyph.material.color.getHex()).toBe(0xb9e4d3)
    expect(glyph.material.roughness).toBe(.25)
    expect(glyph.material.metalness).toBe(.87)
    expect(glyph.material.emissiveIntensity).toBe(.18)
    const tailShader = compiledSource(mesh('aether-emblem-ribbon-0').material)
    expect(tailShader.vertexShader).toContain('transformed.y = mix(position.y, -position.y * 1.35, uTailLift)')
    emblem.update(18, .14)
    const pose = emblem.group.matrix.compose(emblem.group.position, emblem.group.quaternion, emblem.group.scale).toArray()
    const opacity = ring.material.opacity
    emblem.update(72, .14)
    expect(emblem.group.matrix.compose(emblem.group.position, emblem.group.quaternion, emblem.group.scale).toArray()).toEqual(pose)
    expect(tailShader.uniforms.uTailTime.value).toBe(72)
    expect(tailShader.uniforms.uTailLift.value).toBe(0)
    emblem.update(74, .9)
    expect(tailShader.uniforms.uTailLift.value).toBe(1)
    emblem.update(75, .14)
    expect(emblem.group.matrix.compose(emblem.group.position, emblem.group.quaternion, emblem.group.scale).toArray()).toEqual(pose)
    expect(ring.material.opacity).toBe(opacity)
    expect(world.children).toContain(neighbor)
    expect(emblem.getStatus()).toMatchObject({ variant: 'silver', capture: 'disabled', width: 0, height: 0 })
  } finally { fixture.dispose() }
})

test('@interaction emblem owns its cloned surfaces and resources without disposing borrowed media or its world', () => {
  for (const variant of ['silver', 'glass'] as const) {
    const fixture = setup(variant)
    const { emblem, chrome, darkChrome, filmTexture, world, neighbor } = fixture
    let borrowedDisposals = 0
    for (const resource of [chrome, darkChrome, filmTexture]) resource.addEventListener('dispose', () => { borrowedDisposals++ })
    const original = [chrome.toJSON(), darkChrome.toJSON()]
    const own = new Set<THREE.Material | THREE.BufferGeometry>()
    const counts = new Map<THREE.Material | THREE.BufferGeometry, number>()
    emblem.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      own.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) own.add(material)
    })
    for (const resource of own) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1))
    try {
      expect(own.has(chrome)).toBe(false)
      expect(own.has(darkChrome)).toBe(false)
      emblem.update(15, .98)
      expect([chrome.toJSON(), darkChrome.toJSON()]).toEqual(original)
      emblem.dispose()
      emblem.dispose()
      emblem.update(300, 0)
      expect(borrowedDisposals).toBe(0)
      expect([...counts.values()]).toHaveLength(own.size)
      expect([...counts.values()].every(count => count === 1)).toBe(true)
      expect(world.children).toEqual([neighbor])
      expect(emblem.group.children).toHaveLength(0)
      expect(emblem.group.visible).toBe(false)
    } finally { fixture.dispose() }
  }
})

test('@interaction glass composes its film, glyph, ribbon and curtain hooks once without shader variants on readiness', () => {
  const fixture = setup()
  const replacement = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)
  try {
    for (const name of ['aether-emblem-ring', 'aether-emblem-glyph', 'aether-emblem-ribbon-0']) {
      const material = fixture.mesh(name).material
      const key = material.customProgramCacheKey()
      const version = material.version
      const shader = compiledSource(material)
      expect(shader.uniforms.uLightFilm).toBe(fixture.film.map)
      expect(shader.uniforms.uLightFilmReady).toBe(fixture.film.ready)
      expect(shader.fragmentShader.match(/uniform float uCurtainUpper;/g)).toHaveLength(1)
      expect(shader.vertexShader).toContain('vEmblemClip = gl_Position')
      expect(shader.fragmentShader).toContain('texture2D(uEmblemBackground, emblemUvR).r')
      expect(material.transmission).toBe(0)
      fixture.film.map.value = replacement
      fixture.film.ready.value = 1
      expect(shader.uniforms.uLightFilm.value).toBe(replacement)
      expect(material.version).toBe(version)
      expect(material.customProgramCacheKey()).toBe(key)
      if (name.endsWith('glyph')) expect(shader.vertexShader).toContain('vInsigniaPosition = position')
      if (name.endsWith('ribbon-0')) expect(shader.uniforms.uTailTime).toBeDefined()
    }
  } finally { replacement.dispose(); fixture.dispose() }
})

test('@interaction glass capture includes transparent film, blocks recursion and restores renderer state', () => {
  const fixture = setup()
  const film = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true }))
  const reflector = new THREE.Group()
  fixture.scene.add(film, reflector)
  let calls = 0
  const mock = rendererDouble(() => {
    calls++
    expect(fixture.emblem.group.visible).toBe(false)
    expect(fixture.world.visible).toBe(true)
    expect(fixture.neighbor.visible).toBe(true)
    expect(film.visible).toBe(true)
    expect(reflector.visible).toBe(false)
    fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera, true, [reflector])
  })
  try {
    const state = mock.state()
    fixture.emblem.prepare(mock.renderer)
    fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera, false, [reflector])
    expect(calls).toBe(1)
    expect(mock.state()).toEqual(state)
    expect(reflector.visible).toBe(true)
    expect(fixture.emblem.group.visible).toBe(true)
    expect(fixture.emblem.getStatus()).toMatchObject({ capture: 'ready', width: 720, height: 450 })
    const shader = compiledSource(fixture.mesh('aether-emblem-ring').material)
    expect(shader.uniforms.uEmblemBackgroundReady.value).toBe(1)
    expect(shader.uniforms.uEmblemBackground.value).toBe(mock.draws[0]!.texture)
    expect(mock.draws[0]!.texture.type).toBe(THREE.HalfFloatType)
    expect(mock.draws[0]!.texture.colorSpace).toBe(THREE.LinearSRGBColorSpace)
    fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera, false)
    expect(calls).toBe(1)
  } finally { fixture.dispose(); mock.dispose(); film.geometry.dispose(); film.material.dispose() }
})

test('@interaction failed capture falls back once and context preparation permits a clean retry', () => {
  const fixture = setup()
  let fail = true
  const excluded = new THREE.Group()
  excluded.visible = false
  const mock = rendererDouble(() => { if (fail) throw new Error('test context failure') })
  try {
    const state = mock.state()
    fixture.emblem.prepare(mock.renderer)
    fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera, true, [excluded])
    expect(fixture.emblem.getStatus().capture).toBe('failed')
    expect(excluded.visible).toBe(false)
    expect(fixture.emblem.group.visible).toBe(true)
    expect(mock.state()).toEqual(state)
    const shader = compiledSource(fixture.mesh('aether-emblem-ring').material)
    expect(shader.uniforms.uEmblemBackgroundReady.value).toBe(0)
    fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera)
    expect(mock.draws).toHaveLength(1)
    fail = false
    fixture.emblem.prepare(mock.renderer)
    fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera, false)
    expect(mock.draws).toHaveLength(2)
    expect(fixture.emblem.getStatus().capture).toBe('ready')
    expect(mock.state()).toEqual(state)
    fixture.emblem.prepare(mock.renderer)
    expect(shader.uniforms.uEmblemBackgroundReady.value).toBe(0)
    expect(fixture.emblem.getStatus().capture).toBe('pending')
  } finally { fixture.dispose(); mock.dispose() }
})

test('@interaction capture bounds both dimensions, refreshes entering regions and skips silver/software', () => {
  for (const mobile of [false, true]) {
    const fixture = setup('glass', false, mobile)
    const mock = rendererDouble(() => {}, 2400, 6000)
    try {
      fixture.emblem.prepare(mock.renderer)
      const { width, height } = fixture.emblem.getStatus()
      expect(width).toBeLessThanOrEqual(mobile ? 384 : 720)
      expect(height).toBeLessThanOrEqual(900)
      expect(width / height).toBeCloseTo(.4, 2)
      fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera)
      fixture.emblem.update(4, .5)
      fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera)
      expect(mock.draws).toHaveLength(1)
      fixture.emblem.update(4, 0)
      fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera, false)
      expect(mock.draws).toHaveLength(2)
      let releases = 0
      mock.prepared[0].addEventListener('dispose', () => { releases++ })
      fixture.emblem.dispose()
      fixture.emblem.dispose()
      fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera)
      expect(releases).toBe(1)
      expect(mock.draws).toHaveLength(2)
    } finally { fixture.dispose(); mock.dispose() }
  }
  for (const [variant, software] of [['silver', false], ['glass', true]] as const) {
    const fixture = setup(variant, software)
    const mock = rendererDouble(() => { throw new Error('capture must be disabled') })
    try {
      fixture.emblem.prepare(mock.renderer)
      fixture.emblem.capture(mock.renderer, fixture.scene, fixture.camera)
      expect(fixture.emblem.getStatus().capture).toBe('disabled')
      expect(mock.prepared).toHaveLength(0)
      expect(mock.draws).toHaveLength(0)
    } finally { fixture.dispose(); mock.dispose() }
  }
})
