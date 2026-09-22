import * as THREE from 'three'

/** A small shared screen-space field, independent of the particle count. */
export function createPointerFlow() {
  const width = 40, height = 28
  const cells = width * height
  let velocity = new Float32Array(cells * 2)
  let next = new Float32Array(cells * 2)
  const response = new Float32Array(cells * 2)
  const data = new Uint8Array(cells * 4)
  for (let i = 0; i < cells; i++) {
    data[i * 4] = data[i * 4 + 1] = 128
    data[i * 4 + 3] = 255
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.name = 'aether-pointer-flow'
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.colorSpace = THREE.NoColorSpace
  texture.generateMipmaps = false
  texture.flipY = false
  texture.needsUpdate = true

  let anchored = false
  let previousX = 0, previousY = 0, aspect = 1
  let previousTime = 0, sampleAge = 0, idleAge = 0
  let hasFlow = false, disposed = false
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
  const publish = () => {
    let changed = false
    for (let i = 0; i < cells; i++) {
      // Decode with (rg - 128/255) * (255/127), so neutral is EXACT zero.
      // Components use screen-height units: +R right, +G up (positive NDC Y).
      const red = 128 + Math.round(clamp(response[i * 2], -1, 1) * 127)
      const green = 128 + Math.round(clamp(response[i * 2 + 1], -1, 1) * 127)
      const offset = i * 4
      if (data[offset] !== red || data[offset + 1] !== green) {
        data[offset] = red
        data[offset + 1] = green
        changed = true
      }
    }
    if (changed) texture.needsUpdate = true
  }
  const clear = () => {
    if (disposed) return
    anchored = false
    sampleAge = idleAge = 0
    if (!hasFlow) return
    hasFlow = false
    velocity.fill(0)
    next.fill(0)
    response.fill(0)
    publish()
  }

  return {
    texture,
    move(ndcX: number, ndcY: number, nextAspect: number) {
      if (disposed) return
      if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1
        || !Number.isFinite(nextAspect) || nextAspect <= 0) {
        clear()
        return
      }
      const boundedAspect = clamp(nextAspect, .25, 5)
      const now = performance.now()
      const seconds = Math.max(sampleAge, (now - previousTime) / 1000)
      const dx = (ndcX - previousX) * boundedAspect
      const dy = ndcY - previousY
      const distance = Math.hypot(dx, dy)
      const resume = !anchored || seconds > .25 || distance > .75
      const resized = anchored && Math.abs(boundedAspect - aspect) > aspect * .15
      if (resized) clear()
      const centerX = (previousX + ndcX) * .5
      const centerY = (previousY + ndcY) * .5
      previousX = ndcX
      previousY = ndcY
      previousTime = now
      sampleAge = 0
      aspect = boundedAspect
      anchored = true
      // First contact, resumed input and teleports establish an anchor only.
      // Old trails keep decaying on a teleport; a resize clears their old axes.
      if (resume || resized || distance < .00001) return
      const dt = clamp(seconds, 1 / 240, .05)
      const speed = distance / dt
      const speedLimit = Math.min(1, 4 / Math.max(.001, speed))
      const impulseX = dx * speedLimit * 9
      const impulseY = dy * speedLimit * 9
      const radius = .28 + Math.min(.08, speed * .02)
      const gaussian = -.5 / (radius * radius)
      for (let y = 0; y < height; y++) {
        const ry = (y + .5) / height * 2 - 1 - centerY
        for (let x = 0; x < width; x++) {
          const rx = ((x + .5) / width * 2 - 1 - centerX) * aspect
          const weight = Math.exp((rx * rx + ry * ry) * gaussian)
          const i = (y * width + x) * 2
          velocity[i] = clamp(velocity[i] + impulseX * weight, -.95, .95)
          velocity[i + 1] = clamp(velocity[i + 1] + impulseY * weight, -.95, .95)
        }
      }
      idleAge = 0
      hasFlow = true
    },
    update(delta: number) {
      if (disposed) return
      // A suspended tab or invalid clock cannot integrate a giant impulse.
      if (!Number.isFinite(delta) || delta < 0 || delta > .25) {
        clear()
        return
      }
      sampleAge += delta
      if (!hasFlow || delta === 0) return
      idleAge += delta
      if (idleAge >= 2.25) {
        clear()
        return
      }
      const steps = Math.max(1, Math.ceil(delta * 60))
      const dt = delta / steps
      const damping = Math.exp(-3.8 * dt)
      const diffusion = 1 - Math.exp(-2.3 * dt)
      const follow = 1 - Math.exp(-4.35 * dt)
      const advectX = width * .5 / aspect * dt * .45
      const advectY = height * .5 * dt * .45
      for (let step = 0; step < steps; step++) {
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 2
          // Semi-Lagrangian backtrace and bilinear sampling carry older input
          // through nearby cells; diffusion stays weak enough to retain wakes.
          const sx = clamp(x - velocity[i] * advectX, 0, width - 1)
          const sy = clamp(y - velocity[i + 1] * advectY, 0, height - 1)
          const x0 = Math.floor(sx), y0 = Math.floor(sy)
          const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1)
          const tx = sx - x0, ty = sy - y0
          const a = (y0 * width + x0) * 2, b = (y0 * width + x1) * 2
          const c = (y1 * width + x0) * 2, d = (y1 * width + x1) * 2
          const left = (y * width + Math.max(0, x - 1)) * 2
          const right = (y * width + Math.min(width - 1, x + 1)) * 2
          const bottom = (Math.max(0, y - 1) * width + x) * 2
          const top = (Math.min(height - 1, y + 1) * width + x) * 2
          for (let channel = 0; channel < 2; channel++) {
            const lower = velocity[a + channel] * (1 - tx) + velocity[b + channel] * tx
            const upper = velocity[c + channel] * (1 - tx) + velocity[d + channel] * tx
            const advected = lower * (1 - ty) + upper * ty
            const neighbors = (velocity[left + channel] + velocity[right + channel]
              + velocity[bottom + channel] + velocity[top + channel]) * .25
            const value = (advected * (1 - diffusion) + neighbors * diffusion) * damping
            next[i + channel] = value
            response[i + channel] += (value - response[i + channel]) * follow
          }
        }
        const swap = velocity
        velocity = next
        next = swap
      }
      publish()
    },
    // Stop connecting new input to the old stroke without erasing its wake.
    release() { anchored = false },
    clear,
    dispose() {
      if (disposed) return
      clear()
      texture.dispose()
      disposed = true
    },
  }
}
