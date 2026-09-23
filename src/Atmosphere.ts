import * as THREE from 'three'
import { REACTOR } from './Reactor'
import { sampleJourney, smooth } from './Journey'
import { sampleLayers } from './SceneLayers'
import { curtainHasCoverage } from './SceneVisibility'
import { lightChoreographyGLSL, type LightFilmUniforms } from './SceneLighting'

// The intro's tiny ambient field remains visible before the incoming spine.
// All later particles and lights enter below the monitor's shared diagonal.
const entryFragment = /* glsl */ `
  uniform float uEntryEdge;
  uniform float uExitEdge;
  uniform float uEntryWipe;
  uniform float uDeviceEntryEdge;
  uniform float uDeviceEntryWipe;
  varying vec4 vFieldClip;
  float fieldEntry() {
    vec2 screen = vFieldClip.xy / vFieldClip.w * .5 + .5;
    float noise = fract(sin(dot(floor(screen * vec2(1800., 1100.)), vec2(12.9898, 78.233))) * 43758.5453);
    float boundary = screen.y - (screen.x - .5) * .20 + (noise - .5) * .009;
    float monitor = mix(1., 1. - smoothstep(uEntryEdge - .004, uEntryEdge + .004, boundary), uEntryWipe);
    // Convergence belongs to the incoming sealed chamber, not the outgoing
    // monitor wrapper. Hand over the field before its new shape is revealed.
    float chamber = mix(1., 1. - smoothstep(uDeviceEntryEdge - .004, uDeviceEntryEdge + .004, boundary), uDeviceEntryWipe);
    return monitor * chamber * smoothstep(uExitEdge - .004, uExitEdge + .004, boundary);
  }
`

