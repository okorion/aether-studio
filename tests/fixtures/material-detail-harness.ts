import * as THREE from 'three'
import { createSpineAssembly } from '../../src/SceneSpine'
import { createSceneWorlds } from '../../src/SceneWorlds'
import { createScaleSurface } from '../../src/SceneScaleSurface'

const SIZE = 384

function difference(a: Uint8Array, b: Uint8Array) {
  let changed = 0, total = 0
  for (let i = 0; i < a.length; i += 4) {
    const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    if (delta > 12) changed++
    total += delta
  }
  return { changed, mean: total / (SIZE * SIZE * 3) }
}

function luminance(pixels: Uint8Array) {
  const values: number[] = []
  let clipped = 0, neutralHighlights = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 250) continue
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    values.push(r * .2126 + g * .7152 + b * .0722)
    if (Math.min(r, g, b) > 250) clipped++
    if (Math.min(r, g, b) > 120 && Math.max(r, g, b) - Math.min(r, g, b) < 45) neutralHighlights++
  }
  values.sort((a, b) => a - b)
  return { covered: values.length, median: values[Math.floor(values.length * .5)] ?? 0,
    p95: values[Math.floor(values.length * .95)] ?? 0, clipped: clipped / Math.max(1, values.length),
    neutralHighlights }
}

/** Production materials/geometry at 384px, including the detailed GPU branches.
 * The independent light cards expose changes in reflection direction and width.
 * This probes material behavior, not visual identity with a reference website. */
