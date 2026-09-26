import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { createWaterSurface } from '../../src/SceneWater'

const width = 384, height = 256

function difference(a: Uint8Array, b: Uint8Array) {
  let changed = 0
  for (let i = 0; i < a.length; i += 4)
    if (Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]) > 3) changed++
  return changed
}

function fixture() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height)
  renderer.setClearColor(0x000000, 1)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  const errors: string[] = []
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'))
  }
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(48, width/height, .1, 100)
  camera.position.set(0, 4.5, 9)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const gl = renderer.getContext()
  const read = () => {
    const pixels = new Uint8Array(width*height*4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return pixels
  }
  return { renderer, scene, camera, errors, read, gl }
}

/** An adjacent room is visible directly but cannot enter the reactor mirror. */
export function probeAdjacentRoomExclusion() {
  const { renderer, scene, camera, read } = fixture()
  const reflector = new Reflector(new THREE.PlaneGeometry(20, 20), { textureWidth: 256, textureHeight: 256, multisample: 0 })
  const exclusions: THREE.Object3D[] = []
  const water = createWaterSurface(reflector, 20, 20, undefined, exclusions)
  water.surface.rotation.x = -Math.PI / 2
  const panel = new THREE.Mesh(new THREE.BoxGeometry(3, 2, .2), new THREE.MeshBasicMaterial({ color: 0xff00ff }))
  panel.position.set(0, 2, 0)
  scene.add(panel, water.surface)
  const count = (pixels: Uint8Array) => {
    let n = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 120 && pixels[i + 1] < 15 && pixels[i + 2] > 120) n++
    return n
  }
  const render = () => {
    water.update(4, .74, 1, true, camera)
    renderer.render(scene, camera)
    // The mirrored panel projects below the image centre; the direct panel
    // projects above it. Read final pixels, including the water shader.
    return count(read().subarray(0, width * height * 2))
  }
  try {
    const before = render()
    exclusions.push(panel)
    const after = render(), direct = count(read()), restored = panel.visible
    panel.visible = false
    render()
    return { before, after, direct, restored, hiddenPreserved: !panel.visible }
  } finally {
    water.dispose(); reflector.dispose(); reflector.geometry.dispose()
    panel.geometry.dispose(); panel.material.dispose(); renderer.dispose(); renderer.forceContextLoss()
  }
}

