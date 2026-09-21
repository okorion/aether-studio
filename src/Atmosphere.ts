import * as THREE from 'three'

/** Shared by the dust and its hairline currents so both occupy the same volume. */
const currents = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  const float PI = 3.14159265359;

  vec3 current(float t, float lane) {
    float side = lane < 0.5 ? -1.0 : 1.0;
    float branch = fract(lane * 2.0);
    float drift = uTime * 0.045;
    float wave = sin(t * 12.0 + branch * 4.0 + drift);
    // Each chapter has its own silhouette. Interpolation preserves a continuous
    // flow rather than fading between five unrelated particle systems.
    vec3 first = vec3(
      -0.35 + side * (0.24 + pow(1.0 - t, 1.7) * 2.35) + wave * 0.28,
      -5.6 + t * 9.2,
      -1.8 + sin(t * 7.0 + branch * 4.0 + drift) * 0.65
    );
    vec3 second = vec3(
      side * (0.65 + t * 5.9),
      side * ((t - 0.36) * 6.6 + sin(t * PI) * 1.7),
      -4.0 + cos(t * 8.0 + branch * 2.0 + drift) * 1.6
    );
    float theta = t * 17.0 + side * 0.9 + branch * 0.3;
    vec3 third = vec3(
      side * 0.7 + cos(theta) * (0.35 + t * 0.55),
      (t - 0.5) * 11.0,
      -3.5 + sin(theta) * 1.1
    );
    float orbit = t * PI * 2.0 + side * 0.34;
    float latitude = (branch - 0.5) * PI * 0.9;
    float orbitRadius = 1.45;
    vec3 fourth = vec3(
      cos(orbit) * cos(latitude) * orbitRadius,
      sin(latitude) * orbitRadius,
      -3.8 + sin(orbit) * cos(latitude) * orbitRadius
    );
    vec3 fifth = vec3(
      side * (1.4 + t * 3.2) + sin(t * 12.0 + branch) * 0.5,
      -5.5 + t * 11.0,
      -4.0 + sin(t * 7.0 + side) * 1.7
    );
    float chapter = clamp(uProgress, 0.0, 1.0) * 4.0;
    vec3 p = mix(first, second, smoothstep(0.0, 1.0, chapter));
    p = mix(p, third, smoothstep(1.0, 2.0, chapter));
    p = mix(p, fourth, smoothstep(2.0, 3.0, chapter));
    p = mix(p, fifth, smoothstep(3.0, 4.0, chapter));
    float spread = (branch - 0.5) * (0.35 + (1.0 - t) * 1.6);
    p.x += side * spread;
    p.y += sin(t * 17.0 + branch * 7.0 + drift) * spread * 0.2;
    p.z += cos(branch * PI * 2.0 + t * 5.0) * abs(spread);
    return p;
  }

  vec3 currentColor(float lane, float t) {
    vec3 teal = vec3(0.24, 0.72, 0.65);
    vec3 gold = vec3(0.86, 0.70, 0.30);
    float goldMix = smoothstep(0.14, 0.83, sin(lane * 31.0 + t * 3.0) * 0.5 + 0.5);
    vec3 color = mix(teal, gold, goldMix);
    vec3 purple = mix(vec3(0.33, 0.12, 0.76), vec3(0.85, 0.27, 0.58), goldMix);
    vec3 cyan = mix(vec3(0.11, 0.7, 0.67), vec3(0.3, 0.57, 0.78), goldMix);
    float chapter = uProgress * 4.0;
    color = mix(color, purple, smoothstep(1.0, 2.0, chapter));
    color = mix(color, cyan, smoothstep(2.0, 3.0, chapter));
    return mix(color, mix(gold, teal, 0.2), smoothstep(3.0, 4.0, chapter));
  }
