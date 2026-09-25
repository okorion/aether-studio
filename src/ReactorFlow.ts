import * as THREE from 'three'
import { REACTOR } from './Reactor'

export type ReactorFlowInput = { flowTexture?: THREE.Texture; aspect: number }

const vertex = `varying vec2 vUv;
  void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`

// This field is the analytic curl of three smooth, independently phased
// potentials. Its derivatives are evaluated directly, with no noise asset.
const fragment = /* glsl */ `
  uniform sampler2D uPrevious;
  uniform sampler2D uRest;
  uniform sampler2D uSeed;
  uniform sampler2D uFlow;
  uniform float uDelta;
  uniform float uTime;
  uniform float uReset;
  uniform float uAspect;
  uniform mat4 uViewProjection;
  uniform mat4 uCameraWorld;
  uniform vec2 uProjection;
  varying vec2 vUv;
  vec3 curlField(vec3 p,float t) {
    p*=2.7;
    vec3 a=vec3(p.y+p.z*.7+t*.31,p.z+p.x*.8-t*.23,p.x+p.y*.6+t*.19);
    return vec3(.6*cos(a.z)-cos(a.y),.7*cos(a.x)-cos(a.z),.8*cos(a.y)-cos(a.x));
  }
  void main(){
    vec4 rest=texture2D(uRest,vUv);
    if(uReset>.5){gl_FragColor=texture2D(uSeed,vUv);return;}
    vec3 p=texture2D(uPrevious,vUv).xyz;
    vec2 oval=p.xy/vec2(1.47,1.68);
    float angle=atan(oval.y,oval.x);
    vec3 centre=vec3(cos(angle)*1.47,sin(angle)*1.68,0.);
    vec3 radial=p-centre;
    // Weak circulation keeps grains travelling through the volume; curl
    // breaks up the coherent motion without rotating the complete silhouette.
    vec3 tangent=normalize(vec3(-sin(angle)*1.47,cos(angle)*1.68,0.));
    vec3 velocity=curlField(p,uTime)*.13+tangent*(.065+rest.w*.035);
    vec3 world=p*vec3(${REACTOR.ringScale},${REACTOR.ringScale},1.)+vec3(0.,${REACTOR.worldY},0.);
    vec4 clip=uViewProjection*vec4(world,1.);
    vec2 screen=clip.xy/max(.001,clip.w)*.5+.5;
    if(clip.w>0.&&all(greaterThanEqual(screen,vec2(0.)))&&all(lessThanEqual(screen,vec2(1.)))){
      vec3 flow=texture2D(uFlow,screen).rgb;
      vec2 speed=(flow.rg-vec2(128./255.))*(255./127.);
      vec2 viewSpeed=speed/vec2(max(.25,uAspect),1.)*clip.w/uProjection;
      vec3 push=(uCameraWorld*vec4(viewSpeed,0.,0.)).xyz;
      velocity+=push/vec3(${REACTOR.ringScale},${REACTOR.ringScale},1.)*.55;
    }
    p+=velocity*uDelta;
    oval=p.xy/vec2(1.47,1.68);
    angle=atan(oval.y,oval.x);
    centre=vec3(cos(angle)*1.47,sin(angle)*1.68,0.);
    radial=p-centre;
    float distance=length(radial);
    // Each seed occupies a different shell inside the tube. Corrections act
    // normal to the O, leaving tangential travel and local wakes intact.
    float shell=.19+rest.w*.34;
    float error=distance-shell;
    vec3 normal=radial/max(.0001,distance);
    p-=normal*error*(1.-exp(-1.8*uDelta));
    // A hard outer bound is only a guard for unusually strong input.
    radial=p-centre;
    p=centre+radial*min(1.,.69/max(.0001,length(radial)));
    gl_FragColor=vec4(p,rest.w);
  }
`

