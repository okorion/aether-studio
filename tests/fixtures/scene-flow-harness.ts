import * as THREE from 'three'
import { createSceneMonitors } from '../../src/SceneMonitors'
import { monitorCatalog } from '../../src/MonitorCatalog'
import { createSceneForest } from '../../src/SceneForest'
import { createAtmosphere } from '../../src/Atmosphere'
import { createSceneVideo } from '../../src/SceneVideo'

export function probeForestLightStability() {
  const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true })
  renderer.setSize(320, 240)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0)
  const film = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); film.needsUpdate = true
  const forest = createSceneForest(scene, true, false, { map: { value: film }, ready: { value: 1 } })
  const camera = new THREE.PerspectiveCamera(42, 4 / 3, .1, 100)
  camera.position.set(0, -5, 14); camera.lookAt(0, -5, 0); camera.updateMatrixWorld()
  const pixels = () => {
    renderer.render(scene, camera)
    const result = new Uint8Array(320 * 240 * 4), gl = renderer.getContext()
    gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, result)
    return result
  }
  try {
    forest.update(0, .1, camera); const initial = pixels()
    film.image.data.set([0, 0, 0, 255]); film.needsUpdate = true
    forest.update(60, .1, camera); const later = pixels()
    let litPixels = 0, changedPixels = 0
    for (let i = 0; i < initial.length; i += 4) {
      if (initial[i] + initial[i + 1] + initial[i + 2] > 0) litPixels++
      if (initial[i] !== later[i] || initial[i + 1] !== later[i + 1] || initial[i + 2] !== later[i + 2]) changedPixels++
    }
    return { litPixels, changedPixels, error: renderer.getContext().getError() }
  } finally { forest.dispose(); film.dispose(); renderer.dispose(); renderer.forceContextLoss() }
}

export function probeMonitorCatalogue() {
  const camera = new THREE.PerspectiveCamera(42, 1.6, .1, 100)
  camera.position.set(0, 0, 12); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  return [0, 1, 3, 8].map(count => {
    const definitions = Array.from({ length: count }, (_, i) => ({ ...monitorCatalog[i % monitorCatalog.length],
      id: `test-${i}`, projectIndex: 11 + i, model: i === 1 ? { width: 4, height: 4 } : undefined }))
    const media = createSceneVideo()
    for(const texture of media.textures) Object.defineProperties(texture.image, {
      videoWidth:{value:1920,configurable:true},videoHeight:{value:1080,configurable:true},
    })
    const monitors = createSceneMonitors(true, false, media, definitions)
    try {
      const stages = [.303, .463, .623]
      const sample = (p: number) => {
        monitors.update(10, p, undefined, camera)
        monitors.group.updateMatrixWorld(true)
        return { poses: monitors.group.children.map(panel => panel.matrix.elements.slice()),
          positions: monitors.group.children.map(panel => panel.position.toArray()),
          visible: monitors.group.visible, hit: monitors.pickProject(new THREE.Vector2(), camera) }
      }
      const forward = stages.map(sample), reverse = [...stages].reverse().map(sample).reverse()
      const square = monitors.group.children[1] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial> | undefined
      return { count, forward, reverse, squareCrop:square?.material.uniforms.uVideoScale.value.toArray() }
    } finally { monitors.dispose(); media.dispose() }
  })
}

/** A seed whose hash is zero must still disappear behind a closed curtain. */
export function probeClosedForest() {
  const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true })
  renderer.setSize(320, 240)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0)
  const forest = createSceneForest(scene, true, false)
  const micro = scene.getObjectByName('aether-forest-microfoliage') as THREE.Points
  const original = micro.geometry
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,0,0, 1,0,0, 0,1,0], 3))
  geometry.setAttribute('aOrigin', geometry.getAttribute('position').clone())
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(9), 3))
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute([1,1,1], 1))
  geometry.setAttribute('aAssemblyPhase', new THREE.Float32BufferAttribute([0,0,0], 1))
  geometry.setAttribute('aAssemblySpan', new THREE.Float32BufferAttribute([.32,.32,.32], 1))
  micro.geometry = geometry
  const camera = new THREE.PerspectiveCamera(42, 80/60, .1, 100)
  camera.position.z = 12; camera.updateMatrixWorld()
  const pixels = new Uint8Array(320 * 240 * 4)
  const sample = (p: number) => {
    forest.update(0, p, camera)
    micro.parent!.position.set(0, 0, 0)
    micro.parent!.rotation.set(0, 0, 0)
    for (const grove of forest.group.children) for (const child of grove.children) child.visible = child === micro
    renderer.render(scene, camera)
    const gl = renderer.getContext(); gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels.reduce((sum, value, i) => sum + (i % 4 < 3 ? value : 0), 0)
  }
  try { return { visible: sample(.1), closed: sample(.20), reopened: sample(.1), error: renderer.getContext().getError() } }
  finally { micro.geometry = original; geometry.dispose(); forest.dispose(); renderer.dispose(); renderer.forceContextLoss() }
}

