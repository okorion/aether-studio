import * as THREE from 'three'

type ForestPointer = { ndc: THREE.Vector2; strength: number; aspect: number }

const field = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uAspect;
  uniform float uPixelRatio;
  uniform vec2 uParallax;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform sampler2D uCanopyMap;
  float forestHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float forestNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(forestHash(i), forestHash(i + vec2(1., 0.)), f.x),
      mix(forestHash(i + vec2(0., 1.)), forestHash(i + vec2(1.)), f.x), f.y);
  }
  float forestWipe(vec2 p) {
    vec2 uv = p * .5 + .5;
    float edgeNoise = (forestNoise(p * 43.) - .5) * .008;
    float entry = smoothstep(.10, .20, uProgress);
    float exit = smoothstep(.855, .925, uProgress);
    float entryEdge = mix(-.35, 1.35, entry) + (uv.x - .5) * .20;
    float exitEdge = mix(-.35, 1.35, exit) + (uv.x - .5) * .20;
    float top = smoothstep(entryEdge - .012, entryEdge + .012, uv.y + edgeNoise);
    float bottom = 1. - smoothstep(exitEdge - .012, exitEdge + .012, uv.y + edgeNoise);
    return max(top, bottom);
  }
  float forestOpening(vec2 p) {
    // An uneven valley crosses the crowns; it is not a circular border of dust.
    float valley = abs(p.x * .78 - p.y * .29 + sin(p.y * 3.7) * .10);
    float valleyMask = .28 + .72 * smoothstep(.035, .17, valley);
    float central = length(p * vec2(uAspect, 1.));
    float ringClearance = .08 + .92 * smoothstep(.13, .34, central);
    return valleyMask * ringClearance;
  }
  float pointerLight(vec2 p) {
    vec2 delta = (p - uPointer) * vec2(uAspect, 1.);
    return exp(-dot(delta, delta) * 18.) * uPointerStrength;
  }
  float forestTravel(float depth) {
    float descent = uProgress < .5 ? smoothstep(0., .10, uProgress) * .26
      : smoothstep(.87, 1., uProgress) * .32;
    return descent * (1.2 - depth * .022);
  }
`

const crownVertex = /* glsl */ `
  ${field}
  attribute vec4 aLeaf;
  attribute float aCrownLight;
  uniform float uForeground;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  varying float vSoft;
  varying vec2 vScreen;
  void main() {
    float depth = position.z;
    vec2 p = position.xy;
    p += uParallax * (1. - depth / 21.);
    p.y += forestTravel(depth);
    p += vec2(sin(uTime * .13 + aLeaf.w * 21.), cos(uTime * .11 + aLeaf.w * 31.)) * .0024;
    float illumination = pointerLight(p);
    vec2 away = p - uPointer;
    p += away / max(.12, length(away)) * illumination * .022 * (1. - depth / 26.);
    // A view-space volume has genuine perspective/depth testing, while its
    // broad canopy distribution stays in frame through the authored orbit.
    vec3 view = vec3(p.x * depth / projectionMatrix[0][0],
      p.y * depth / projectionMatrix[1][1], -depth);
    gl_Position = projectionMatrix * vec4(view, 1.);
    float size = aLeaf.x * (10. / depth) * uPixelRatio;
    gl_PointSize = clamp(size, .8, mix(14., 44., uForeground) * uPixelRatio);
    float hue = aLeaf.z;
    vec3 olive = mix(vec3(.027, .037, .011), vec3(.18, .24, .048), hue);
    vec3 green = mix(vec3(.012, .051, .019), vec3(.15, .33, .085), hue);
    vec3 pigment = mix(olive, green, smoothstep(.25, .9, fract(hue * 2.73)));
    float crown = .24 + pow(aCrownLight, 1.65) * 1.04;
    float sparkle = pow(aLeaf.y, 12.) * aCrownLight;
    vColor = pigment * crown + vec3(.34, .37, .15) * sparkle * .44;
    vColor += vec3(.30, .52, .29) * illumination * (.38 + aCrownLight * .62);
    vColor = mix(vColor, vec3(.53, .69, .60), illumination * sparkle * .6);
    float distanceFog = exp(-max(0., depth - 8.) * .07);
    vColor = mix(vec3(.024, .043, .039), vColor, distanceFog);
    vAlpha = mix(.91, .22, uForeground) * forestOpening(p);
    vAlpha *= .83 + aLeaf.y * .17;
    vSeed = aLeaf.w;
    vSoft = uForeground;
    vScreen = p;
  }
