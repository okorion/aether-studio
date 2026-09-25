import * as THREE from 'three'

/** A small shared screen-space field, independent of the particle count. */
export function createPointerFlow(profile: 'water' | 'haze' = 'water') {
  const gas = profile === 'haze'
  const width = gas ? 96 : 64, height = gas ? 64 : 40
  const cells = width * height
  let velocity = new Float32Array(cells * 2)
  let next = new Float32Array(cells * 2)
  const response = new Float32Array(cells * 2)
  let density = new Float32Array(cells)
  let nextDensity = new Float32Array(cells)
  // Stationary dry contact history. It must not advect with the surrounding water.
  const contact = new Float32Array(cells)
  const curl = new Float32Array(cells)
  const divergence = new Float32Array(cells)
  let pressure = new Float32Array(cells)
  let nextPressure = new Float32Array(cells)
  const data = new Uint8Array(cells * 4)
  for (let i = 0; i < cells; i++) {
    data[i * 4] = data[i * 4 + 1] = 128
    data[i * 4 + 3] = 255
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.name = gas ? 'aether-haze-flow' : 'aether-pointer-flow'
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
      const blue = Math.round(clamp(density[i], 0, 1) * 255)
      const alpha = 255 - Math.round(clamp(contact[i], 0, 1) * 255)
      const offset = i * 4
      if (data[offset] !== red || data[offset + 1] !== green || data[offset + 2] !== blue || data[offset + 3] !== alpha) {
        data[offset] = red
        data[offset + 1] = green
        data[offset + 2] = blue
        data[offset + 3] = alpha
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
    density.fill(0)
    contact.fill(0)
    nextDensity.fill(0)
    curl.fill(0)
    divergence.fill(0)
    pressure.fill(0)
    nextPressure.fill(0)
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
      const radius = (.115 + Math.min(.045, speed * .012)) * (gas ? .54 : 1)
      const gaussian = -.5 / (radius * radius)
      for (let y = 0; y < height; y++) {
        const ry = (y + .5) / height * 2 - 1 - centerY
        for (let x = 0; x < width; x++) {
          const rx = ((x + .5) / width * 2 - 1 - centerX) * aspect
          const weight = Math.exp((rx * rx + ry * ry) * gaussian)
          const i = (y * width + x) * 2
          velocity[i] = clamp(velocity[i] + impulseX * weight, -.95, .95)
          velocity[i + 1] = clamp(velocity[i + 1] + impulseY * weight, -.95, .95)
          density[i / 2] = Math.min(1, density[i / 2] + distance * 10 * weight)
          if (!gas) contact[i / 2] = Math.max(contact[i / 2], clamp((weight - .68) / .20, 0, 1))
        }
      }
      idleAge = 0
      hasFlow = true
    },
    update(delta: number) {
      if (disposed) return
      // A suspended tab or invalid clock cannot integrate a giant impulse.
      if (!Number.isFinite(delta) || delta < 0 || delta > (gas ? 2 : .25)) {
        clear()
        return
      }
      sampleAge += delta
      if (!hasFlow || delta === 0) return
      // A visible frame stall must not replace the entire veil in one frame.
      // Hidden tabs still clear through the interaction lifecycle.
      if (gas && delta > .1) { anchored = false; delta = .1 }
      idleAge += delta
      if (!gas && idleAge >= 2.25) {
        clear()
        return
      }
      const steps = Math.max(1, Math.ceil(delta * 60))
      const dt = delta / steps
      const damping = Math.exp(-(gas ? 7.5 : 3.4) * dt)
      const densityDamping = Math.exp(-(gas ? 7 : 2.6) * dt)
      const diffusion = 1 - Math.exp(-(gas ? .45 : 2.3) * dt)
      const follow = 1 - Math.exp(-(gas ? 22 : 12) * dt)
      const transport = gas ? 2.2 : .45
      const advectX = width * .5 / aspect * dt * transport
      const advectY = height * .5 * dt * transport
      const hx = 2 * aspect / width, hy = 2 / height
      const hx2 = hx * hx, hy2 = hy * hy
      for (let step = 0; step < steps; step++) {
        for (let i = 0; i < cells; i++) contact[i] *= Math.exp(-1.1 * dt)
        // Curl confinement rolls the wake without introducing radial splashes.
        // Both derivatives use screen-height units, including portrait views.
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const cell = y * width + x
          const l = y * width + Math.max(0, x - 1), r = y * width + Math.min(width - 1, x + 1)
          const b = Math.max(0, y - 1) * width + x, t = Math.min(height - 1, y + 1) * width + x
          curl[cell] = (velocity[r * 2 + 1] - velocity[l * 2 + 1]) / (2 * hx)
            - (velocity[t * 2] - velocity[b * 2]) / (2 * hy)
        }
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const cell = y * width + x
          const l = y * width + Math.max(0, x - 1), r = y * width + Math.min(width - 1, x + 1)
          const b = Math.max(0, y - 1) * width + x, t = Math.min(height - 1, y + 1) * width + x
          const gx = (Math.abs(curl[r]) - Math.abs(curl[l])) / (2 * hx)
          const gy = (Math.abs(curl[t]) - Math.abs(curl[b])) / (2 * hy)
          const length = Math.max(.0001, Math.hypot(gx, gy))
          const force = clamp(curl[cell], -12, 12) * (gas ? .14 * Math.sqrt(density[cell]) : .045) * dt
          velocity[cell * 2] = clamp(velocity[cell * 2] + gy / length * force, -.95, .95)
          velocity[cell * 2 + 1] = clamp(velocity[cell * 2 + 1] - gx / length * force, -.95, .95)
        }
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
          const lowerDensity = density[a / 2] * (1 - tx) + density[b / 2] * tx
          const upperDensity = density[c / 2] * (1 - tx) + density[d / 2] * tx
          nextDensity[i / 2] = (lowerDensity * (1 - ty) + upperDensity * ty) * densityDamping
          for (let channel = 0; channel < 2; channel++) {
            const lower = velocity[a + channel] * (1 - tx) + velocity[b + channel] * tx
            const upper = velocity[c + channel] * (1 - tx) + velocity[d + channel] * tx
            const advected = lower * (1 - ty) + upper * ty
            const neighbors = (velocity[left + channel] + velocity[right + channel]
              + velocity[bottom + channel] + velocity[top + channel]) * .25
            const value = (advected * (1 - diffusion) + neighbors * diffusion) * damping
            next[i + channel] = value
          }
        }
        const swap = velocity
        velocity = next
        next = swap
        const swapDensity = density
        density = nextDensity
        nextDensity = swapDensity
        // A bounded pressure solve redistributes the brush into a thin sheet.
        pressure.fill(0)
        nextPressure.fill(0)
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const cell = y * width + x
          const l = y * width + Math.max(0, x - 1), r = y * width + Math.min(width - 1, x + 1)
          const b = Math.max(0, y - 1) * width + x, t = Math.min(height - 1, y + 1) * width + x
          divergence[cell] = (velocity[r * 2] - velocity[l * 2]) / (2 * hx)
            + (velocity[t * 2 + 1] - velocity[b * 2 + 1]) / (2 * hy)
        }
        for (let iteration = 0; iteration < 5; iteration++) {
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const cell = y * width + x
            const l = y * width + Math.max(0, x - 1), r = y * width + Math.min(width - 1, x + 1)
            const b = Math.max(0, y - 1) * width + x, t = Math.min(height - 1, y + 1) * width + x
            nextPressure[cell] = ((pressure[l] + pressure[r]) * hy2 + (pressure[b] + pressure[t]) * hx2
              - divergence[cell] * hx2 * hy2) / (2 * (hx2 + hy2))
          }
          const swapPressure = pressure
          pressure = nextPressure
          nextPressure = swapPressure
        }
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const cell = y * width + x
          const l = y * width + Math.max(0, x - 1), r = y * width + Math.min(width - 1, x + 1)
          const b = Math.max(0, y - 1) * width + x, t = Math.min(height - 1, y + 1) * width + x
          velocity[cell * 2] = clamp(velocity[cell * 2] - (pressure[r] - pressure[l]) / (2 * hx) * .7, -.95, .95)
          velocity[cell * 2 + 1] = clamp(velocity[cell * 2 + 1] - (pressure[t] - pressure[b]) / (2 * hy) * .7, -.95, .95)
          response[cell * 2] += (velocity[cell * 2] - response[cell * 2]) * follow
          response[cell * 2 + 1] += (velocity[cell * 2 + 1] - response[cell * 2 + 1]) * follow
        }
      }
      publish()
      // Retire only once every published channel is already neutral. No timed
      // reset is visible, even when a long gas wake outlives its input stroke.
      if (gas && idleAge > 1) {
        let visible = false
        for (let i = 0; i < cells; i++) {
          if (data[i * 4] !== 128 || data[i * 4 + 1] !== 128 || data[i * 4 + 2] !== 0) { visible = true; break }
        }
        if (!visible) clear()
      }
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