export function probeMaterialDetail() {
  const errors: string[] = []
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
  renderer.setSize(SIZE, SIZE)
  renderer.setClearColor(0, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'))
  }
  const environment = new THREE.Scene()
  environment.background = new THREE.Color(.012, .014, .02)
  const cardGeometry = new THREE.PlaneGeometry(1, 1)
  const cards: THREE.MeshBasicMaterial[] = []
  const addCard = (color: THREE.Color, position: THREE.Vector3, width: number, height: number) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    cards.push(material)
    const card = new THREE.Mesh(cardGeometry, material)
    card.position.copy(position)
    card.scale.set(width, height, 1)
    card.lookAt(0, 0, 0)
    environment.add(card)
  }
  addCard(new THREE.Color(6, 6, 6), new THREE.Vector3(-3, 2, 5), 1.3, 6)
  addCard(new THREE.Color(2.5, .5, 1.4), new THREE.Vector3(4, 0, 3), 3, 5)
  addCard(new THREE.Color(.4, 2.0, 3.0), new THREE.Vector3(0, 4, 2), 5, 1)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(environment, .015)
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE)
  target.texture.colorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.environment = env.texture
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 80)
  const render = () => {
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    const pixels = new Uint8Array(SIZE * SIZE * 4)
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels)
    return pixels
  }
  const compare = (material: THREE.MeshPhysicalMaterial, distance: number) => {
    camera.position.set(0, 0, distance)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    scene.environmentRotation.set(0, 0, 0)
    const baseline = render()
    const repeat = render()
    scene.environmentRotation.y = .8
    const shiftedLight = render()
    scene.environmentRotation.y = 0
    camera.position.set(distance * Math.sin(.24), 0, distance * Math.cos(.24))
    camera.lookAt(0, 0, 0)
    const shiftedView = render()
    camera.position.set(0, 0, distance)
    camera.lookAt(0, 0, 0)
    const originalRoughness = material.roughness
    material.roughness = .54
    const rough = render()
    material.roughness = originalRoughness
    const restored = render()
    return { baseline: luminance(baseline), rough: luminance(rough),
      light: difference(baseline, shiftedLight), view: difference(baseline, shiftedView),
      roughness: difference(baseline, rough), repeat: difference(baseline, repeat),
      restored: difference(baseline, restored) }
  }
  const spine = createSpineAssembly(false, false)
  const modelScene = new THREE.Scene()
  const worlds = createSceneWorlds(modelScene, false, false)
  const artworkData = new Uint8Array(64 * 32 * 4)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    const u = x / 63, v = y / 31, offset = (y * 64 + x) * 4
    artworkData.set([Math.round(45 + 140 * (1 - u)), Math.round(65 + 95 * v),
      Math.round(50 + 125 * u), 255], offset)
  }
  const artworkTexture = new THREE.DataTexture(artworkData, 64, 32)
  artworkTexture.colorSpace = THREE.SRGBColorSpace
  artworkTexture.minFilter = artworkTexture.magFilter = THREE.LinearFilter
  artworkTexture.needsUpdate = true
  const artworkReady = { value: 0 }
  const neutralFlow = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1)
  neutralFlow.needsUpdate = true
  const artworkMaterial = createScaleSurface(false, {
    pointerNdc: { value: new THREE.Vector2() }, pointerStrength: { value: 0 },
    pointerAspect: { value: 1 }, pointerFlow: { value: neutralFlow }, surfaceTime: { value: 6.5 },
    surfaceExtent: { value: 6 }, pointerWaves: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    lightDepth: { value: 0 },
  }, undefined, { map: { value: artworkTexture }, ready: artworkReady })
  try {
    spine.update(.4, 1, 1)
    const bones = spine.group.getObjectByName('aether-spine-vertebrae')
    if (!(bones instanceof THREE.InstancedMesh)) throw new Error('Production column was not created')
    scene.add(bones)
    const column = compare(bones.material as THREE.MeshPhysicalMaterial, 7)
    scene.remove(bones)

    worlds.update(6.5, .83)
    const tiles = modelScene.getObjectByName('aether-scale-tiles')
    if (!(tiles instanceof THREE.InstancedMesh)) throw new Error('Production scale panel was not created')
    scene.add(tiles)
    const scaleMaterial = tiles.material as THREE.MeshPhysicalMaterial
    const scale = compare(scaleMaterial, 10)
    const proceduralPixels = render()
    tiles.material = artworkMaterial
    const waitingPixels = render()
    artworkReady.value = 1
    const artworkPixels = render()
    const artwork = compare(artworkMaterial, 10)
    artworkReady.value = 0
    const fallbackPixels = render()
    const artworkTransition = { waiting: difference(proceduralPixels, waitingPixels),
      loaded: difference(waitingPixels, artworkPixels), fallback: difference(waitingPixels, fallbackPixels) }
    tiles.material = scaleMaterial

    // Compare the geometric triangle normal against the shader's unperturbed
    // normal after hinge rotation. A screen-space normal offset breaks this
    // contract even if pointer pixel counts still pass.
    const compile = scaleMaterial.onBeforeCompile
    const cacheKey = scaleMaterial.customProgramCacheKey()
    scaleMaterial.onBeforeCompile = (shader, activeRenderer) => {
      compile.call(scaleMaterial, shader, activeRenderer)
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        vec3 geometricNormal = normalize(cross(dFdx(-vViewPosition), dFdy(-vViewPosition)));
        float normalError = 1. - abs(dot(normalize(nonPerturbedNormal), geometricNormal));
        gl_FragColor = vec4(clamp(normalError * 100., 0., 1.), step(.999, vTileFace), 0., 1.);
      `)
    }
    scaleMaterial.customProgramCacheKey = () => cacheKey + '-normal-diagnostic'
    scaleMaterial.needsUpdate = true
    worlds.update(8.7, .83, { ndc: new THREE.Vector2(.27, .14), strength: 1,
      active: true, aspect: 1 }, camera)
    const normals = render()
    let normalPixels = 0, normalError = 0, badNormals = 0
    for (let i = 0; i < normals.length; i += 4) {
      if (normals[i + 1] < 250) continue
      normalPixels++
      normalError += normals[i] / 255
      if (normals[i] > 12) badNormals++
    }
    return { errors, column, scale, artwork, artworkTransition, normals: { pixels: normalPixels,
      meanAmplifiedError: normalError / Math.max(1, normalPixels),
      badFraction: badNormals / Math.max(1, normalPixels) } }
  } finally {
    scene.clear()
    worlds.dispose()
    spine.dispose()
    artworkMaterial.dispose()
    artworkTexture.dispose()
    neutralFlow.dispose()
    env.dispose()
    pmrem.dispose()
    cards.forEach(material => material.dispose())
    cardGeometry.dispose()
    target.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