/** The same current deforms continuously around the journey's central axis. */
const currentField = /* glsl */ `
  ${lightChoreographyGLSL}
  uniform float uTime;
  uniform float uScroll;
  uniform float uSpineYaw;
  uniform float uSpineSpread;
  uniform float uScrollStep;
  uniform vec4 uWeights;
  uniform float uEnergy;
  uniform float uDarkness;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform float uDevicePointerStrength;
  uniform float uReactorScale;
  uniform vec2 uAperture;
  uniform float uAspect;
  uniform float uFieldOpacity;
  varying vec4 vFieldClip;
  const float PI = 3.14159265359;
  // The base field follows scroll alone. Only the device's local pointer bend
  // is reversible at rest; time itself still changes luminance, not the flow.
  float motionTime() { return uScroll; }

  vec3 rotateSpineField(vec3 p) {
    float angle = uSpineYaw;
    float c = cos(angle), s = sin(angle);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  vec3 current(float t, float lane, float scrollPhase) {
    float side = lane < 0.5 ? -1.0 : 1.0;
    float branch = fract(lane * 2.0);
    float ripple = sin(t * 16.0 + branch * 8.0 + scrollPhase * 0.21);
    vec3 arrival = vec3(
      side * (0.16 + pow(1.0 - t, 1.35) * 2.55) + ripple * 0.24,
      -6.6 + t * 6.9,
      -1.4 + sin(t * 8.0 + branch * 6.0) * 1.15
    );
    // Both populations share one rotating envelope. Advection only chooses
    // the position along it; anchors keep that position as the field turns.
    // Three cupped rosettes on each side. Each grain stays round; the
    // five-lobed envelope and nested radii form the flower silhouette.
    float tier = min(2., floor(t * 3.));
    float petalAngle = fract(t * 3.) * PI * 2.;
    float petal = .64 + .36 * cos(petalAngle * 5.);
    float radius = (.16 + sqrt(branch) * 1.35) * petal;
    float facing = side * .28 + (tier - 1.) * .32;
    vec3 centre = vec3(side * 3.05, (tier - 1.) * 4.0, -.35);
    vec3 spine = centre + vec3(
      cos(petalAngle) * radius,
      sin(petalAngle) * radius,
      .60 * branch * branch + .12 * sin(petalAngle * 5.)
    );
    spine.z += sin(facing) * (spine.x - centre.x);
    spine.xz *= uSpineSpread;
    spine.y += -12.0 * (1.0 - smoothstep(.205, .29, uScroll / 55.0));
    spine = rotateSpineField(spine);
    float progress = uScroll / 55.;
    float formed = smoothstep(.680, .715, progress);
    float orbit = t * PI * 2.0 + scrollPhase * 0.35 * formed;
    float cross = branch * PI * 2.0;
    vec3 reactor = vec3(cos(orbit) * (1.47 + cos(cross) * .12),
      sin(orbit) * (1.68 + cos(cross) * .12), sin(cross) * .17);
    // The disk is horizontal in the actual cap's bore. XY scaling happens
    // after scatter, so undo it here for the aperture's world-space anchor.
    float diskRadius = uAperture.y * .78 * sqrt(branch);
    vec3 gathered = vec3(cos(t * PI * 2.) * diskRadius / uReactorScale,
      (uAperture.x + sin(cross) * .035) / uReactorScale,
      sin(t * PI * 2.) * diskRadius);
    float fall = smoothstep(.665 + branch * .006, .710 + branch * .005, progress);
    vec3 descending = gathered;
    descending.y *= 1. - fall;
    reactor = mix(descending, reactor, formed);
    float sheetAngle = t * PI * 2.0 + scrollPhase * 0.12;
    vec3 scales = vec3(
      cos(sheetAngle) * (2.6 + branch * 1.45),
      sin(sheetAngle) * (1.7 + branch * 1.1),
      -0.8 + sin(sheetAngle * 2.0 + branch * 5.0) * 1.8
    );
    vec3 ending = arrival;
    ending.y = -arrival.y + 0.35;
    // Unequal tributary lengths and depth break up the flat slab that a mirrored
    // planar plume presents while the camera turns into the lower chamber.
    ending.y *= 0.72 + branch * 0.67;
    ending.x = ending.x * 0.9 + sin(lane * 29.0 + t * 5.0) * 0.34;
    ending.z += sin(lane * 32.0 + t * 10.0) * 1.25;
    vec3 p = mix(arrival, spine, uWeights.x);
    p = mix(p, reactor, uWeights.y);
    p = mix(p, scales, uWeights.z);
    return mix(p, ending, uWeights.w);
  }

  vec3 currentColor(float lane, float t) {
    float variation = sin(lane * 39.0 + t * 5.0) * 0.5 + 0.5;
    vec3 gold = mix(vec3(0.28, 0.36, 0.08), vec3(0.95, 0.51, 0.10), variation);
    vec3 violet = mix(vec3(0.22, 0.32, 0.91), vec3(0.96, 0.23, 0.59), variation);
    violet = mix(violet, vec3(0.97, 0.61, 0.37), pow(variation, 7.0) * 0.65);
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
  attribute float aAdvected;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBokeh;
  varying float vMachine;
  void main() {
    float lane = aDust.x;
    float phase = position.y;
    // Phase advection travels the full current. Faded ends hide loop wrapping.
    float speed = 0.028 + uWeights.x * 0.004 + uWeights.y * 0.055 + uWeights.z * 0.038;
    float phaseScroll = aAdvected * mix(motionTime(), max(0., uScroll - .715 * 55.), uWeights.y);
    float t = fract(position.x + phaseScroll * speed * (0.76 + lane * 0.48));
    vec3 p = current(t, lane, phaseScroll);
    float cluster = 0.32 + 0.68 * pow(sin(t * 35.0 + lane * 8.0) * 0.5 + 0.5, 2.0);
    float width = (0.13 + position.z * (0.72 + uWeights.x * .73)) * cluster;
    width *= 1.0 - uWeights.y * 0.90;
    width *= 1.0 - uWeights.x * (1.0 - uWeights.y) * .82;
    float spineWeight = uWeights.x * (1.0 - uWeights.y) * (1.0 - uWeights.z) * (1.0 - uWeights.w);
    float turn = phase + t * 37.0 + phaseScroll * 0.6 * (1.0 - spineWeight);
    vec3 scatter = vec3(cos(turn), sin(turn * 0.83) * 0.62, sin(turn)) * width;
    scatter.z += aDust.z * (0.18 + (1.0 - uWeights.y) * 0.38);
    scatter *= mix(1., mix(.4, 1., smoothstep(.680, .715, uScroll / 55.)), uWeights.y);
    p += mix(scatter, rotateSpineField(scatter), spineWeight);
    // Most device grains spread across a fine radial cloud, with a few smaller
    // strays. This is still the same field, without a second opaque ring.
    float stray = step(.94, position.z);
    float radialScatter = aAdvected * aDust.z * .16 + stray * (.20 + lane * .28);
    vec2 radial = normalize(p.xy / vec2(1.47, 1.68) + vec2(.0001));
    float formed = smoothstep(.680, .715, uScroll / 55.);
    p.xy += radial * radialScatter * uWeights.y * formed;
    p.z += sin(phase * 3.7) * stray * .28 * uWeights.y * formed;
    float bokeh = aDust.w;
    if (bokeh > 0.5) {
      vec3 anchored = vec3((lane - 0.5) * 14.0, (position.x - 0.5) * 13.0 + uWeights.w * 3.0, -2.0 + aDust.z * 6.0);
      anchored = mix(anchored, rotateSpineField(anchored), uWeights.x);
      p = mix(anchored, p, uWeights.y);
    }
    // Scale the complete ring, including its diffuse rim, about its own centre.
    p.xy *= mix(1.0, uReactorScale, uWeights.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vec2 pointerDelta = gl_Position.xy / max(.01, gl_Position.w) - uPointer;
    pointerDelta.x *= uAspect;
    float touch = exp(-dot(pointerDelta, pointerDelta) * 7.0) * uPointerStrength;
    // A transient extra displacement follows THIS scroll increment only.
    // No velocity integration or time decay can move geometry after settling.
    if (abs(uScrollStep) > .000001 && aAdvected > .5 && touch > .0001) {
      vec3 flowTangent = current(min(.9999, t + .002), lane, phaseScroll)
        - current(max(.0001, t - .002), lane, phaseScroll);
      vec3 localPush = flowTangent / max(length(flowTangent), .001)
        * uScrollStep * touch * .9;
      mv.xyz += (modelViewMatrix * vec4(localPush, 0.0)).xyz;
    }
    // The machine must react even with zero scroll delta, including anchored
    // grains. Work in view space so the cursor reaches the visible arc at any
    // depth/aspect. A broad Gaussian has no circular cutoff, and a soft core
    // avoids pushing every nearby grain onto the same hollow circumference.
    if (uDevicePointerStrength > .0001 && gl_Position.w > 0.0) {
      float distanceSquared = dot(pointerDelta, pointerDelta);
      // Seeds stay attached to each grain; depth changes only with the base
      // scroll shape. No clock or integrated velocity can leave residual drift.
      float grainSeed = fract(phase * .618 + lane * 7.13 + position.x * 3.73);
      float depthLayer = clamp(.5 + p.z * .65, 0., 1.);
      vec2 fieldDelta = pointerDelta * vec2(mix(.90, 1.10, grainSeed), mix(1.08, .92, depthLayer));
      float spread = mix(4.0, 6.6, grainSeed) * mix(.82, 1.08, depthLayer);
      float influence = exp(-dot(fieldDelta, fieldDelta) * spread) * uDevicePointerStrength;
      vec2 away = pointerDelta * inversesqrt(distanceSquared + .16);
      vec2 tangent = vec2(-away.y, away.x);
      vec2 drift = vec2(aDust.z, lane * 2. - 1.) * .016;
      vec2 bend = (away * .082 + tangent * mix(-.028, .028, grainSeed) + drift)
        * influence * mix(.70, 1., depthLayer);
      bend.x /= uAspect;
      mv.xy += bend * max(.01, gl_Position.w)
        / vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
      mv.z += influence * (.035 + aDust.z * .045);
    }
    gl_Position = projectionMatrix * mv;
    vFieldClip = gl_Position;
    float perspective = 12.0 / max(2.0, -mv.z);
    // Larger pearlescent grains fill the spine's turbulent clouds, while the
    // ring and the lower chamber retain their original fine dust density.
    float grainScale = 1.0 + uWeights.x * (0.30 + 0.28 * cluster);
    grainScale *= mix(1., .70 * mix(1., .62, stray), uWeights.y);
    gl_PointSize = clamp(aDust.y * grainScale * perspective * uPixelRatio, 0.65, 12.0 * uPixelRatio);
    float pearl = .5 + .5 * sin(phase * 2.3 + lane * 11.);
    vec3 deviceColor = mix(vec3(.22, .58, .63), vec3(.54, .28, .72), pearl);
    deviceColor = mix(deviceColor, vec3(.72, .78, .74), pow(pearl, 7.) * .45);
    vColor = mix(currentColor(lane, t), deviceColor, uWeights.y);
    vec3 litWorld = (modelMatrix * vec4(p, 1.)).xyz;
    vColor += aetherLightCloud(litWorld, vec3(0., .5, .866), uTime, uDarkness)
      * (.20 + uWeights.y * .75);
    vColor += mix(vec3(.28, .72, .29), vec3(.58, .53, .85), uWeights.x)
      * touch * 1.8 * mix(1., .45, uWeights.y);
    vBokeh = bokeh;
    vMachine = uWeights.y;
    float shimmer = 0.73 + sin(uTime * 1.7 + phase * 7.0) * 0.2;
    float seam = smoothstep(0.0, 0.045, t) * (1.0 - smoothstep(0.94, 1.0, t));
    float petalPhase = fract(t * 3.);
    seam *= mix(1., smoothstep(0., .06, petalPhase) * (1. - smoothstep(.94, 1., petalPhase)), spineWeight);
    float distanceFade = exp(-max(0.0, -mv.z - 13.0) * 0.043);
    vAlpha = shimmer * mix(seam, 1.0, uWeights.y) * distanceFade * mix(0.72, 0.19, bokeh);
    vAlpha *= mix(1.0, .30 * mix(1., .22, bokeh), uWeights.y);
    vAlpha *= (1.0 - uDarkness * 0.23) * (1.0 + uWeights.x * 0.16);
    vAlpha *= uFieldOpacity;
  }
`

