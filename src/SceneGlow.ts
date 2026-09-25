import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { windowWeight } from './Journey'
import { createSurfaceFlowUniforms, surfaceFlowGLSL, type SurfaceFlowInput } from './SceneSurfaceFlow'
import { columnHazeGLSL } from './SceneHaze'

/** Screen pixels never refract: only the statement plate owns fluid distortion. */
export function sampleSurfaceFlow(progress: number) {
  return {
    mist: windowWeight(progress, .245, .31, .60, .675),
  }
}

/** Mobile keeps the gallery mist without allocating the bloom pyramid. */
export function createSceneGlow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, enableBloom = true) {
  const composer = new EffectComposer(renderer)
  const render = new RenderPass(scene, camera)
  const field = createSurfaceFlowUniforms()
  const uniforms = {
    ...field.uniforms,
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 }, uMist: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  }
  const surface = new ShaderPass(new THREE.ShaderMaterial({
    name: 'aether-thin-flow-composite', uniforms,
    depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float uTime; uniform float uMist;
      uniform vec2 uResolution;
      ${surfaceFlowGLSL}
      ${columnHazeGLSL}
      void main(){
        vec2 margin=.5/uResolution;
        vec2 uv=clamp(vUv,margin,vec2(1.)-margin);
        vec4 color=texture2D(tDiffuse,uv);
        color.rgb=columnHaze(color.rgb,vUv,uResolution.x/uResolution.y,uTime,uMist);
        gl_FragColor=color;
      }`,
  }))
  const bloom = enableBloom ? new UnrealBloomPass(new THREE.Vector2(1, 1), .22, .58, 1.3) : undefined
  const output = new OutputPass()
  composer.addPass(render)
  if (bloom) composer.addPass(bloom)
  composer.addPass(output)
  // Haze belongs over the finished image. Bloom/exposure must not turn the
  // low-opacity colored veil into emissive fog when the scene gets brighter.
  composer.addPass(surface)
  let width = 1, height = 1, disposed = false
  return {
    resize(nextWidth: number, nextHeight: number, ratio: number) {
      width = nextWidth; height = nextHeight
      const dpr = Math.min(ratio, enableBloom ? 1.25 : 1)
      composer.setPixelRatio(dpr)
      composer.setSize(width, height)
      uniforms.uResolution.value.set(width * dpr, height * dpr)
    },
    update(time: number, progress: number, input?: SurfaceFlowInput) {
      field.update(input, input?.hazeTexture ?? input?.flowTexture)
      const weights = sampleSurfaceFlow(progress)
      uniforms.uTime.value = time
      uniforms.uMist.value = weights.mist
    },
    // Scene preparation cannot see fullscreen quads. Prime against private 2px
    // targets before the first visible frame or pointer movement.
    prepare() {
      const previous = renderer.getRenderTarget()
      const cube = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel()
      const read = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType })
      const write = read.clone()
      const flags = [surface.renderToScreen, bloom?.renderToScreen, output.renderToScreen]
      try {
        surface.renderToScreen = output.renderToScreen = false
        if (bloom) { bloom.renderToScreen = false; bloom.setSize(2, 2) }
        renderer.setRenderTarget(read)
        renderer.clear()
        surface.render(renderer, write, read, 0, false)
        bloom?.render(renderer, read, write, 0, false)
        output.render(renderer, read, write, 0, false)
      } finally {
        surface.renderToScreen = flags[0]!
        output.renderToScreen = flags[2]!
        if (bloom) { bloom.renderToScreen = flags[1]!; composer.setSize(width, height) }
        renderer.setRenderTarget(previous, cube, mip)
        read.dispose(); write.dispose()
      }
    },
    render(energy: number, bloomEnabled = true) {
      if (bloom) { bloom.strength = .17 + energy * .12; bloom.enabled = bloomEnabled }
      composer.render()
    },
    dispose() {
      if (disposed) return
      disposed = true
      render.dispose(); surface.dispose(); bloom?.dispose(); output.dispose(); composer.dispose(); field.dispose()
    },
  }
}