/** Bounded GPU position history for the reactor only; no per-frame allocation. */
export function createReactorFlow(renderer: THREE.WebGLRenderer, mobile: boolean, seeds: Float32Array, lanes: Float32Array,
  snapshot?: Float32Array) {
  if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) return undefined
  // One state per rendered grain. Mobile already supplies its smaller seed
  // population; never map several visible grains to a single simulation texel.
  const count = seeds.length / 3
  const side = Math.ceil(Math.sqrt(count))
  const data = new Float32Array(side * side * 4)
  for (let i = 0; i < side * side; i++) {
    const seed = i % count
    const angle = seeds[seed * 3] * Math.PI * 2
    const branch = (lanes[seed * 4] * 2) % 1
    const cross = seeds[seed * 3 + 1]
    const shell = .19 + branch * .34
    data.set([Math.cos(angle) * (1.47 + Math.cos(cross) * shell),
      Math.sin(angle) * (1.68 + Math.cos(cross) * shell), Math.sin(cross) * shell, branch], i * 4)
  }
  const rest = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.FloatType)
  rest.minFilter = rest.magFilter = THREE.NearestFilter
  rest.needsUpdate = true
  const saved = snapshot?.length === data.length
    ? new THREE.DataTexture(snapshot, side, side, THREE.RGBAFormat, THREE.FloatType) : undefined
  if (saved) { saved.minFilter = saved.magFilter = THREE.NearestFilter; saved.needsUpdate = true }
  const neutral = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1)
  neutral.needsUpdate = true
  // Float positions keep small steps representable far from a seed's origin.
  const targets = [0, 1].map(() => new THREE.WebGLRenderTarget(side, side, {
    type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false,
  }))
  targets.forEach((target, i) => { target.texture.name = `aether-reactor-position-${i}` })
  const uniforms = {
    uPrevious: { value: rest as THREE.Texture }, uRest: { value: rest }, uSeed: { value: saved ?? rest },
    uFlow: { value: neutral as THREE.Texture }, uDelta: { value: 0 },
    uTime: { value: 0 }, uReset: { value: 1 }, uAspect: { value: 1 },
    uViewProjection: { value: new THREE.Matrix4() }, uCameraWorld: { value: new THREE.Matrix4() },
    uProjection: { value: new THREE.Vector2(1, 1) },
  }
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment,
    depthTest: false, depthWrite: false, toneMapped: false })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.Camera()
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4()
  let index = 0, initialized = false, disposed = false, active = false
  let previousTime = Number.NaN, previousProgress = Number.NaN, steps = 0
  const state = { value: rest as THREE.Texture }
  const draw = () => {
    const previous = renderer.getRenderTarget()
    const cubeFace = renderer.getActiveCubeFace(), mipLevel = renderer.getActiveMipmapLevel()
    renderer.getViewport(viewport); renderer.getScissor(scissor)
    const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear
    const xrEnabled = renderer.xr.enabled
    try {
      renderer.xr.enabled = false
      renderer.autoClear = true
      renderer.setRenderTarget(targets[index])
      renderer.setViewport(0, 0, side, side)
      renderer.setScissorTest(false)
      renderer.render(scene, camera)
      state.value = targets[index].texture
      uniforms.uPrevious.value = state.value
      index = 1 - index
      steps++
    } finally {
      renderer.setRenderTarget(previous, cubeFace, mipLevel)
      renderer.setViewport(viewport); renderer.setScissor(scissor)
      renderer.setScissorTest(scissorTest)
      renderer.autoClear = autoClear
      renderer.xr.enabled = xrEnabled
    }
  }
  const reset = () => {
    initialized = false
    previousTime = previousProgress = Number.NaN
    active = false
    state.value = rest
    uniforms.uPrevious.value = rest
    uniforms.uSeed.value = rest
  }
  return {
    count, side, state,
    getStatus: () => ({ enabled: !disposed, active, initialized, count, steps, profile: mobile ? 'mobile' : 'desktop' }),
    /** Compilation only. Hidden sections never advance their simulation. */
    async prepare() { if (!disposed) await renderer.compileAsync(scene, camera) },
    reset,
    suspend() { active = false; previousTime = Number.NaN },
    snapshot() {
      if (disposed || !initialized || renderer.getContext().isContextLost()) return undefined
      const values = new Float32Array(data.length)
      renderer.readRenderTargetPixels(targets[1 - index], 0, 0, side, side, values)
      return values
    },
    update(time: number, progress: number, view: THREE.Camera, input?: ReactorFlowInput, moving = true, enabled = true) {
      if (disposed) return
      const visible = progress > .662 && progress < .785
      if (!visible || !Number.isFinite(time) || !Number.isFinite(progress)) { reset(); return }
      // Navigation still reconciles visibility while an unfocused scene is
      // suspended. No initialization or integration draw runs in that state.
      if (!enabled) { active = false; previousTime = Number.NaN; return }
      const delta = Number.isFinite(previousTime) ? time - previousTime : 0
      // Small reverse scrolls retain particle identity while the analytic
      // formation smoothly takes over. A new visit or large jump re-seeds.
      const jump = Number.isFinite(previousProgress) && Math.abs(progress - previousProgress) > .035
      if (jump || delta < 0 || delta > .25) reset()
      previousTime = time
      previousProgress = progress
      active = moving
      if (!initialized) {
        uniforms.uReset.value = 1
        draw()
        initialized = true
        uniforms.uSeed.value = rest
      }
      uniforms.uReset.value = 0
      if (!moving || delta <= 0 || delta > .25 || jump) return
      uniforms.uViewProjection.value.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse)
      uniforms.uCameraWorld.value.copy(view.matrixWorld)
      uniforms.uProjection.value.set(view.projectionMatrix.elements[0], view.projectionMatrix.elements[5])
      uniforms.uAspect.value = input && Number.isFinite(input.aspect) ? THREE.MathUtils.clamp(input.aspect, .25, 5) : 1
      uniforms.uFlow.value = input?.flowTexture ?? neutral
      const substeps = Math.min(3, Math.max(1, Math.ceil(delta * 60)))
      uniforms.uDelta.value = Math.min(delta, .05) / substeps
      for (let step = 0; step < substeps; step++) {
        uniforms.uTime.value = time - (substeps - 1 - step) * uniforms.uDelta.value
        draw()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      targets.forEach(target => target.dispose())
      rest.dispose(); saved?.dispose(); neutral.dispose(); geometry.dispose(); material.dispose()
    },
  }
}