const dustFragment = /* glsl */ `
  precision highp float;
  ${entryFragment}
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBokeh;
  varying float vMachine;
  void main() {
    float entry = fieldEntry();
    if (entry < .003) discard;
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
    color += vec3(0.61, 0.75, 0.84) * highlight * mix(.48, .24, vMachine);
    float shape = 1.0 - smoothstep(0.68, 1.0, rr);
    if (vBokeh > 0.5) {
      shape = exp(-rr * 6.0) * 0.36 + (1.0 - smoothstep(0.06, 0.22, abs(rr - 0.52))) * 0.18;
      color = vColor;
    }
    gl_FragColor = vec4(color, shape * vAlpha * entry);
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
    vec3 p = current(t, lane, uScroll);
    float fan = sin(t * PI);
    p.x += sin(t * 32.0 + position.z + motionTime() * 0.4) * 0.11 * fan;
    p.z += cos(t * 32.0 + position.z) * 0.11 * fan;
    p.xy *= mix(1.0, uReactorScale, uWeights.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vFieldClip = gl_Position;
    vColor = currentColor(lane, t);
    float travel = fract(t * 3.0 - motionTime() * (0.13 + uEnergy * 0.16) + lane);
    float pulse = pow(max(0.0, 1.0 - abs(travel - 0.5) * 2.0), 7.0);
    vAlpha = fan * (0.012 + pulse * 0.10) * (1.0 - uDarkness * 0.65) * uFieldOpacity;
  }
`

