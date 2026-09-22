import * as THREE from 'three'
import { lightChoreographyGLSL } from '../../src/SceneLighting'

// Uses the authored MP4 and the installed renderer's own map shader as the
// reference. A raw custom sampler is the deliberately incorrect control.
async function probe(src: string) {
  const video = document.createElement('video')
  video.muted = video.defaultMuted = true
  video.playsInline = true
  video.preload = 'auto'
  video.width = 256; video.height = 160
  document.body.appendChild(video)
  const width = 128, height = 80
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height)
  renderer.setClearColor(0x000000, 1)
  renderer.toneMapping = THREE.NoToneMapping
  // Compare linear output, before display encoding can hide a transfer error.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  document.body.appendChild(renderer.domElement)
  const gl = renderer.getContext() as WebGL2RenderingContext
  const uploadFormats: number[] = []
  let automaticVideoDecode = false
  const originalUpload = gl.texImage2D
  const originalShaderSource = gl.shaderSource
  gl.texImage2D = ((...args: unknown[]) => {
    if (args.includes(video)) uploadFormats.push(Number(args[2]))
    Reflect.apply(originalUpload, gl, args)
  }) as typeof gl.texImage2D
  gl.shaderSource = (shader, source) => {
    if (source.includes('#define DECODE_VIDEO_TEXTURE\n')
      && source.includes('sampledDiffuseColor = sRGBTransferEOTF')) automaticVideoDecode = true
    originalShaderSource.call(gl, shader, source)
  }
  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  const uniforms = { uLightFilm: { value: texture }, uLightFilmReady: { value: 1 } }
  const vertexShader = `varying vec2 vUv;
    void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
  const production = new THREE.ShaderMaterial({
    uniforms, defines: { AETHER_LIGHT_FILM: 1 }, vertexShader,
    fragmentShader: `${lightChoreographyGLSL}
      varying vec2 vUv;
      void main(){
        gl_FragColor=vec4(aetherFilmColor(vUv),1.);
        #include <colorspace_fragment>
      }`,
  })
  const raw = new THREE.ShaderMaterial({
    uniforms, vertexShader,
    fragmentShader: `uniform sampler2D uLightFilm; varying vec2 vUv;
      void main(){
        gl_FragColor=vec4(texture2D(uLightFilm,vUv).rgb,1.);
        #include <colorspace_fragment>
      }`,
  })
  const basic = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const mesh = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(geometry, basic)
  const scene = new THREE.Scene()
  scene.add(mesh)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10)
  camera.position.z = 2
  camera.lookAt(0, 0, 0)

  const mediaEvent = (name: 'loadeddata' | 'seeked', action: () => void) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Video ${name} timed out`)), 10_000)
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(name, success)
      video.removeEventListener('error', failure)
    }
    const finish = (error?: Error) => { cleanup(); if (error) reject(error); else resolve() }
    const success = () => finish()
    const failure = () => finish(new Error(`Video decode failed: ${video.error?.code}`))
    video.addEventListener(name, success, { once: true })
    video.addEventListener('error', failure, { once: true })
    action()
  })
  const draw = (material: THREE.Material) => {
    mesh.material = material
    renderer.render(scene, camera)
    const bytes = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Video color readback failed')
    return bytes
  }
  try {
    await mediaEvent('loadeddata', () => { video.src = src; video.load() })
    video.pause()
    const results = []
    for (const fraction of [.18, .48]) {
      await mediaEvent('seeked', () => { video.currentTime = video.duration * fraction })
      video.pause()
      texture.needsUpdate = true
      const beforeTime = video.currentTime
      const reference = draw(basic)
      const actual = draw(production)
      const negative = draw(raw)
      const repeated = draw(basic)
      let errorSum = 0, maxError = 0, referenceDrift = 0
      let midtones = 0, midtoneLift = 0, rawBrighterPixels = 0
      for (let i = 0; i < reference.length; i += 4) {
        let brighter = false
        for (let channel = 0; channel < 3; channel++) {
          const offset = i + channel
          const error = Math.abs(actual[offset] - reference[offset])
          errorSum += error; maxError = Math.max(maxError, error)
          if (repeated[offset] !== reference[offset]) referenceDrift++
          if (negative[offset] >= 40 && negative[offset] <= 220) {
            midtones++
            midtoneLift += negative[offset] - reference[offset]
          }
          if (negative[offset] - reference[offset] > 10) brighter = true
        }
        if (brighter) rawBrighterPixels++
      }
      results.push({ fraction, beforeTime, afterTime: video.currentTime, paused: video.paused,
        meanError: errorSum / (width * height * 3), maxError, referenceDrift,
        midtones, meanMidtoneLift: midtones ? midtoneLift / midtones : 0, rawBrighterPixels })
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return { results, pixelCount: width * height, uploadFormats, rgba8: gl.RGBA8,
      srgb8Alpha8: gl.SRGB8_ALPHA8, automaticVideoDecode,
      videoSize: [video.videoWidth, video.videoHeight], revision: THREE.REVISION,
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)) }
  } finally {
    video.pause()
    texture.dispose()
    video.removeAttribute('src')
    video.load()
    geometry.dispose(); basic.dispose(); production.dispose(); raw.dispose()
    gl.texImage2D = originalUpload
    gl.shaderSource = originalShaderSource
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
    video.remove()
  }
}

declare global {
  interface Window { lightVideoColorHarness: { probe: typeof probe } }
}
window.lightVideoColorHarness = { probe }
