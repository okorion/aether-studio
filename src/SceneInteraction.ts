import * as THREE from 'three'
import { createPointerFlow } from './PointerFlow'

/** Bounded world-space ribbons and pointer-controlled camera input. */
export function createSceneInteraction(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  reducedMotion: boolean,
  software: boolean,
  initialView = { yaw: 0, pitch: 0 },
) {
  const lifetime = 2.35
  const capacity = software ? 64 : 112
  const subdivisions = software ? 10 : 16
  const maxQuads = (capacity - 1) * subdivisions
  const history = new Float32Array(capacity * 3)
  const historyBirths = new Float32Array(capacity)
  const historyStrokes = new Uint32Array(capacity)
  const historySeeds = new Float32Array(capacity)
  const ribbonPositions = new Float32Array(maxQuads * 12)
  const tangents = new Float32Array(maxQuads * 12)
  const ribbonBirths = new Float32Array(maxQuads * 4)
  const sides = new Float32Array(maxQuads * 4)
  const strandIds = new Float32Array(maxQuads * 4)
  const along = new Float32Array(maxQuads * 4)
  const indices = new Uint16Array(maxQuads * 6)
  for (let q = 0; q < maxQuads; q++) {
    const v = q * 4
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6)
    sides.set([-1, 1, -1, 1], v)
  }
  const ribbonGeometry = new THREE.BufferGeometry()
  const dynamic = (array: Float32Array, size: number) =>
    new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
  ribbonGeometry.setAttribute('position', dynamic(ribbonPositions, 3))
  ribbonGeometry.setAttribute('aTangent', dynamic(tangents, 3))
  ribbonGeometry.setAttribute('aBirth', dynamic(ribbonBirths, 1))
  ribbonGeometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1))
  ribbonGeometry.setAttribute('aStrand', dynamic(strandIds, 1))
  ribbonGeometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1))
  ribbonGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
  ribbonGeometry.setDrawRange(0, 0)
  const ribbonMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uHeight: { value: innerHeight } },
    vertexShader: `
      attribute vec3 aTangent;
      attribute float aBirth; attribute float aSide; attribute float aStrand; attribute float aAlong;
      uniform float uTime; uniform float uHeight;
      varying float vSide; varying float vLife; varying float vAlong; varying float vSeed;
      vec2 flight(float age, vec2 direction, vec2 normal, float seed) {
        float turn = (seed - .5) * .72;
        float speed = 42. + seed * 38.;
        return direction * speed * age + normal * (turn * age * age * 17.
          + sin(age * 1.1 + seed * 6.28) * age * 8.);
      }
      void main() {
        float age = max(0., uTime - aBirth);
        float life = clamp(1. - age / 2.35, 0., 1.);
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        vec2 tangent = (modelViewMatrix * vec4(aTangent, 0.)).xy;
        vec2 direction = tangent / max(length(tangent), .0001);
        vec2 normal = vec2(-direction.y, direction.x);
        float seed = fract(sin(aStrand * 12.9898) * 43758.5453);
        float t = aAlong;
        // The luminous head actually advances after input stops. Every tail
        // vertex samples the same curved flight at an earlier age.
        float history = min(age + .045, 1.45);
        float sampleAge = max(-.045, age - t * history);
        vec2 offset = flight(sampleAge, direction, normal, seed);
        float head = exp(-t * t * 430.);
        float taper = pow(max(0., 1. - t), 1.4);
        float width = (.90 + seed * .35 + head * 2.7) * (.25 + taper * .75) * pow(life, .25);
        vec2 curveTangent = flight(sampleAge + .01, direction, normal, seed) - offset;
        vec2 edge = vec2(-curveTangent.y, curveTangent.x) / max(length(curveTangent), .0001);
        offset += edge * aSide * width;
        // CSS-pixel widths remain silky when the camera descends or orbits.
        mv.xy += offset * (2. * max(.1, -mv.z) / (uHeight * projectionMatrix[1][1]));
        gl_Position = projectionMatrix * mv;
        vSide = aSide; vLife = life; vAlong = t; vSeed = seed;
      }`,
    fragmentShader: `
      varying float vSide; varying float vLife; varying float vAlong; varying float vSeed;
      void main() {
        float head = exp(-vAlong * vAlong * 430.);
        float soft = exp(-vSide * vSide * 3.);
        float silver = exp(-vSide * vSide * mix(5., 13., head));
        float fade = smoothstep(0., .3, vLife) * pow(vLife, .4);
        float tip = 1. - smoothstep(.76, 1., vAlong);
        float reflection = .9 + .1 * sin(vAlong * 18. + vSeed * 9.);
        vec3 reflectionColor = mix(vec3(.57,.72,.71), vec3(.97,.99,.90), head);
        vec3 color = mix(vec3(.22,.39,.40), reflectionColor, silver);
        float alpha = (soft * (.13 + head * .32) + silver * (.45 + head * .6)) * fade * tip * reflection;
        alpha *= .85 + vSeed * .15;
        gl_FragColor = vec4(color, alpha);
      }`,
  })
  const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial)
  ribbon.name = 'aether-pointer-ribbons'
  ribbon.frustumCulled = false
  ribbon.renderOrder = 8
  scene.add(ribbon)

  // Sparse motes soften the edges without returning to a spray of bright dashes.
  const count = software ? 40 : 100
  const positions = new Float32Array(count * 3)
  const births = new Float32Array(count).fill(-100)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) seeds[i] = i * 2.399963
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', dynamic(positions, 3))
  geometry.setAttribute('aBirth', dynamic(births, 1))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uRatio: { value: 1 } },
    vertexShader: `
      attribute float aBirth; attribute float aSeed;
      uniform float uTime; uniform float uRatio;
      varying float vLife;
      void main() {
        float age = max(0., uTime - aBirth);
        vLife = max(0., 1. - age / 1.7);
        vec3 p = position + vec3(sin(aSeed), cos(aSeed), sin(aSeed * 2.)) * age * .07;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((1.2 + 1.6 * fract(aSeed)) * uRatio * vLife, 0., 4.);
      }`,
    fragmentShader: `
      varying float vLife;
      void main() {
        vec2 uv = (gl_PointCoord - .5) * 2.;
        float r = dot(uv, uv);
        if (r > 1. || vLife <= 0.) discard;
        gl_FragColor = vec4(.65,.88,.88, exp(-r * 4.) * vLife * .4);
      }`,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 9
  scene.add(points)
  const pointer = new THREE.Vector2()
  const last = new THREE.Vector2(-10, -10)
  const anchor = new THREE.Vector2()
  const ray = new THREE.Vector3()
  const origin = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const focus = new THREE.Vector3()
  const planeOffset = new THREE.Vector3()
  const sample = new THREE.Vector3()
  const sampleTangent = new THREE.Vector3()
  let time = 0
  let head = 0
  let historyStart = 0
  let historySize = 0
  let stroke = 1
  let nextSeed = 1
  let lastSample = -Infinity
  let lastMote = -Infinity
  let held = false
  let pointerId = -1
  let orbitEnabled = true
  let targetYaw = initialView.yaw
  let targetPitch = initialView.pitch
  let yaw = initialView.yaw
  let pitch = initialView.pitch
  let burst = 0
  let dirty = false
  let startYaw = 0
  let startPitch = 0
  let velocityYaw = 0
  let previousMove = 0
  let previousYaw = 0
  let disposed = false
  let enabled = true
  // Shared lighting input stays independent of the scene's orbit permission.
  const flow = createPointerFlow()
  const field = {
    ndc: new THREE.Vector2(), strength: 0, aspect: innerWidth / innerHeight, active: false,
    flowTexture: flow.texture,
  }
  let fieldTarget = 0
  const clearField = () => {
    field.active = false
    fieldTarget = field.strength = 0
    flow.clear()
  }
  canvas.dataset.cameraMode = 'idle'
  canvas.dataset.orbitEnabled = 'true'
  const home = () => !location.hash || location.hash === '#home'
  const interactive = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest('a,button,input,select,textarea,dialog,label,summary,[role="button"],[role="link"],[contenteditable]:not([contenteditable="false"]),[data-no-camera]'))
  const blocked = () => Boolean(document.querySelector('dialog[open]'))
  const pointAt = (x: number, y: number) => {
    ray.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize()
    camera.getWorldDirection(forward)
    const denominator = ray.dot(forward)
    const distance = denominator > 0.001
      ? planeOffset.copy(focus).sub(camera.position).dot(forward) / denominator
      : camera.position.distanceTo(focus)
    return origin.copy(camera.position).addScaledVector(ray, Math.max(.1, distance))
  }
  const breakStroke = () => {
    if (last.x !== -10) stroke++
    last.set(-10, -10)
    lastSample = -Infinity
  }
  let ribbonDirty = true
  const addSample = (x: number, y: number) => {
    ribbonDirty = true
    const p = pointAt(x, y)
    if (historySize === capacity) {
      historyStart = (historyStart + 1) % capacity
      historySize--
    }
    const index = (historyStart + historySize++) % capacity
    history.set([p.x, p.y, p.z], index * 3)
    historyBirths[index] = time
    historyStrokes[index] = stroke
    historySeeds[index] = nextSeed++
    if (time - lastMote > (software ? .11 : .065)) {
      const n = head++ % count
      positions.set([p.x, p.y, p.z], n * 3)
      births[n] = time
      lastMote = time
      dirty = true
    }
  }
  // Catmull-Rom positions/tangents smooth the birth path. The GPU advances
  // each independent head and samples its curved flight history for the tail.
  const buildRibbon = () => {
    while (historySize && time - historyBirths[historyStart] > lifetime) {
      historyStart = (historyStart + 1) % capacity
      historySize--
      ribbonDirty = true
    }
    if (!ribbonDirty) return
    ribbonDirty = false
    let quads = 0
    for (let i = 0; i < historySize - 1; i++) {
      const b = (historyStart + i) % capacity
      const c = (b + 1) % capacity
      if (historyStrokes[b] !== historyStrokes[c]) continue
      const previous = (b + capacity - 1) % capacity
      const next = (c + 1) % capacity
      const a = i > 0 && historyStrokes[previous] === historyStrokes[b] ? previous : b
      const d = i + 2 < historySize && historyStrokes[next] === historyStrokes[b] ? next : c
      for (let axis = 0; axis < 3; axis++) {
        const p0 = history[a * 3 + axis]
        const p1 = history[b * 3 + axis]
        const p2 = history[c * 3 + axis]
        const p3 = history[d * 3 + axis]
        const v0 = (p2 - p0) * .5
        const v1 = (p3 - p1) * .5
        const k2 = 3 * (p2 - p1) - 2 * v0 - v1
        const k3 = 2 * (p1 - p2) + v0 + v1
        sample.setComponent(axis, p1 + v0 * .5 + k2 * .25 + k3 * .125)
        sampleTangent.setComponent(axis, v0 + k2 + k3 * .75)
      }
      for (let segment = 0; segment < subdivisions; segment++) {
        for (let vertex = 0; vertex < 4; vertex++) {
          const endpoint = vertex < 2 ? 0 : 1
          const index = quads * 4 + vertex
          sample.toArray(ribbonPositions, index * 3)
          sampleTangent.toArray(tangents, index * 3)
          ribbonBirths[index] = (historyBirths[b] + historyBirths[c]) * .5
          strandIds[index] = historySeeds[b]
          along[index] = (segment + endpoint) / subdivisions
        }
        quads++
      }
    }
    ribbonGeometry.setDrawRange(0, quads * 6)
    if (quads) {
      for (const name of ['position', 'aTangent', 'aBirth', 'aStrand', 'aAlong']) {
        ribbonGeometry.getAttribute(name).needsUpdate = true
      }
    }
  }
  const move = (event: PointerEvent) => {
    if (!enabled || reducedMotion || document.hidden || event.pointerType === 'touch' || !home() || blocked() ||
      !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) ||
      event.clientX < 0 || event.clientX > innerWidth || event.clientY < 0 || event.clientY > innerHeight) {
      clearField()
      breakStroke()
      return
    }
    pointer.set((event.clientX / innerWidth) * 2 - 1, 1 - (event.clientY / innerHeight) * 2)
    if (interactive(event.target)) {
      clearField()
      breakStroke()
    } else {
      field.active = true
      fieldTarget = 1
      flow.move(pointer.x, pointer.y, innerWidth / Math.max(1, innerHeight))
      const distance = pointer.distanceTo(last)
      if (last.x === -10 || (distance > .006 && event.timeStamp - lastSample >= (software ? 42 : 30))) {
        if (event.timeStamp - lastSample > 180) breakStroke()
        addSample(pointer.x, pointer.y)
        last.copy(pointer)
        lastSample = event.timeStamp
      }
    }
    if (orbitEnabled && held && event.pointerId === pointerId) {
      targetYaw = startYaw - (pointer.x - anchor.x) * 2.5
      // Dragging down raises the viewpoint over the central object; dragging
      // up exposes its underside. Horizontal orbit retains its existing sign.
      targetPitch = THREE.MathUtils.clamp(startPitch - (pointer.y - anchor.y) * .8, -.6, .6)
      const seconds = Math.max(.008, Math.min(.1, (event.timeStamp - previousMove) / 1000))
      velocityYaw = THREE.MathUtils.clamp((targetYaw - previousYaw) / seconds, -2.2, 2.2)
      previousYaw = targetYaw
      previousMove = event.timeStamp
    }
  }
  const down = (event: PointerEvent) => {
    if (!enabled || reducedMotion || document.hidden || !home() || blocked() ||
      event.pointerType === 'touch' || interactive(event.target)) {
      clearField()
      return
    }
    if (!orbitEnabled || event.button !== 0) return
    pointerId = event.pointerId
    held = true
    anchor.set((event.clientX / innerWidth) * 2 - 1, 1 - (event.clientY / innerHeight) * 2)
    startYaw = targetYaw
    startPitch = targetPitch
    previousYaw = targetYaw
    previousMove = event.timeStamp
    velocityYaw = 0
    burst = .35
    canvas.dataset.cameraMode = 'orbit'
    document.documentElement.classList.add('scene-dragging')
  }
  const release = (event?: PointerEvent) => {
    if (event?.type === 'pointercancel') {
      clearField()
    }
    if (event instanceof PointerEvent && event.pointerId !== pointerId) return
    held = false
    pointerId = -1
    if (event && (event.type === 'pointercancel' || event.timeStamp - previousMove > 100)) velocityYaw = 0
    canvas.dataset.cameraMode = 'idle'
    document.documentElement.classList.remove('scene-dragging')
  }
  const leave = () => {
    clearField()
    breakStroke()
    release()
    velocityYaw = 0
  }
  const reset = () => {
    leave()
    targetYaw = 0
    targetPitch = 0
  }
  const navigate = () => {
    historySize = 0
    ribbonDirty = true
    births.fill(-100)
    dirty = true
    reset()
  }
  const doubleClick = (event: MouseEvent) => {
    if (enabled && !reducedMotion && orbitEnabled && !interactive(event.target) && !blocked() && home()) reset()
  }
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('pointerdown', down, { passive: true })
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  window.addEventListener('blur', leave)
  window.addEventListener('hashchange', navigate)
  window.addEventListener('dblclick', doubleClick)
  document.addEventListener('pointerleave', leave)
  const visibility = () => {
    if (document.hidden) leave()
  }
  document.addEventListener('visibilitychange', visibility)
  return {
    setActive(active: boolean) {
      enabled = active
      if (!active) leave()
    },
    setOrbitEnabled(enabled: boolean) {
      if (disposed || orbitEnabled === enabled) return
      orbitEnabled = enabled
      canvas.dataset.orbitEnabled = String(enabled)
      if (!enabled) {
        release()
        velocityYaw = 0
        targetYaw = yaw
        targetPitch = pitch
      }
    },
    setFocus(point: THREE.Vector3) {
      if (!disposed) focus.copy(point)
    },
    update(delta: number, elapsed: number, ratio: number) {
      time = elapsed
      material.uniforms.uTime.value = time
      material.uniforms.uRatio.value = ratio
      ribbonMaterial.uniforms.uTime.value = time
      ribbonMaterial.uniforms.uHeight.value = innerHeight
      points.visible = ribbon.visible = enabled && !reducedMotion && home() && !blocked()
      if (!enabled || reducedMotion || !home() || blocked() || document.hidden) {
        clearField()
      }
      flow.update(delta)
      field.ndc.lerp(pointer, 1 - Math.exp(-10 * delta))
      field.strength = THREE.MathUtils.damp(field.strength, fieldTarget, 9, delta)
      fieldTarget *= Math.exp(-1.35 * delta)
      field.aspect = innerWidth / Math.max(1, innerHeight)
      buildRibbon()
      if (dirty) {
        geometry.attributes.position.needsUpdate = true
        geometry.attributes.aBirth.needsUpdate = true
        dirty = false
      }
      if (orbitEnabled && !held) {
        targetYaw += velocityYaw * delta
        velocityYaw *= Math.exp(-7 * delta)
      }
      yaw = THREE.MathUtils.damp(yaw, targetYaw, held ? 5 : 3, delta)
      pitch = THREE.MathUtils.damp(pitch, targetPitch, held ? 5 : 3, delta)
      burst = Math.max(0, burst - delta * 1.5)
      return { yaw, pitch, zoom: 0, burst, field }
    },
    dispose() {
      if (disposed) return
      disposed = true
      leave()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', leave)
      window.removeEventListener('hashchange', navigate)
      window.removeEventListener('dblclick', doubleClick)
      document.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', visibility)
      scene.remove(points, ribbon)
      geometry.dispose()
      material.dispose()
      ribbonGeometry.dispose()
      ribbonMaterial.dispose()
      flow.dispose()
    },
  }
}
