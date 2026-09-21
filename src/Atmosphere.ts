import * as THREE from 'three'
import { sampleJourney } from './Journey'

/** The same current deforms continuously around the journey's central axis. */
const currentField = /* glsl */ `
  uniform float uTime;
  uniform vec4 uWeights;
  uniform float uEnergy;
  uniform float uDarkness;
  const float PI = 3.14159265359;

  vec3 current(float t, float lane) {
    float side = lane < 0.5 ? -1.0 : 1.0;
    float branch = fract(lane * 2.0);
    float ripple = sin(t * 16.0 + branch * 8.0 + uTime * 0.21);
    vec3 arrival = vec3(
      side * (0.16 + pow(1.0 - t, 1.35) * 2.55) + ripple * 0.24,
      -6.6 + t * 6.9,
      -1.4 + sin(t * 8.0 + branch * 6.0) * 1.15
    );
    // Six uneven tributaries open black pockets between dense clusters. Their
    // changing radii read as turbulent clouds, not a constant-width cylinder.
    float arm = floor(lane * 6.0);
    float armPhase = arm * 2.39996;
    float angle = t * 8.0 + armPhase + sin(t * 15.0 + armPhase) * 0.38 + uTime * 0.22;
    float radius = 0.72 + pow(sin(t * 12.0 + armPhase) * 0.5 + 0.5, 1.2) * 2.85;
    radius += fract(lane * 6.0) * 0.28;
    vec3 spine = vec3(
      cos(angle) * radius + sin(t * 17.0) * 0.32,
      (t - 0.5) * 13.5 + sin(t * 8.0 + armPhase) * 0.3,
      sin(angle) * radius * 0.72
    );
    float orbit = t * PI * 2.0 + uTime * 0.35;
    float cross = branch * PI * 2.0;
    float torusRadius = 1.30 + cos(cross) * 0.34;
    vec3 reactor = vec3(cos(orbit) * torusRadius, sin(orbit) * torusRadius, sin(cross) * 0.42);
    float sheetAngle = t * PI * 2.0 + uTime * 0.12;
    vec3 scales = vec3(
      cos(sheetAngle) * (2.6 + branch * 1.45),
      sin(sheetAngle) * (1.7 + branch * 1.1),
      -0.8 + sin(sheetAngle * 2.0 + branch * 5.0) * 1.8
    );
    vec3 ending = arrival;
    ending.y = -arrival.y + 0.35;
    ending.x *= 0.9;
    vec3 p = mix(arrival, spine, uWeights.x);
    p = mix(p, reactor, uWeights.y);
    p = mix(p, scales, uWeights.z);
    return mix(p, ending, uWeights.w);
  }

  vec3 currentColor(float lane, float t) {
    float variation = sin(lane * 39.0 + t * 5.0) * 0.5 + 0.5;
    vec3 gold = mix(vec3(0.28, 0.36, 0.08), vec3(0.95, 0.51, 0.10), variation);
    vec3 violet = mix(vec3(0.10, 0.39, 0.96), vec3(0.96, 0.15, 0.54), variation);
    vec3 cyan = mix(vec3(0.08, 0.87, 0.58), vec3(0.65, 0.24, 0.94), variation);
    vec3 iridescence = mix(vec3(0.08, 0.51, 0.55), vec3(0.77, 0.49, 0.18), variation);
    vec3 color = mix(gold, violet, uWeights.x);
    color = mix(color, cyan, uWeights.y);
    color = mix(color, iridescence, uWeights.z);
    return mix(color, gold, uWeights.w);
  }
`

