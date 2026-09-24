import * as THREE from 'three'
import { createSceneGlow } from '../../src/SceneGlow'
import { createPointerFlow } from '../../src/PointerFlow'
import { createSceneLayers } from '../../src/SceneLayers'

type PixelDifference = {
  maxError: number
  meanError: number
  differentComponents: number
  changedPixels: number
  meanLumaShift: number
}

/** Same local text/grid image in both paths; no copy of the production stage/UV formulas. */
export function probeSurfaceFlow(mobile: boolean) {
  const width = mobile ? 96 : 128, height = mobile ? 128 : 96
  const aspect = width / height
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.info.autoReset = false
  const errors: string[] = []
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    errors.push(gl.getProgramInfoLog(program) ?? '', gl.getShaderInfoLog(vertex) ?? '', gl.getShaderInfoLog(fragment) ?? '')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Surface flow fixture could not create its text/grid canvas')
  context.fillStyle = '#122332'
  context.fillRect(0, 0, width, height)
  // Sharp edges reveal even a subpixel warp; colored swatches exercise midtones.
  for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
    context.fillStyle = ((x + y) / 8) % 2 ? '#426f8c' : '#23464c'
    context.fillRect(x, y, 8, 8)
  }
  context.strokeStyle = '#a8c2be'
  context.lineWidth = 1
  for (let x = 4; x < width; x += 8) { context.beginPath(); context.moveTo(x + .5, 0); context.lineTo(x + .5, height); context.stroke() }
  context.fillStyle = '#eee4cc'
  context.font = `bold ${mobile ? 23 : 29}px monospace`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('FLOW', width * .5, height * .50)
  for (const [index, color] of ['#3474a3', '#be547e', '#92ba63', '#c2a36d'].entries()) {
    context.fillStyle = color
    context.fillRect(index * width / 4, height * .08, width / 4, height * .12)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  const material = new THREE.MeshBasicMaterial({ map: texture })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10)
  camera.position.z = 2
  const flow = createPointerFlow()
  const glow = createSceneGlow(renderer, scene, camera, !mobile)
  glow.resize(width, height, 1)
  const input = { flowTexture: flow.texture, aspect }
  const gl = renderer.getContext()
  const read = () => {
    const bytes = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    const error = gl.getError()
    if (error !== gl.NO_ERROR) throw new Error(`Surface flow GPU readback failed: ${error}`)
    return bytes
  }
  const direct = () => {
    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
    return read()
  }
  const composed = (progress: number) => {
    glow.update(7, progress, input)
    renderer.info.reset()
    // Neutral-color comparisons disable bloom. Mobile does not construct it.
    glow.render(0, false)
    return { pixels: read(), drawCalls: renderer.info.render.calls }
  }
  const difference = (before: Uint8Array, after: Uint8Array,
    region: (x: number, y: number) => boolean = () => true): PixelDifference => {
    let maxError = 0, sum = 0, differentComponents = 0, changedPixels = 0, pixels = 0, luma = 0
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!region((x + .5) / width, (y + .5) / height)) continue
      pixels++
      let changed = false
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        const delta = after[offset + channel] - before[offset + channel]
        const error = Math.abs(delta)
        maxError = Math.max(maxError, error)
        sum += error
        if (error) differentComponents++
        if (error > 2) changed = true
        luma += delta * [0.2126, 0.7152, 0.0722][channel]
      }
      if (changed) changedPixels++
    }
    return { maxError, meanError: sum / Math.max(1, pixels * 3), differentComponents,
      changedPixels, meanLumaShift: luma / Math.max(1, pixels) }
  }
  const stroke = (lowerLeft = false) => {
    // Production brush/advection/pressure is advanced using ordinary frame deltas.
    // Events stay close enough that its resume/teleport gate never bridges a gap.
    const samples = 13
    for (let i = 0; i < samples; i++) {
      const x = lowerLeft ? -.91 + i * .035 : -.6 + i * .1
      const y = lowerLeft ? -.52 + Math.sin(i * .35) * .04 : Math.sin(i * .35) * .06
      flow.move(x, y, aspect)
      flow.update(1 / 60)
    }
  }
  try {
    const reference = direct()
    const viewportBefore = renderer.getViewport(new THREE.Vector4()).toArray()
    const scissorBefore = renderer.getScissor(new THREE.Vector4()).toArray()
    glow.update(7, 0, input)
    glow.prepare()
    const preparation = {
      canvasDrift: difference(reference, read()),
      restoredTarget: renderer.getRenderTarget() === null,
      viewportPreserved: renderer.getViewport(new THREE.Vector4()).toArray().every((v, i) => v === viewportBefore[i]),
      scissorPreserved: renderer.getScissor(new THREE.Vector4()).toArray().every((v, i) => v === scissorBefore[i]),
    }
    const neutral = composed(0)
    const programsBeforeStroke = renderer.info.programs?.length ?? 0
    stroke()
    const refracted = composed(0)
    const lowerForest = composed(.975)
    const statementBackground = composed(.175)
    const programsAfterStroke = renderer.info.programs?.length ?? 0
    flow.release()
    const released = composed(0)
    flow.clear()
    const cleared = composed(0)
    stroke()
    flow.update(.5)
    const gapCleared = composed(0)
    // A new position after a gap establishes an anchor without resurrecting a wake.
    flow.move(.64, -.64, aspect)
    flow.update(1 / 60)
    const gapReentry = composed(0)

    // Test the gallery on a linear output, below clipping. Any additive veil
    // must produce the same color delta over the grid and a black surface.
    // A displaced grid changes that residual at its edges, independently of
    // how the production shader computes its stage weights or flow offsets.
    renderer.toneMapping = THREE.NoToneMapping
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    material.color.setRGB(.4, .4, .4)
    flow.clear()
    stroke(true)
    const directGrid = direct()
    const mistGrid = composed(.4).pixels
    material.color.setRGB(0, 0, 0)
    const directBlack = direct()
    const mistBlack = composed(.4).pixels
    let residualMax = 0, residualSum = 0, residualBeyondTwo = 0
    let leftMistPixels = 0, outsideMistPixels = 0
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      let added = false
      for (let channel = 0; channel < 3; channel++) {
        const gridDelta = mistGrid[offset + channel] - directGrid[offset + channel]
        const blackDelta = mistBlack[offset + channel] - directBlack[offset + channel]
        const error = Math.abs(gridDelta - blackDelta)
        residualMax = Math.max(residualMax, error)
        residualSum += error
        if (error > 2) residualBeyondTwo++
        if (blackDelta > 0) added = true
      }
      if (added && (x + .5) / width < .45 && (y + .5) / height < .6) leftMistPixels++
      if (added && (x + .5) / width >= .8) outsideMistPixels++
    }
    flow.clear()
    const stillMistBlack = composed(.4).pixels
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      mobile, width, height, errors, preparation,
      neutral: difference(reference, neutral.pixels),
      refraction: difference(neutral.pixels, refracted.pixels),
      lowerForest: difference(neutral.pixels, lowerForest.pixels),
      statementBackground: difference(neutral.pixels, statementBackground.pixels),
      textRegion: difference(neutral.pixels, refracted.pixels, (x, y) => x > .08 && x < .92 && y > .35 && y < .65),
      release: difference(refracted.pixels, released.pixels),
      clear: difference(neutral.pixels, cleared.pixels),
      gapClear: difference(neutral.pixels, gapCleared.pixels),
      gapReentry: difference(neutral.pixels, gapReentry.pixels),
      programsBeforeStroke, programsAfterStroke, neutralDrawCalls: neutral.drawCalls,
      mist: {
        residualMax, residualMean: residualSum / (width * height * 3), residualBeyondTwo,
        leftMistPixels, outsideMistPixels,
        protectedRegion: difference(directGrid, mistGrid, x => x >= .8),
        response: difference(stillMistBlack, mistBlack, (x, y) => x < .45 && y < .6),
      },
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    }
  } finally {
    glow.dispose(); flow.dispose(); texture.dispose(); geometry.dispose(); material.dispose()
    renderer.dispose(); renderer.forceContextLoss()
  }
}

