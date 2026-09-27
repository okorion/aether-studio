import * as THREE from 'three'
import type { LoadingStage } from './loading'
import { beginLoadingSpan } from './LoadingTrace'

/** Compile hidden sections before the first interactive frame, in both output paths. */
export async function prepareSceneShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  cancelled: () => boolean,
  onProgress: (stage: LoadingStage) => void = () => {},
) {
  if (cancelled()) return
  // Bloom/refraction use linear half-float output; the fallback draws directly
  // to sRGB. Warming only the canvas would still compile again on entry.
  const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType })
  const previous = renderer.getRenderTarget()
  try {
    // Canvas titles/wrappers and static grain maps otherwise upload exactly
    // when their section first appears. Never load/advance a VideoTexture here.
    const endCollect = beginLoadingSpan('texture-collection')
    const textures = new Set<THREE.Texture>()
    const collect = (value: unknown) => {
      if (value instanceof THREE.Texture && !value.isRenderTargetTexture && !(value instanceof THREE.VideoTexture)) {
        textures.add(value)
      }
    }
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        Object.values(material).forEach(collect)
        if (material instanceof THREE.ShaderMaterial) Object.values(material.uniforms).forEach(uniform => collect(uniform.value))
      }
    })
    endCollect()
    const endTextures = beginLoadingSpan('texture-upload')
    textures.forEach(texture => renderer.initTexture(texture))
    endTextures()
    if (cancelled()) return
    onProgress('textures')
    let linear: Promise<unknown>
    try {
      renderer.setRenderTarget(target)
      const endSubmit = beginLoadingSpan('linear-submit')
      linear = renderer.compileAsync(scene, camera)
      endSubmit()
    } finally {
      renderer.setRenderTarget(previous)
    }
    const endLinearWait = beginLoadingSpan('linear-wait')
    await linear
    endLinearWait()
    if (cancelled()) return
    onProgress('linear')
    // Parallel compilation does not run first-use uniform queries or upload
    // geometry. Prime those against a 2px target while the CSS fallback is
    // still visible. No original visibility or reflection callback may leak.
    const saved: Array<{
      object: THREE.Object3D; visible: boolean; culled: boolean;
      before: THREE.Object3D['onBeforeRender'];
    }> = []
    scene.traverse(object => {
      saved.push({ object, visible: object.visible, culled: object.frustumCulled, before: object.onBeforeRender })
      if (!(object instanceof THREE.Light)) object.visible = true
      object.frustumCulled = false
      object.onBeforeRender = () => {}
    })
    try {
      renderer.setRenderTarget(target)
      const endRender = beginLoadingSpan('geometry-first-use-render')
      renderer.render(scene, camera)
      endRender()
    } finally {
      for (const state of saved) {
        state.object.visible = state.visible
        state.object.frustumCulled = state.culled
        state.object.onBeforeRender = state.before
      }
      renderer.setRenderTarget(previous)
    }
    if (cancelled()) return
    onProgress('geometry')
    const endDisplaySubmit = beginLoadingSpan('display-submit')
    const display = renderer.compileAsync(scene, camera)
    endDisplaySubmit()
    const endDisplayWait = beginLoadingSpan('display-wait')
    await display
    endDisplayWait()
    if (!cancelled()) onProgress('shaders')
  } finally {
    target.dispose()
  }
}