const filamentFragment = /* glsl */ `
  precision highp float;
  ${entryFragment}
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float entry = fieldEntry();
    if (entry < .003) discard;
    gl_FragColor = vec4(vColor, vAlpha * entry);
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
    float angle = aBeam.x + sin(uScroll * 0.07 + aBeam.w) * 0.12;
    vec3 radial = vec3(cos(angle), 0.0, sin(angle));
    vec3 tangent = vec3(-sin(angle), 0.0, cos(angle));
    float height = mix(5.8, 3.4, uWeights.y);
    vec3 origin = radial * (2.8 + uWeights.x * 1.8) + vec3(0.0, height, 0.0);
    vec3 destination = radial * 0.35 + vec3(0.0, -4.5, 0.0);
    vec3 p = mix(origin, destination, t);
    p += tangent * position.x * aBeam.y * (0.18 + t * 2.2);
    p += radial * aBeam.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vFieldClip = gl_Position;
    vUv = position.xy;
    vColor = mix(currentColor(fract(aBeam.w), t), vec3(0.23, 0.68, 0.71), 0.24);
    vAlpha = (0.008 + uWeights.x * 0.006 + uWeights.y * 0.013) * (1.0 - uDarkness * 0.90);
    vAlpha *= 0.80 + sin(uTime * 0.23 + aBeam.w * 3.0) * 0.20;
    vAlpha *= uFieldOpacity * (1.0 - uWeights.y * .80);
  }
`

