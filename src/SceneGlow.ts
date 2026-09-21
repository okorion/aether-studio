import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** Bounded HDR glow; software and narrow screens use the direct render path. */
export function createSceneGlow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const composer = new EffectComposer(renderer)
  const render = new RenderPass(scene, camera)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .22, .58, 1.3)
  const output = new OutputPass()
  composer.addPass(render)
  composer.addPass(bloom)
  composer.addPass(output)
  return {
    resize(width: number, height: number, ratio: number) {
      composer.setPixelRatio(Math.min(ratio, 1.25))
      composer.setSize(width, height)
    },
    render(energy: number) {
      bloom.strength = .17 + energy * .12
      composer.render()
    },
    dispose() { render.dispose(); bloom.dispose(); output.dispose(); composer.dispose() },
  }
}