/** Production plate plus a depth-writing foreground silhouette, with a real flow stroke. */
export async function probeStatementPlate(mobile: boolean) {
  await document.fonts.ready
  const width = mobile ? 256 : 384, height = mobile ? 384 : 240
  const aspect = width / height
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1); renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#112529')
  const camera = new THREE.PerspectiveCamera(42, aspect, .1, 90)
  camera.position.z = 5; camera.updateMatrixWorld()
  const layers = createSceneLayers(scene)
  const geometry = new THREE.TorusGeometry(.9, .075, 12, 96)
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 })
  const ring = new THREE.Mesh(geometry, material)
  scene.add(ring)
  const flow = createPointerFlow()
  const input = { flowTexture: flow.texture, aspect }
  const glow = createSceneGlow(renderer, scene, camera, false)
  glow.resize(width, height, 1)
  const gl = renderer.getContext()
  const draw = (progress: number) => {
    layers.update(progress, camera, input)
    glow.update(0, progress, input); glow.render(0, false)
    const bytes = new Uint8Array(width * height * 4)
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes)
    return bytes
  }
  try {
    const before = draw(.175)
    const programs = renderer.info.programs?.length
    for(let i=0;i<40;i++){
      flow.move(-.82+i*.035,.31+Math.sin(i*.22)*.16,aspect)
      flow.update(1/60)
    }
    const after = draw(.175)
    let ringPixels=0, ringChanged=0, plateChanged=0
    for(let i=0;i<before.length;i+=4){
      const changed=Math.max(...[0,1,2].map(c=>Math.abs(before[i+c]-after[i+c])))>2
      if(before[i]>240&&before[i+1]<5&&before[i+2]<5){ringPixels++;if(changed)ringChanged++}
      else if(changed)plateChanged++
    }
    const programsAfter = renderer.info.programs?.length
    flow.clear()
    const cleared=draw(.175)
    const clearChanged=before.filter((v,i)=>Math.abs(v-cleared[i])>2).length
    const forests=[]
    for(const p of [0,.975]){
      flow.clear();const still=draw(p)
      for(let i=0;i<25;i++){flow.move(-.8+i*.06,.2,aspect);flow.update(1/60)}
      const moved=draw(p)
      forests.push(still.filter((v,i)=>v!==moved[i]).length)
    }
    return {ringPixels,ringChanged,plateChanged,clearChanged,forests,programs,programsAfter}
  } finally {
    glow.dispose();layers.dispose();flow.dispose();geometry.dispose();material.dispose()
    renderer.dispose();renderer.forceContextLoss()
  }
}