`

const dustVertex = /* glsl */ `
  ${currents}
  attribute vec4 aDust;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vBokeh;
  varying float vAlpha;

  void main() {
    float t = position.x;
    float phase = position.y;
    float scatter = position.z;
    float lane = aDust.x;
    float bokeh = aDust.w;
    vec3 p = current(t, lane);

    // A twisting cross-section and very fine side branches give the dust the
    // character of a suspended, organic structure instead of a star field.
    float turn = phase + t * 28.0 + uTime * 0.065;
    float width = (0.16 + pow(1.0 - t, 1.8) * 1.15) * scatter;
    p += vec3(cos(turn) * width, sin(turn * 0.8) * width * 0.48, sin(turn) * width);
    float filament = sin(t * 91.0 + lane * 15.0 + phase);
    p.x += filament * width * 0.32;
    p.y += sin(t * 47.0 + phase) * width * 0.16;
    p.z += aDust.z * 0.6;

    if (bokeh > 0.5) {
      float side = lane < 0.5 ? -1.0 : 1.0;
      p = vec3(side * (2.3 + scatter * 3.0), (t - 0.5) * 9.5, 2.7 + aDust.z * 1.5);
      p.x += sin(uTime * 0.06 + phase) * 0.18;
      p.y += cos(uTime * 0.04 + phase) * 0.2;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float perspective = 11.0 / max(2.0, -mv.z);
    gl_PointSize = clamp(aDust.y * perspective * uPixelRatio, 0.55, 25.0 * uPixelRatio);
    vBokeh = bokeh;
    vColor = currentColor(lane, t);
    float shimmer = 0.82 + sin(uTime * 0.4 + phase) * 0.18;
    float depthFade = exp(-max(0.0, -mv.z - 10.0) * 0.032);
    float mechanicalChapter = smoothstep(0.55, 0.75, uProgress) * (1.0 - smoothstep(0.75, 0.95, uProgress));
    vAlpha = shimmer * depthFade * mix(0.65, 0.16, bokeh) * (1.0 - mechanicalChapter * 0.6);
    vAlpha *= smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.94, 1.0, t));
  }
`

const dustFragment = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vBokeh;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float radiusSquared = dot(uv, uv);
    if (radiusSquared > 1.0) discard;
    vec3 normal = vec3(uv, sqrt(max(0.0, 1.0 - radiusSquared)));
    float diffuse = max(0.0, dot(normal, normalize(vec3(-0.6, 0.75, 0.9))));
    #ifdef SOFTWARE_RENDERER
    float highlight = max(0.0, dot(normal, vec3(-0.39, 0.46, 0.79)));
    float specular = highlight * highlight;
    specular *= specular;
    specular *= specular;
    float reflection = 1.0 - smoothstep(0.02, 0.11, abs(normal.x * 0.75 + normal.y * 0.35 + normal.z * 0.3 - 0.24));
    float upperReflection = 1.0 - smoothstep(0.035, 0.13, abs(normal.y - 0.63));
    float fresnel = (1.0 - normal.z) * (1.0 - normal.z);
    #else
    float specular = pow(max(0.0, dot(normal, normalize(vec3(-0.5, 0.6, 1.0)))), 24.0);
    // Two studio-card reflections and a dark equatorial band make each point
    // read as a polished little sphere without geometry or environment maps.
    float reflection = exp(-pow(normal.x * 0.75 + normal.y * 0.35 + normal.z * 0.3 - 0.24, 2.0) * 190.0);
    float upperReflection = exp(-pow(normal.y - 0.63, 2.0) * 110.0);
    float fresnel = pow(1.0 - normal.z, 2.4);
    #endif
    vec3 sphere = vColor * (0.16 + diffuse * 0.65);
    sphere += vec3(0.86, 0.95, 1.0) * (specular * 2.0 + reflection * 0.9);
    sphere += vec3(1.0, 0.88, 0.68) * upperReflection * 0.85;
    sphere += vColor * fresnel * 0.7;
    float shape = 0.96;
    if (vBokeh > 0.5) {
      float glow = exp(-radiusSquared * 5.0) * 0.82 + exp(-radiusSquared * 1.8) * 0.12;
      float ring = exp(-pow(sqrt(radiusSquared) - 0.64, 2.0) * 78.0) * 0.5;
      shape = glow * 0.19 + ring;
    }
    float edge = 1.0 - smoothstep(0.76, 1.0, radiusSquared);
    gl_FragColor = vec4(mix(sphere, vColor, vBokeh), shape * edge * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const filamentVertex = /* glsl */ `
  ${currents}
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = position.x;
    float lane = position.y;
    vec3 p = current(t, lane);
    float fan = pow(max(0.0, sin(t * PI)), 1.5);
    p.x += sin(t * 28.0 + position.z) * 0.08 * fan;
    p.z += cos(t * 28.0 + position.z) * 0.07 * fan;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vColor = currentColor(lane, t);
    float pulse = 0.65 + sin(t * 19.0 - uTime * 0.15 + position.z) * 0.35;
    vAlpha = sin(t * PI) * pulse * 0.026;
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