const dustVertex = /* glsl */ `
  ${currentField}
  attribute vec4 aDust;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBokeh;
  void main() {
    float lane = aDust.x;
    float phase = position.y;
    // Phase advection travels the full current. Faded ends hide loop wrapping.
    float speed = 0.028 + uWeights.x * 0.074 + uWeights.y * 0.055 + uWeights.z * 0.038;
    float t = fract(position.x + uTime * speed * (0.76 + lane * 0.48));
    vec3 p = current(t, lane);
    float cluster = 0.32 + 0.68 * pow(sin(t * 35.0 + lane * 8.0) * 0.5 + 0.5, 2.0);
    float width = (0.13 + position.z * 0.72) * cluster;
    width *= 1.0 - uWeights.y * 0.52;
    float turn = phase + t * 37.0 + uTime * 0.6;
    p += vec3(cos(turn), sin(turn * 0.83) * 0.62, sin(turn)) * width;
    p.z += aDust.z * (0.18 + (1.0 - uWeights.y) * 0.38);
    float bokeh = aDust.w;
    if (bokeh > 0.5) {
      p = vec3((lane - 0.5) * 14.0, (t - 0.5) * 13.0 + uWeights.w * 3.0, -2.0 + aDust.z * 6.0);
      p.x += sin(uTime * 0.11 + phase) * 0.3;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float perspective = 12.0 / max(2.0, -mv.z);
    gl_PointSize = clamp(aDust.y * perspective * uPixelRatio, 0.65, 12.0 * uPixelRatio);
    vColor = currentColor(lane, t);
    vBokeh = bokeh;
    float shimmer = 0.73 + sin(uTime * 1.7 + phase * 7.0) * 0.2;
    float seam = smoothstep(0.0, 0.045, t) * (1.0 - smoothstep(0.94, 1.0, t));
    float distanceFade = exp(-max(0.0, -mv.z - 13.0) * 0.043);
    vAlpha = shimmer * seam * distanceFade * mix(0.72, 0.19, bokeh);
    vAlpha *= 1.0 - uDarkness * 0.23;
  }
`

