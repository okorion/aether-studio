import * as THREE from 'three'
import { sampleJourney } from '../../src/Journey'
import { createLightFilmUniforms } from '../../src/SceneLighting'
import { createSceneLightShafts } from '../../src/SceneLightShafts'

// Bundled only by the test. The default framebuffer isolates the real helper;
// no production boot, animation loop, media decoder or capture target is used.
const width = 320, height = 200
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(width, height)
renderer.setClearColor(0x000000, 1)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1
renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, width / height, .1, 100)
const gl = renderer.getContext()
let framebuffers = 0
const createFramebuffer = gl.createFramebuffer.bind(gl)
gl.createFramebuffer = () => { framebuffers++; return createFramebuffer() }

const colors = {
  black: [0, 0, 0, 255], white: [255, 255, 255, 255],
  warm: [255, 110, 18, 255], cool: [18, 110, 255, 255],
} as const
type FilmFrame = keyof typeof colors
const textures = Object.fromEntries(Object.entries(colors).map(([name, rgba]) => {
  const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1)
  // The helper's GLSL explicitly decodes the video's sRGB bytes. NoColorSpace
  // gives the test textures the same raw sampler contract as VideoTexture.
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return [name, texture]
})) as Record<FilmFrame, THREE.DataTexture>
const externalDisposals = { black: 0, white: 0, warm: 0, cool: 0 }
for (const name of Object.keys(textures) as FilmFrame[])
  textures[name].addEventListener('dispose', () => externalDisposals[name]++)
const film = createLightFilmUniforms(textures.black)
const forestFilm = createLightFilmUniforms(textures.black)
film.ready.value = 1
forestFilm.ready.value = 1
const spill = createSceneLightShafts(scene, false, false, film, forestFilm)
let disposed = false

function summarize(bytes: Uint8Array) {
  let red = 0, green = 0, blue = 0, brightPixels = 0, nonBlackPixels = 0
  for (let i = 0; i < bytes.length; i += 4) {
    const r = bytes[i], g = bytes[i + 1], b = bytes[i + 2]
    red += r; green += g; blue += b
    if (r || g || b) nonBlackPixels++
    if (Math.max(r, g, b) >= 12) brightPixels++
  }
  return { red, green, blue, brightPixels, nonBlackPixels, total: red + green + blue }
}

function changedBytes(a: Uint8Array, b: Uint8Array) {
  let count = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++
  return count
}

function probe(progress: number, source: 'shared' | 'forest' | 'chamber' = 'shared') {
  const journey = sampleJourney(progress)
  camera.position.set(
    Math.sin(journey.azimuth) * Math.cos(journey.elevation) * journey.radius,
    journey.height + Math.sin(journey.elevation) * journey.radius,
    Math.cos(journey.azimuth) * Math.cos(journey.elevation) * journey.radius,
  )
  camera.lookAt(0, journey.height, 0)
  camera.updateMatrixWorld()
  const calls: number[] = [], frameDeltas: number[] = [], programs: number[] = [], errors: number[] = []
  const draws = (name: FilmFrame) => {
    film.map.value = source === 'forest' ? textures.black : textures[name]
    forestFilm.map.value = source === 'chamber' ? textures.black : textures[name]
    // The exact same scene time and camera isolate film contribution.
    spill.update(18, progress, camera)
    const frame = renderer.info.render.frame
    renderer.render(scene, camera)
    frameDeltas.push(renderer.info.render.frame - frame)
    calls.push(renderer.info.render.calls)
    programs.push(renderer.info.programs?.length ?? 0)
    const bytes = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    errors.push(gl.getError())
    return bytes
  }
  const black = draws('black')
  const white = draws('white')
  const warm = draws('warm')
  const cool = draws('cool')
  const whiteAgain = draws('white')
  const blackAgain = draws('black')
  return {
    progress, pixelCount: width * height,
    black: summarize(black), white: summarize(white), warm: summarize(warm), cool: summarize(cool),
    whiteRepeatChanges: changedBytes(white, whiteAgain), blackRestoreChanges: changedBytes(black, blackAgain),
    colorChanges: changedBytes(warm, cool), calls, frameDeltas, programs, errors,
    framebuffers, defaultTarget: renderer.getRenderTarget() === null,
  }
}

function releaseHelper() {
  spill.dispose()
  spill.dispose()
  return { externalDisposals: { ...externalDisposals }, sceneChildren: scene.children.length }
}

function dispose() {
  if (disposed) return
  disposed = true
  releaseHelper()
  Object.values(textures).forEach(texture => texture.dispose())
  gl.createFramebuffer = createFramebuffer
  renderer.dispose()
  renderer.forceContextLoss()
  renderer.domElement.remove()
}

declare global {
  interface Window {
    lightSpillHarness: { probe: typeof probe; releaseHelper: typeof releaseHelper; dispose: typeof dispose }
  }
}
window.lightSpillHarness = { probe, releaseHelper, dispose }
