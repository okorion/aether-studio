import * as THREE from 'three'

/** Compile hidden sections before the first interactive frame, in both output paths. */
export async function prepareSceneShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  cancelled: () => boolean,
) {
  // Bloom/refraction use linear half-float output; the fallback draws directly
  // to sRGB. Warming only the canvas would still compile again on entry.
  const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType })
  const previous = renderer.getRenderTarget()
  try {
    // Canvas titles/wrappers and static grain maps otherwise upload exactly
    // when their section first appears. Never load/advance a VideoTexture here.
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
    textures.forEach(texture => renderer.initTexture(texture))
    let linear: Promise<unknown>
    try {
      renderer.setRenderTarget(target)
      linear = renderer.compileAsync(scene, camera)
    } finally {
      renderer.setRenderTarget(previous)
    }
    await linear
    if (cancelled()) return
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
      renderer.render(scene, camera)
    } finally {
      for (const state of saved) {
        state.object.visible = state.visible
        state.object.frustumCulled = state.culled
        state.object.onBeforeRender = state.before
      }
      renderer.setRenderTarget(previous)
    }
    await renderer.compileAsync(scene, camera)
  } finally {
    target.dispose()
  }
}
