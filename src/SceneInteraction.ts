import * as THREE from 'three'

/** Pointer input and a bounded, reusable pool of light particles. */
export function createSceneInteraction(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  reducedMotion: boolean,
  software: boolean,
) {
  const count = software ? 100 : 360
  const positions = new Float32Array(count * 3)
  const births = new Float32Array(count).fill(-100)
  const seeds = new Float32Array(count)
  const angles = new Float32Array(count)
  for (let i = 0; i < count; i++) seeds[i] = i * 2.399963
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  )
  geometry.setAttribute(
    'aBirth',
    new THREE.BufferAttribute(births, 1).setUsage(THREE.DynamicDrawUsage),
  )
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute(
    'aAngle',
    new THREE.BufferAttribute(angles, 1).setUsage(THREE.DynamicDrawUsage),
  )
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uRatio: { value: 1 } },
    vertexShader: `
      attribute float aBirth; attribute float aSeed; attribute float aAngle;
      uniform float uTime; uniform float uRatio;
      varying float vLife; varying float vSeed; varying float vAngle;
      void main() {
        float age = max(0., uTime - aBirth);
        vLife = max(0., 1. - age / 1.45); vSeed = aSeed; vAngle = aAngle;
        vec3 p = position + vec3(sin(aSeed), cos(aSeed), sin(aSeed * 2.)) * age * .28;
        p.y += age * age * .09;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((12. + 28. * fract(aSeed)) * uRatio * vLife * 10. / -mv.z, 0., 50.);
      }`,
    fragmentShader: `
      varying float vLife; varying float vSeed; varying float vAngle;
      void main() {
        vec2 uv = (gl_PointCoord - .5) * 2.;
        uv = mat2(cos(vAngle),-sin(vAngle),sin(vAngle),cos(vAngle)) * uv;
        uv.y += sin(uv.x * 3. + vSeed) * .06;
        float r = length(vec2(uv.x, uv.y * 8.));
        if (r > 1. || vLife <= 0.) discard;
        float glow = exp(-r * r * 5.) * .5 + pow(max(0., 1.-r), 6.);
        vec3 c = mix(vec3(.35,.8,1.), vec3(1.,.97,.78), fract(vSeed));
        gl_FragColor = vec4(c * 1.6, glow * vLife);
      }`,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 8
  scene.add(points)
  const pointer = new THREE.Vector2()
  const last = new THREE.Vector2(-10, -10)
  const anchor = new THREE.Vector2()
  const ray = new THREE.Vector3()
  const origin = new THREE.Vector3()
  const forward = new THREE.Vector3()
  let time = 0
  let head = 0
  let held = false
  let pointerId = -1
  let targetYaw = 0
  let targetPitch = 0
  let yaw = 0
  let pitch = 0
  let zoom = 0
  let burst = 0
  let dirty = false
  let direction = 0
  let startYaw = 0
  let startPitch = 0
  let velocityYaw = 0
  let previousMove = 0
  let previousYaw = 0
  canvas.dataset.cameraMode = 'idle'
  const home = () => !location.hash || location.hash === '#home'
  const interactive = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest('a,button,input,select,textarea,dialog,[data-no-camera]'))
  const pointAt = (x: number, y: number) => {
    ray.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize()
    // Intersect a camera-facing plane through the organism, including its back.
    // A fixed z=0 plane becomes edge-on at a quarter turn.
    camera.getWorldDirection(forward)
    const denominator = ray.dot(forward)
    const distance = denominator > 0.001 ? -camera.position.dot(forward) / denominator : 10
    return origin.copy(camera.position).addScaledVector(ray, Math.max(1, distance))
  }
  const emit = (x: number, y: number, amount: number) => {
    const p = pointAt(x, y)
    for (let i = 0; i < amount; i++) {
      const n = head++ % count
      positions[n * 3] = p.x + Math.sin(seeds[n]) * 0.03
      positions[n * 3 + 1] = p.y + Math.cos(seeds[n]) * 0.03
      positions[n * 3 + 2] = p.z + Math.sin(seeds[n] * 3) * 0.03
      births[n] = time
      angles[n] = direction + Math.sin(seeds[n]) * 0.35
    }
    dirty = true
  }
  const move = (event: PointerEvent) => {
    if (
      reducedMotion ||
      event.pointerType === 'touch' ||
      !home() ||
      document.querySelector('dialog[open]')
    )
      return
    pointer.set((event.clientX / innerWidth) * 2 - 1, 1 - (event.clientY / innerHeight) * 2)
    if (!interactive(event.target)) {
      const distance = pointer.distanceTo(last)
      if (distance > 0.004) {
        direction = Math.atan2(pointer.y - last.y, pointer.x - last.x)
        const steps = Math.min(8, Math.max(1, Math.ceil(distance * 70)))
        for (let i = 1; i <= steps; i++) {
          const t = distance > 1 ? 1 : i / steps
          emit(
            THREE.MathUtils.lerp(last.x, pointer.x, t),
            THREE.MathUtils.lerp(last.y, pointer.y, t),
            2,
          )
        }
        last.copy(pointer)
      }
    }
    if (held && event.pointerId === pointerId) {
      targetYaw = startYaw - (pointer.x - anchor.x) * 2.5
      targetPitch = THREE.MathUtils.clamp(startPitch + (pointer.y - anchor.y) * 0.8, -.6, .6)
      const seconds = Math.max(.008, Math.min(.1, (event.timeStamp - previousMove) / 1000))
      velocityYaw = THREE.MathUtils.clamp((targetYaw - previousYaw) / seconds, -2.2, 2.2)
      previousYaw = targetYaw
      previousMove = event.timeStamp
    }
  }
  const down = (event: PointerEvent) => {
    if (
      reducedMotion ||
      !home() ||
      event.button !== 0 ||
      event.pointerType === 'touch' ||
      interactive(event.target)
    )
      return
    pointerId = event.pointerId
    held = true
    anchor.set((event.clientX / innerWidth) * 2 - 1, 1 - (event.clientY / innerHeight) * 2)
    startYaw = targetYaw
    startPitch = targetPitch
    previousYaw = targetYaw
    previousMove = event.timeStamp
    velocityYaw = 0
    burst = 1
    emit(anchor.x, anchor.y, software ? 12 : 40)
    canvas.dataset.cameraMode = 'orbit'
    document.documentElement.classList.add('scene-dragging')
  }
  const release = (event?: PointerEvent) => {
    if (event instanceof PointerEvent && event.pointerId !== pointerId) return
    held = false
    pointerId = -1
    // Retain the chosen angle. Only angular velocity decays after release.
    if (event && (event.type === 'pointercancel' || event.timeStamp - previousMove > 100)) velocityYaw = 0
    canvas.dataset.cameraMode = 'idle'
    document.documentElement.classList.remove('scene-dragging')
  }
  const leave = () => {
    last.set(-10, -10)
    release()
    velocityYaw = 0
  }
  const reset = () => {
    leave()
    targetYaw = 0
    targetPitch = 0
  }
  const doubleClick = (event: MouseEvent) => {
    if (!interactive(event.target) && home()) reset()
  }
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('pointerdown', down, { passive: true })
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  window.addEventListener('blur', leave)
  window.addEventListener('hashchange', reset)
  window.addEventListener('dblclick', doubleClick)
  document.addEventListener('pointerleave', leave)
  const visibility = () => {
    if (document.hidden) leave()
  }
  document.addEventListener('visibilitychange', visibility)
  return {
    update(delta: number, elapsed: number, ratio: number) {
      time = elapsed
      material.uniforms.uTime.value = time
      material.uniforms.uRatio.value = ratio
      points.visible = !reducedMotion && home()
      if (dirty) {
        geometry.attributes.position.needsUpdate = true
        geometry.attributes.aBirth.needsUpdate = true
        geometry.attributes.aAngle.needsUpdate = true
        dirty = false
      }
      if (!held) {
        targetYaw += velocityYaw * delta
        velocityYaw *= Math.exp(-7 * delta)
      }
      yaw = THREE.MathUtils.damp(yaw, targetYaw, held ? 5 : 3, delta)
      pitch = THREE.MathUtils.damp(pitch, targetPitch, held ? 5 : 3, delta)
      // Orbit changes viewpoint, not camera distance. Pressing alone must not zoom.
      zoom = 0
      burst = Math.max(0, burst - delta * 1.5)
      return { yaw, pitch, zoom, burst }
    },
    dispose() {
      release()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', leave)
      window.removeEventListener('hashchange', reset)
      window.removeEventListener('dblclick', doubleClick)
      document.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', visibility)
      scene.remove(points)
      geometry.dispose()
      material.dispose()
    },
  }
}