const dustFragment = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBokeh;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float rr = dot(uv, uv);
    if (rr > 1.0) discard;
    float z = sqrt(max(0.0, 1.0 - rr));
    vec3 normal = vec3(uv, z);
    float diffuse = max(0.0, dot(normal, vec3(-0.39, 0.46, 0.79)));
    float highlight = diffuse * diffuse;
    highlight *= highlight;
    highlight *= highlight;
    #ifndef SOFTWARE_RENDERER
    highlight *= highlight;
    #endif
    float rim = (1.0 - z) * (1.0 - z);
    // Bound the reflection: dense overlapping micro-grains keep their color.
    vec3 color = vColor * (0.24 + diffuse * 0.87 + rim * 0.30);
    color += vec3(0.61, 0.75, 0.84) * highlight * 0.48;
    float shape = 1.0 - smoothstep(0.68, 1.0, rr);
    if (vBokeh > 0.5) {
      shape = exp(-rr * 6.0) * 0.36 + (1.0 - smoothstep(0.06, 0.22, abs(rr - 0.52))) * 0.18;
      color = vColor;
    }
    gl_FragColor = vec4(color, shape * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const filamentVertex = /* glsl */ `
  ${currentField}
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = position.x;
    float lane = position.y;
    vec3 p = current(t, lane);
    float fan = sin(t * PI);
    p.x += sin(t * 32.0 + position.z + uTime * 0.4) * 0.11 * fan;
    p.z += cos(t * 32.0 + position.z) * 0.11 * fan;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vColor = currentColor(lane, t);
    float travel = fract(t * 3.0 - uTime * (0.13 + uEnergy * 0.16) + lane);
    float pulse = pow(max(0.0, 1.0 - abs(travel - 0.5) * 2.0), 7.0);
    vAlpha = fan * (0.012 + pulse * 0.10) * (1.0 - uDarkness * 0.65);
  }
`

const filamentFragment = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const shaftVertex = /* glsl */ `
  ${currentField}
  attribute vec4 aBeam;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = position.y;
    float angle = aBeam.x + sin(uTime * 0.07 + aBeam.w) * 0.12;
    vec3 radial = vec3(cos(angle), 0.0, sin(angle));
    vec3 tangent = vec3(-sin(angle), 0.0, cos(angle));
    float height = mix(5.8, 3.4, uWeights.y);
    vec3 origin = radial * (2.8 + uWeights.x * 1.8) + vec3(0.0, height, 0.0);
    vec3 destination = radial * 0.35 + vec3(0.0, -4.5, 0.0);
    vec3 p = mix(origin, destination, t);
    p += tangent * position.x * aBeam.y * (0.18 + t * 2.2);
    p += radial * aBeam.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vUv = position.xy;
    vColor = mix(currentColor(fract(aBeam.w), t), vec3(0.23, 0.68, 0.71), 0.24);
    vAlpha = (0.008 + uWeights.x * 0.006 + uWeights.y * 0.013) * (1.0 - uDarkness * 0.90);
    vAlpha *= 0.80 + sin(uTime * 0.23 + aBeam.w * 3.0) * 0.20;
  }
`

const shaftFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float crossSection = max(0.0, 1.0 - vUv.x * vUv.x);
    crossSection *= crossSection;
    float endFade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
    gl_FragColor = vec4(vColor, crossSection * endFade * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function seededRandom() {
  let seed = 146237
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/** Three bounded draws; no per-particle CPU updates, textures or render targets. */
export function createAtmosphere(scene: THREE.Scene, software: boolean, mobile: boolean) {
  const random = seededRandom()
  const count = software ? 4800 : mobile ? 16000 : 42000
  const bokehCount = software ? 12 : mobile ? 40 : 100
  const positions = new Float32Array(count * 3)
  const dust = new Float32Array(count * 4)
  for (let i = 0; i < count; i += 1) {
    const bokeh = i < bokehCount
    const size = bokeh ? 3.2 + random() * 7.0
      : (software ? 0.9 : 0.64) + Math.pow(random(), 3.4) * (mobile ? 3.1 : 3.7)
    positions.set([random(), random() * Math.PI * 2, Math.pow(random(), 1.6)], i * 3)
    dust.set([random(), size, random() * 2 - 1, bokeh ? 1 : 0], i * 4)
  }

  const uniforms = {
    uTime: { value: 0 },
    uWeights: { value: new THREE.Vector4() },
    uEnergy: { value: 0 },
    uDarkness: { value: 0 },
    uPixelRatio: { value: 1 },
  }
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  dustGeometry.setAttribute('aDust', new THREE.BufferAttribute(dust, 4))
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms,
    defines: software ? { SOFTWARE_RENDERER: 1 } : {},
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  const particles = new THREE.Points(dustGeometry, dustMaterial)
  particles.name = 'aether-current-particles'
  particles.frustumCulled = false

  const lanes = software ? 6 : mobile ? 16 : 28
  const segments = software ? 52 : mobile ? 112 : 160
  const linePositions = new Float32Array(lanes * segments * 6)
  for (let line = 0; line < lanes; line += 1) {
    const lane = (line + 0.5) / lanes
    const phase = random() * Math.PI * 2
    for (let segment = 0; segment < segments; segment += 1) {
      linePositions.set(
        [segment / segments, lane, phase, (segment + 1) / segments, lane, phase],
        (line * segments + segment) * 6,
      )
    }
  }
  const filamentGeometry = new THREE.BufferGeometry()
  filamentGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  const filamentMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: filamentVertex, fragmentShader: filamentFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const filaments = new THREE.LineSegments(filamentGeometry, filamentMaterial)
  filaments.name = 'aether-current-filaments'
  filaments.frustumCulled = false

  const beamCount = software ? 2 : mobile ? 5 : 8
  const beamPositions = new Float32Array(beamCount * 6 * 3)
  const beamAttributes = new Float32Array(beamCount * 6 * 4)
  const corners = [-1, 0, 0, 1, 0, 0, -1, 1, 0, -1, 1, 0, 1, 0, 0, 1, 1, 0]
  for (let beam = 0; beam < beamCount; beam += 1) {
    beamPositions.set(corners, beam * 18)
    const attributes = [beam / beamCount * Math.PI * 2, 0.6 + random() * 0.85, random() * 0.5, random()]
    for (let vertex = 0; vertex < 6; vertex += 1) {
      beamAttributes.set(attributes, (beam * 6 + vertex) * 4)
    }
  }
  const shaftGeometry = new THREE.BufferGeometry()
  shaftGeometry.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3))
  shaftGeometry.setAttribute('aBeam', new THREE.BufferAttribute(beamAttributes, 4))
  const shaftMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: shaftVertex, fragmentShader: shaftFragment,
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  shaftMaterial.forceSinglePass = true
  const shafts = new THREE.Mesh(shaftGeometry, shaftMaterial)
  shafts.name = 'aether-volume-shafts'
  shafts.frustumCulled = false
  scene.add(particles, filaments, shafts)

  let disposed = false
  return {
    update(time: number, progress: number, pixelRatio?: number) {
      if (disposed) return
      const journey = sampleJourney(progress)
      uniforms.uTime.value = Number.isFinite(time) ? time : 0
      uniforms.uWeights.value.set(journey.spine, journey.machine, journey.scales, journey.end)
      uniforms.uEnergy.value = journey.energy
      uniforms.uDarkness.value = journey.darkness
      const ratio = pixelRatio ?? window.devicePixelRatio ?? 1
      uniforms.uPixelRatio.value = THREE.MathUtils.clamp(Number.isFinite(ratio) ? ratio : 1, 0.4, 2)
    },
    dispose() {
      if (disposed) return
      disposed = true
      scene.remove(particles, filaments, shafts)
      dustGeometry.dispose()
      dustMaterial.dispose()
      filamentGeometry.dispose()
      filamentMaterial.dispose()
      shaftGeometry.dispose()
      shaftMaterial.dispose()
    },
  }
}