export function probeFlowerPaths() {
  const scene = new THREE.Scene(), atmosphere = createAtmosphere(scene, true, false)
  const source = scene.getObjectByName('aether-outgoing-bone-current') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const renderer = new THREE.WebGLRenderer(); renderer.setSize(1, 1)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([.27, 1.43, .3], 3))
  geometry.setAttribute('aDust', new THREE.Float32BufferAttribute([.3, 1, .2, -2], 4))
  geometry.setAttribute('aAdvected', new THREE.Float32BufferAttribute([0], 1))
  geometry.setAttribute('aFlowerPosition', new THREE.Float32BufferAttribute([4, -4.5, 1, -1], 4))
  geometry.setAttribute('aFlowerNormal', new THREE.Float32BufferAttribute([0, 1, 0], 3))
  geometry.setAttribute('aFlowerColor', new THREE.Float32BufferAttribute([1, .5, .5], 3))
  const material = new THREE.ShaderMaterial({ uniforms: source.material.uniforms,
    vertexShader: 'varying vec3 probePosition;\n' + source.material.vertexShader.replace(/}\s*$/,
      'probePosition = blossom; gl_Position = vec4(0.,0.,0.,1.); gl_PointSize = 1.; }'),
    fragmentShader: 'varying vec3 probePosition; void main(){gl_FragColor=vec4(probePosition,1.);}', depthTest: false })
  const probe = new THREE.Scene(), point = new THREE.Points(geometry, material); point.frustumCulled = false; probe.add(point)
  const camera = new THREE.PerspectiveCamera(); camera.position.z = 20
  const read = (progress: number, top: boolean) => {
    geometry.getAttribute('aFlowerPosition').setXYZW(0, 4, top ? 4.5 : -4.5, 1, top ? 1 : -1)
    geometry.getAttribute('aFlowerPosition').needsUpdate = true
    atmosphere.update(10, progress, 1)
    renderer.setRenderTarget(target); renderer.render(probe, camera)
    const pixels = new Float32Array(4); renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixels)
    return Array.from(pixels).slice(0, 3)
  }
  try {
    const times = Array.from({ length: 31 }, (_, i) => .54 + i * .006)
    const bottom = times.map(p => read(p, false)), reverse = [...times].reverse().map(p => read(p, false)).reverse()
    return { bottom, reverse, topStart: read(.23, true), topEnd: read(.36, true), error: renderer.getContext().getError() }
  } finally { atmosphere.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose(); renderer.forceContextLoss() }
}

export function probeMediaCounts() {
  return [0,1,3].map(count => {
    const media = createSceneVideo(Array.from({length:count}, () => ({src:'/unused.mp4'})))
    const before = media.status()
    media.update(false, false); media.dispose(); media.dispose()
    return { count, before, after: media.status() }
  })
}

/** Exercise the production sprite fragment with and without its old bokeh flag. */
export function probeReactorSurface() {
  const sourceScene = new THREE.Scene(), atmosphere = createAtmosphere(sourceScene, true, false)
  atmosphere.update(0, .71, 1)
  const source = sourceScene.getObjectByName('aether-current-particles') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(64, 64)
  const target = new THREE.WebGLRenderTarget(64, 64, { type: THREE.FloatType })
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0],3))
  const material = new THREE.ShaderMaterial({ uniforms: {...source.material.uniforms, probeBokeh:{value:0}},
    vertexShader:`uniform float probeBokeh; varying vec3 vColor; varying float vAlpha; varying float vBokeh;
      varying float vMachine; varying float vFlower; varying float vGrainSeed; varying vec4 vFieldClip;
      void main(){vColor=vec3(.3,.6,.4);vAlpha=1.;vBokeh=probeBokeh;vMachine=1.;vFlower=0.;vGrainSeed=.37;
      gl_Position=vec4(0.,0.,0.,1.);vFieldClip=gl_Position;gl_PointSize=48.;}`,
    fragmentShader:source.material.fragmentShader, depthTest:false, depthWrite:false })
  const scene=new THREE.Scene(), point=new THREE.Points(geometry,material); point.frustumCulled=false; scene.add(point)
  const read=(bokeh:number)=>{
    material.uniforms.probeBokeh.value=bokeh
    renderer.setRenderTarget(target);renderer.render(scene,new THREE.Camera())
    const pixels=new Float32Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels)
    return {centre:pixels[(32*64+32)*4+3], rim:pixels[(32*64+52)*4+3], pixels:Array.from(pixels)}
  }
  try { const ordinary=read(0),bokeh=read(1);return {centre:ordinary.centre,rim:ordinary.rim,
    changed:ordinary.pixels.reduce((count,v,i)=>count+Number(v!==bokeh.pixels[i]),0),error:renderer.getContext().getError()} }
  finally {atmosphere.dispose();geometry.dispose();material.dispose();target.dispose();renderer.dispose();renderer.forceContextLoss()}
}