function seededRandom() {
  let seed = 146237
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/**
 * Two draws, no textures or frame-time particle loops. Software WebGL uses
 * 3,000 points and a cheaper sphere shader; a small bounded set makes bokeh.
 * Pause/reduced-motion is controlled by the caller keeping time unchanged.
 */
export function createAtmosphere(scene: THREE.Scene, software: boolean, mobile: boolean) {
  const random = seededRandom()
  const count = software ? 3000 : mobile ? 8500 : 18000
  const bokehCount = software ? 16 : mobile ? 45 : 105
  const positions = new Float32Array(count * 3)
  const dust = new Float32Array(count * 4)

  for (let i = 0; i < count; i += 1) {
    const bokeh = i < bokehCount
    const lane = random()
    const size = bokeh
      ? (software ? 3 : 6) + random() * (software ? 4 : 7)
      : software
        ? 2.8 + Math.pow(random(), 1.6) * 11.8
        : 1.1 + Math.pow(random(), 2.7) * (mobile ? 10.5 : 13.0)
    // Keep most of the jewels in the lower plume. An even distribution over
    // the full curve left the emblem floating between two sparse line fans.
    const height =
      !bokeh && random() < 0.7 ? 0.08 + Math.pow(random(), 0.76) * 0.47 : 0.03 + random() * 0.96
    positions.set([height, random() * Math.PI * 2, Math.pow(random(), 1.35)], i * 3)
    dust.set([lane, size, random() * 2 - 1, bokeh ? 1 : 0], i * 4)
  }

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
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
    // Reflections retain their gold/teal surfaces even when many spheres overlap.
    blending: THREE.NormalBlending,
  })
  const particles = new THREE.Points(dustGeometry, dustMaterial)
  particles.name = 'aether-current-particles'
  particles.frustumCulled = false
  scene.add(particles)

  const lanes = software ? 8 : mobile ? 20 : 38
  const segments = software ? 60 : mobile ? 130 : 230
  const linePositions = new Float32Array(lanes * segments * 6)
  for (let line = 0; line < lanes; line += 1) {
    const lane = (line + 0.5) / lanes
    const phase = random() * Math.PI * 2
    for (let segment = 0; segment < segments; segment += 1) {
      const offset = (line * segments + segment) * 6
      linePositions.set(
        [segment / segments, lane, phase, (segment + 1) / segments, lane, phase],
        offset,
      )
    }
  }
  const filamentGeometry = new THREE.BufferGeometry()
  filamentGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  const filamentMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: filamentVertex,
    fragmentShader: filamentFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const filaments = new THREE.LineSegments(filamentGeometry, filamentMaterial)
  filaments.name = 'aether-current-filaments'
  filaments.frustumCulled = false
  scene.add(filaments)

  let disposed = false
  return {
    update(time: number, progress: number) {
      if (disposed) return
      uniforms.uTime.value = Number.isFinite(time) ? time : 0
      uniforms.uProgress.value = Number.isFinite(progress)
        ? THREE.MathUtils.clamp(progress, 0, 1)
        : 0
      uniforms.uPixelRatio.value = Math.min(
        window.devicePixelRatio || 1,
        software ? 0.75 : mobile ? 1.4 : 1.7,
      )
    },
    dispose() {
      if (disposed) return
      disposed = true
      scene.remove(particles, filaments)
      dustGeometry.dispose()
      dustMaterial.dispose()
      filamentGeometry.dispose()
      filamentMaterial.dispose()
    },
  }
}
