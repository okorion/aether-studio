import * as THREE from 'three'
import { createPointerFlow } from '../../src/PointerFlow'
import { createSurfaceFlowUniforms, surfaceFlowGLSL } from '../../src/SceneSurfaceFlow'

/** Read the production water normal, including the dry-contact mask, on GPU. */
export function probeDryContact() {
  const flow = createPointerFlow()
  const surface = createSurfaceFlowUniforms()
  surface.update({ flowTexture: flow.texture, aspect: 1.6 })
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(64, 40)
  const target = new THREE.WebGLRenderTarget(64, 40, { type: THREE.FloatType })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({ uniforms: surface.uniforms,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `${surfaceFlowGLSL}\nvarying vec2 vUv;void main(){gl_FragColor=vec4(surfaceWater(vUv),1.);}`,
  })
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.Camera()
  const pixels = new Float32Array(64 * 40 * 4)
  const read = () => {
    renderer.setRenderTarget(target); renderer.render(scene, camera)
    renderer.readRenderTargetPixels(target, 0, 0, 64, 40, pixels)
    let dryMax = 0, rimMax = 0, dryPixels = 0, energy = 0
    const field = flow.texture.image.data as Uint8Array
    for (let i = 0; i < pixels.length; i += 4) {
      const normal = Math.hypot(pixels[i], pixels[i + 1]); energy += normal
      if (field[i + 3] < 180) { dryMax = Math.max(dryMax, normal); dryPixels++ }
      if (field[i + 3] === 255 && field[i + 2] > 8) rimMax = Math.max(rimMax, normal)
    }
    return { dryMax, rimMax, dryPixels, energy }
  }
  try {
    for (let i = 0; i <= 12; i++) { flow.move(-.32 + i * .04, 0, 1.6); flow.update(1 / 60) }
    const contact = read(), recovery: number[] = []
    flow.release()
    for (let frame = 0; frame < 145; frame++) {
      flow.update(1 / 60)
      if (frame % 6 === 0) recovery.push(read().energy)
    }
    return { contact, recovery, end: read(), error: renderer.getContext().getError() }
  } finally {
    flow.dispose(); surface.dispose(); target.dispose(); geometry.dispose(); material.dispose()
    renderer.dispose(); renderer.forceContextLoss()
  }
}