`

const crownFragment = /* glsl */ `
  ${field}
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  varying float vSoft;
  varying vec2 vScreen;
  void main() {
    vec2 p = gl_PointCoord * 2. - 1.;
    float angle = vSeed * 6.283185;
    p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    p.x *= mix(1., 1.45, step(.55, vSeed) * (1. - vSoft));
    float rr = dot(p, p);
    if (rr >= 1.) discard;
    float z = sqrt(max(0., 1. - rr));
    float light = max(0., dot(vec3(p, z), normalize(vec3(-.42, .58, .72))));
    float glint = pow(light, 18.);
    float edge = 1. - smoothstep(.57, 1., rr);
    vec3 color = vColor * (.52 + light * .68);
    color += vec3(.32, .43, .23) * glint * .22;
    if (vSoft > .5) {
      edge = exp(-rr * 3.8) * .7 + exp(-abs(rr - .49) * 9.) * .14;
      color = vColor * .78;
    }
    float alpha = edge * vAlpha * forestWipe(vScreen);
    if (alpha < .002) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const veilVertex = /* glsl */ `
  varying vec2 vScreen;
  void main() {
    vScreen = position.xy;
    float depth = 17.;
    gl_Position = projectionMatrix * vec4(position.x * depth / projectionMatrix[0][0],
      position.y * depth / projectionMatrix[1][1], -depth, 1.);
  }
`

const veilFragment = /* glsl */ `
  ${field}
  varying vec2 vScreen;
  void main() {
    vec2 p = vScreen - uParallax * .48;
    p.y -= forestTravel(10.9);
    // The same authored crowns supply the dark mass beneath their micro-leaves.
    // Unrelated low-frequency noise would look like a blurred green wallpaper.
    vec3 canopy = texture2D(uCanopyMap, p / 2.8 + .5).rgb;
    float detail = forestNoise(p * 76.);
    float mounds = canopy.r;
    float opening = forestOpening(vScreen);
    float valley = 1. - smoothstep(.025, .25, abs(p.x * .78 - p.y * .29 + sin(p.y * 3.7) * .10));
    float cloud = forestNoise(p * 7. + vec2(uTime * .022, -uTime * .013));
    float mist = (valley * .8 + (1. - mounds) * .22) * pow(cloud, 1.5);
    float rim = canopy.g * (1. - smoothstep(.62, .98, mounds));
    vec3 color = mix(vec3(.004, .010, .008), vec3(.019, .031, .010), canopy.g);
    color *= .76 + detail * .24;
    color += vec3(.067, .098, .040) * rim * .6;
    color += vec3(.080, .16, .13) * mist;
    color += vec3(.055, .12, .065) * pointerLight(vScreen) * (.4 + mounds * .6);
    float alpha = (.22 + mounds * .70 + mist * .15) * (.45 + opening * .55) * forestWipe(vScreen);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function randomSource() {
  let state = 721659
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Screen-filling, depth-tested canopy; three draws and no CPU particle animation. */
export function createSceneForest(scene: THREE.Scene, software: boolean, mobile: boolean) {
  const group = new THREE.Group()
  group.name = 'aether-forest'
  scene.add(group)
  const random = randomSource()
  const budget = software ? 3500 : mobile ? 12000 : 35000
  const foregroundCount = software ? 60 : mobile ? 140 : 240
  const materials: THREE.ShaderMaterial[] = []
  const geometries: THREE.BufferGeometry[] = []
  // Compact crowns overlap within larger uneven stands. They do not distribute
  // individual leaves evenly over the screen or along a hollow spherical rim.
  const stands = Array.from({ length: 24 }, (_, i) => ({
    x: -1.16 + i % 6 * .47 + (random() - .5) * .25,
    y: -1.03 + Math.floor(i / 6) * .69 + (random() - .5) * .26,
    depth: random() < .4 ? 5.9 + random() * 2.8 : 9.2 + random() * 5.8,
    hue: random(),
  }))
  const crowns = Array.from({ length: 192 }, (_, i) => {
    const stand = stands[Math.floor(i / 8)]
    const angle = i % 8 * 2.399963 + stand.hue * 5
    const radius = .35 + random() * .65
    return {
      x: stand.x + Math.cos(angle) * .21 * radius,
      y: stand.y + Math.sin(angle) * .28 * radius,
      radiusX: .058 + random() * .047,
      radiusY: .081 + random() * .066,
      depth: stand.depth + (random() - .5) * 1.6,
      hue: stand.hue * .75 + random() * .25,
      size: 3.7 + random() * 1.4,
    }
  })
  const mapWidth = 256, mapHeight = 160
  const mapData = new Uint8Array(mapWidth * mapHeight * 4)
  for (let i = 3; i < mapData.length; i += 4) mapData[i] = 255
  for (const crown of crowns) {
    const x0 = Math.max(0, Math.floor((crown.x - crown.radiusX) / 2.8 * mapWidth + mapWidth / 2))
    const x1 = Math.min(mapWidth - 1, Math.ceil((crown.x + crown.radiusX) / 2.8 * mapWidth + mapWidth / 2))
    const y0 = Math.max(0, Math.floor((crown.y - crown.radiusY) / 2.8 * mapHeight + mapHeight / 2))
    const y1 = Math.min(mapHeight - 1, Math.ceil((crown.y + crown.radiusY) / 2.8 * mapHeight + mapHeight / 2))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = ((x + .5) / mapWidth * 2.8 - 1.4 - crown.x) / crown.radiusX
        const ny = ((y + .5) / mapHeight * 2.8 - 1.4 - crown.y) / crown.radiusY
        const radius = Math.sqrt(nx * nx + ny * ny)
        if (radius >= 1) continue
        const density = Math.min(1, (1 - radius) * 5)
        const light = Math.max(.05, -.32 * nx + .64 * ny + Math.sqrt(1 - radius * radius) * .42)
        const index = (y * mapWidth + x) * 4
        mapData[index] = Math.max(mapData[index], Math.round(density * 255))
        mapData[index + 1] = Math.max(mapData[index + 1], Math.round(light * density * 255))
      }
    }
  }
  const canopyMap = new THREE.DataTexture(mapData, mapWidth, mapHeight, THREE.RGBAFormat)
  canopyMap.minFilter = THREE.LinearFilter
  canopyMap.magFilter = THREE.LinearFilter
  canopyMap.generateMipmaps = false
  canopyMap.needsUpdate = true
  const shared = {
    uTime: { value: 0 }, uProgress: { value: 0 }, uAspect: { value: 1.6 },
    uPixelRatio: { value: 1 }, uParallax: { value: new THREE.Vector2() },
    uPointer: { value: new THREE.Vector2(3, 3) }, uPointerStrength: { value: 0 },
    uCanopyMap: { value: canopyMap },
  }
  const makeCrowns = (count: number, foreground: boolean) => {
    const positions = new Float32Array(count * 3)
    const leaves = new Float32Array(count * 4)
    const lights = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const crown = crowns[Math.floor(random() * crowns.length)]
      const azimuth = random() * Math.PI * 2
      const radius = Math.sqrt(random())
      const nx = Math.cos(azimuth) * radius
      const ny = Math.sin(azimuth) * radius
      const normalZ = Math.sqrt(1 - radius * radius)
      const smallLobe = 1 + Math.sin(azimuth * 3 + crown.hue * 9) * .085
      const x = crown.x + nx * crown.radiusX * smallLobe
      const y = crown.y + ny * crown.radiusY * smallLobe
      positions.set([x, y, foreground ? 2.6 + random() * 2.7 : crown.depth - normalZ * .85], i * 3)
      leaves.set([
        foreground ? 3.5 + random() * 6.5 : crown.size * (.76 + random() * .49),
        random(), (crown.hue * .75 + random() * .25), random(),
      ], i * 4)
      lights[i] = Math.max(.025, nx * -.36 + ny * .64 + normalZ * .63)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aLeaf', new THREE.BufferAttribute(leaves, 4))
    geometry.setAttribute('aCrownLight', new THREE.BufferAttribute(lights, 1))
    geometries.push(geometry)
    const material = new THREE.ShaderMaterial({
      uniforms: { ...shared, uForeground: { value: foreground ? 1 : 0 } },
      vertexShader: crownVertex, fragmentShader: crownFragment,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending,
    })
    materials.push(material)
    const points = new THREE.Points(geometry, material)
    points.name = foreground ? 'aether-forest-foreground' : 'aether-forest-canopies'
    points.frustumCulled = false
    points.renderOrder = foreground ? 5 : 4
    group.add(points)
  }
  const veilGeometry = new THREE.PlaneGeometry(2, 2)
  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: shared, vertexShader: veilVertex, fragmentShader: veilFragment,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.NormalBlending,
  })
  geometries.push(veilGeometry)
  materials.push(veilMaterial)
  const veil = new THREE.Mesh(veilGeometry, veilMaterial)
  veil.name = 'aether-forest-valleys'
  veil.frustumCulled = false
  veil.renderOrder = 1
  group.add(veil)
  makeCrowns(budget - foregroundCount, false)
  makeCrowns(foregroundCount, true)
  group.userData.particleBudget = budget
  let disposed = false

  return {
    update(time: number, progress: number, camera: THREE.Camera, pointer?: ForestPointer, pixelRatio?: number) {
      if (disposed) return
      const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0
      group.visible = p < .201 || p > .854
      if (!group.visible) return
      shared.uTime.value = Number.isFinite(time) ? time : 0
      shared.uProgress.value = p
      const projection = camera.projectionMatrix.elements
      const cameraAspect = Math.abs(projection[5] / projection[0])
      shared.uAspect.value = pointer && Number.isFinite(pointer.aspect) && pointer.aspect > 0
        ? pointer.aspect : Number.isFinite(cameraAspect) ? cameraAspect : 1.6
      const fallbackRatio = typeof window === 'undefined' ? 1 : Math.min(1.5, window.devicePixelRatio || 1)
      shared.uPixelRatio.value = pixelRatio !== undefined && Number.isFinite(pixelRatio)
        ? THREE.MathUtils.clamp(pixelRatio, .4, 2) : fallbackRatio
      shared.uParallax.value.set(camera.position.x * -.018,
        camera.position.z * .004 + camera.position.y * .0007)
      const hasPointer = pointer && Number.isFinite(pointer.ndc.x) && Number.isFinite(pointer.ndc.y)
        && Number.isFinite(pointer.strength)
      if (hasPointer) {
        shared.uPointer.value.copy(pointer.ndc)
        shared.uPointerStrength.value = THREE.MathUtils.clamp(pointer.strength, 0, 1)
      } else {
        shared.uPointerStrength.value = 0
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      canopyMap.dispose()
      group.clear()
    },
  }
}