const shaftFragment = /* glsl */ `
  precision highp float;
  ${entryFragment}
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float entry = fieldEntry();
    if (entry < .003) discard;
    float crossSection = max(0.0, 1.0 - vUv.x * vUv.x);
    crossSection *= crossSection;
    float endFade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
    gl_FragColor = vec4(vColor, crossSection * endFade * vAlpha * entry);
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
export function createAtmosphere(scene: THREE.Scene, software: boolean, mobile: boolean, lightFilm?: LightFilmUniforms) {
  const random = seededRandom()
  const count = software ? 4800 : mobile ? 16000 : 42000
  const bokehCount = software ? 12 : mobile ? 40 : 100
  const positions = new Float32Array(count * 3)
  const dust = new Float32Array(count * 4)
  const advected = new Float32Array(count)
  let advectedCount = 0
  for (let i = 0; i < count; i += 1) {
    const bokeh = i < bokehCount
    const size = bokeh ? 3.2 + random() * 7.0
      : (software ? 0.9 : 0.64) + Math.pow(random(), 3.4) * (mobile ? 3.1 : 3.7)
    positions.set([random(), random() * Math.PI * 2, Math.pow(random(), 1.6)], i * 3)
    dust.set([random(), size, random() * 2 - 1, bokeh ? 1 : 0], i * 4)
    // Dense anchored clouds provide the silhouette; one fifth follows scroll.
    advected[i] = !bokeh && i % 10 >= 8 ? 1 : 0
    advectedCount += advected[i]
  }

  const uniforms = {
    ...(lightFilm ? { uLightFilm: lightFilm.map, uLightFilmReady: lightFilm.ready } : {}),
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uSpineYaw: { value: 0 },
    uSpineSpread: { value: mobile ? .62 : 1 },
    uScrollStep: { value: 0 },
    uWeights: { value: new THREE.Vector4() },
    uEnergy: { value: 0 },
    uDarkness: { value: 0 },
    uPixelRatio: { value: 1 },
    uPointer: { value: new THREE.Vector2() },
    uPointerStrength: { value: 0 },
    uDevicePointerStrength: { value: 0 },
    uReactorScale: { value: REACTOR.ringScale },
    uAperture: { value: new THREE.Vector2(REACTOR.apertureY, REACTOR.apertureRadius) },
    uAspect: { value: 1 },
    uFieldOpacity: { value: 1 },
    uEntryEdge: { value: -0.25 },
    uExitEdge: { value: -.5 },
    uEntryWipe: { value: 0 },
    uDeviceEntryEdge: { value: -.25 },
    uDeviceEntryWipe: { value: 0 },
  }

  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  dustGeometry.setAttribute('aDust', new THREE.BufferAttribute(dust, 4))
  dustGeometry.setAttribute('aAdvected', new THREE.BufferAttribute(advected, 1))
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms,
    defines: { ...(software ? { SOFTWARE_RENDERER: 1 } : {}), ...(lightFilm ? { AETHER_LIGHT_FILM: 1 } : {}) },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  const particles = new THREE.Points(dustGeometry, dustMaterial)
  particles.name = 'aether-current-particles'
  particles.frustumCulled = false
  particles.userData.motion = 'scroll-only base; local device pointer bend recovers with input decay'
  particles.userData.fixedCount = count - advectedCount
  particles.userData.advectedCount = advectedCount

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
  // Share the immutable particle buffer during the two-region overlap.
  // The outgoing bone current holds its pose above the incoming core.
  const outgoingUniforms = { ...uniforms,
    uWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
    uFieldOpacity: { value: 1 }, uExitEdge: { value: -.5 },
    uDeviceEntryWipe: { value: 0 }, uDevicePointerStrength: { value: 0 },
  }
  const outgoingMaterial = dustMaterial.clone()
  outgoingMaterial.uniforms = outgoingUniforms
  const outgoing = new THREE.Points(dustGeometry, outgoingMaterial)
  outgoing.name = 'aether-outgoing-bone-current'
  outgoing.frustumCulled = false
  outgoing.visible = false
  scene.add(particles, filaments, shafts, outgoing)

  let disposed = false
  let previousProgress = Number.NaN
  return {
    update(time: number, progress: number, pixelRatio?: number,
      pointer?: { ndc: THREE.Vector2; strength: number; aspect: number; active?: boolean }, _camera?: THREE.Camera) {
      if (disposed) return
      void _camera // Compatibility: visibility now follows the wrapper, not eye height.
      const journey = sampleJourney(progress)
      const p = journey.progress
      const layers = sampleLayers(p)
      // The incoming curtain hides the handoff at .60; the outgoing draw
      // retains the flowers independently above that edge.
      const morph = p >= .60 ? 1 : 0
      const signedStep = Number.isFinite(previousProgress)
        ? THREE.MathUtils.clamp((p - previousProgress) * 55, -.5, .5) : 0
      previousProgress = p
      uniforms.uTime.value = Number.isFinite(time) ? time : 0
      uniforms.uScroll.value = p * 55
      uniforms.uSpineYaw.value = journey.structureYaw
      uniforms.uScrollStep.value = signedStep
      // The incoming field uses the device anchor throughout its visible descent.
      const fieldY = THREE.MathUtils.lerp(journey.height, REACTOR.worldY, morph)
      particles.position.y = filaments.position.y = shafts.position.y = fieldY
      uniforms.uWeights.value.set(smooth(.205, .29, p), morph, 0, 0)
      uniforms.uEnergy.value = journey.energy
      uniforms.uDarkness.value = journey.darkness
      uniforms.uFieldOpacity.value = .06 * (1 - smooth(.10, .18, p))
        + smooth(.245, .31, p) * (1 - smooth(.75, .81, p))
      uniforms.uEntryEdge.value = layers.monitorEntry
      uniforms.uExitEdge.value = layers.deviceExit
      outgoingUniforms.uExitEdge.value = layers.monitorExit
      outgoing.position.y = journey.height
      outgoing.visible = p >= .60 && curtainHasCoverage(layers.monitorEntry, layers.monitorExit)
      uniforms.uEntryWipe.value = p >= .20 ? 1 : 0
      uniforms.uDeviceEntryEdge.value = layers.monitorExit
      uniforms.uDeviceEntryWipe.value = p >= .60 ? 1 : 0
      const validPointer = pointer && pointer.active !== false
        && Number.isFinite(pointer.ndc.x) && Number.isFinite(pointer.ndc.y)
      if (validPointer) uniforms.uPointer.value.copy(pointer.ndc)
      else uniforms.uPointer.value.set(0, 0)
      uniforms.uPointerStrength.value = validPointer && Number.isFinite(pointer.strength)
        ? THREE.MathUtils.clamp(pointer.strength, 0, 1) : 0
      // Input strength already eases after mouse motion. Threshold its tail so
      // a stopped pointer restores the exact scroll shape, without an extra
      // spring/integration loop or deformation leaking into the spine.
      uniforms.uDevicePointerStrength.value = smooth(.64, .70, p)
        * smooth(.035, .82, uniforms.uPointerStrength.value)
      uniforms.uAspect.value = pointer && Number.isFinite(pointer.aspect)
        ? THREE.MathUtils.clamp(pointer.aspect, .25, 5) : 1
      const ratio = pixelRatio ?? window.devicePixelRatio ?? 1
      uniforms.uPixelRatio.value = THREE.MathUtils.clamp(Number.isFinite(ratio) ? ratio : 1, 0.4, 2)
      const visible = uniforms.uFieldOpacity.value > .001
        && (p < .60 || curtainHasCoverage(layers.monitorExit, layers.deviceExit))
      particles.visible = filaments.visible = shafts.visible = visible
      particles.userData.scrollStep = signedStep
      particles.userData.morph = morph
      particles.userData.fieldY = fieldY
      particles.userData.devicePointerStrength = uniforms.uDevicePointerStrength.value
    },
    dispose() {
      if (disposed) return
      disposed = true
      scene.remove(particles, filaments, shafts, outgoing)
      outgoingMaterial.dispose()
      dustGeometry.dispose()
      dustMaterial.dispose()
      filamentGeometry.dispose()
      filamentMaterial.dispose()
      shaftGeometry.dispose()
      shaftMaterial.dispose()
    },
  }
}