/** Actual mirror-camera pass, with distinct colors at independently known positions. */
export function probeWaterReflection() {
  const { renderer, scene, camera, errors, read, gl } = fixture()
  const reflector = new Reflector(new THREE.PlaneGeometry(20, 20), {
    textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .003,
  })
  const callback = reflector.onBeforeRender
  const water = createWaterSurface(reflector, 20, 20)
  water.surface.rotation.x = -Math.PI/2
  scene.add(water.surface)
  const geometry = new THREE.BoxGeometry(.7, 1.1, .35)
  const objects = [0xff0808, 0x08ff08, 0x0808ff, 0xaaaaaa].map((color, i) => {
    const material = new THREE.MeshBasicMaterial({ color })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(-2.4 + i*1.6, 1.7, 0)
    scene.add(mesh)
    return mesh
  })
  const released = { geometry: 0, material: 0, target: 0 }
  reflector.geometry.addEventListener('dispose', () => released.geometry++)
  reflector.material.addEventListener('dispose', () => released.material++)
  reflector.getRenderTarget().addEventListener('dispose', () => released.target++)
  const frameErrors: number[] = []
  const render = (time: number) => {
    water.update(time, .79, 1, true, camera)
    renderer.render(scene, camera)
    frameErrors.push(gl.getError())
    return read()
  }
  const results = []
  try {
    for (const [y, z] of [[4.5, 9], [2.7, 12]]) {
      camera.position.set(0, y, z)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      const start = render(4), moving = render(5.2), stopped = render(5.2), restored = render(4)
      const patches = objects.map((object, channel) => {
        const projected = object.position.clone()
        projected.y *= -1
        projected.project(camera)
        const expectedX = (projected.x*.5+.5)*width
        const expectedY = (projected.y*.5+.5)*height
        let count = 0, sumX = 0, sumY = 0, red = 0, green = 0, blue = 0
        for (let py = Math.max(0, Math.floor(expectedY-20)); py < Math.min(height, expectedY+20); py++) {
          for (let px = Math.max(0, Math.floor(expectedX-19)); px < Math.min(width, expectedX+19); px++) {
            const at = (py*width+px)*4
            const r = start[at], g = start[at+1], b = start[at+2]
            const rgb = [r, g, b]
            const isObject = channel < 3
              ? rgb[channel] > 45 && rgb[channel] > rgb[(channel+1)%3]*3 && rgb[channel] > rgb[(channel+2)%3]*3
              : Math.min(r, g, b) > 28 && Math.max(r, g, b) < Math.min(r, g, b)*1.12
            if (!isObject) continue
            count++; sumX += px; sumY += py; red += r; green += g; blue += b
          }
        }
        return { channel, count, red, green, blue,
          offset: count ? Math.hypot(sumX/count-expectedX, sumY/count-expectedY) : 999 }
      })
      results.push({ position: [y, z], patches, moving: difference(start, moving),
        stopped: difference(moving, stopped), restored: difference(start, restored) })
    }
    water.update(4, .79, 1, true, camera, { upper: .3, lower: .3 })
    const retainedAtFeatherOverlap = water.surface.visible
    // Capture culling deliberately allows feather/grain overlap. A band is
    // fully closed only after its edges cross beyond that conservative margin.
    water.update(4, .79, 1, true, camera, { upper: .2, lower: .4 })
    const hiddenAtClosedCurtain = !water.surface.visible
    water.update(4, .79, 1, false, camera)
    const hiddenBelowFloor = !water.surface.visible
    water.dispose()
    return { results, errors, frameErrors, retainedAtFeatherOverlap, hiddenAtClosedCurtain, hiddenBelowFloor,
      callbackRestored: reflector.onBeforeRender === callback, releasedByHelper: { ...released },
      defaultTarget: renderer.getRenderTarget() === null }
  } finally {
    water.dispose()
    reflector.dispose()
    reflector.geometry.dispose()
    objects.forEach(object => object.material.dispose())
    geometry.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

/** Bright border deliberately exposes clamp-to-edge streaks in the real shader. */
export function probeWaterReflectionBoundary() {
  const { renderer, scene, camera, errors, read, gl } = fixture()
  const water = createWaterSurface(null, 20, 20)
  water.surface.rotation.x = -Math.PI/2
  scene.add(water.surface)
  const material = water.surface.material as THREE.ShaderMaterial
  const size = 64, data = new Uint8Array(size*size*4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y*size+x)*4
    if (x < 4 || x >= size-4 || y < 4 || y >= size-4) { data[at] = 255; data[at+2] = 255 }
    data[at+3] = 255
  }
  const sentinel = new THREE.DataTexture(data, size, size)
  sentinel.needsUpdate = true
  sentinel.magFilter = THREE.NearestFilter
  material.uniforms.tDiffuse.value = sentinel
  material.uniforms.uHasReflection.value = 1
  material.uniforms.uReflectionTexel.value.set(1/size, 1/size)
  const matrix = material.uniforms.textureMatrix.value as THREE.Matrix4
  const render = (u: number, w = 1) => {
    // Constant projective coordinates isolate sampling coverage from geometry.
    matrix.set(0,0,0,u, 0,0,0,.5, 0,0,0,0, 0,0,0,w)
    water.update(4, .79, 1, true, camera)
    renderer.render(scene, camera)
    const pixels = read()
    let magenta = 0
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] > 35 && pixels[i+2] > 35 && pixels[i+1] < 15) magenta++
    return { magenta, glError: gl.getError() }
  }
  try {
    return { inside: render(.965), right: render(1.1), left: render(-.1),
      behind: render(.965, -1), errors }
  } finally {
    water.dispose()
    sentinel.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
