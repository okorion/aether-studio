import * as THREE from 'three'
import { smooth, windowWeight } from './Journey'
import { sampleLayers } from './SceneLayers'
import { createSceneVideo } from './SceneVideo'
import { createCurtainVisibility, curtainHasCoverage } from './SceneVisibility'

type MonitorPointer = { ndc: THREE.Vector2; strength: number; aspect: number; active?: boolean }

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vClip;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 view = modelViewMatrix * vec4(position, 1.);
    vNormal = normalize(normalMatrix * normal);
    vView = -view.xyz;
    vClip = projectionMatrix * view;
    gl_Position = vClip;
  }
`

// Each film is an original procedural motion study, composited inside the glass.
// The background uses projected clip coordinates, so a smaller glow pass keeps
// exactly the same registration as a direct render at the canvas resolution.
const fragmentShader = /* glsl */ `
  uniform sampler2D uBackground;
  uniform sampler2D uTitle;
  uniform sampler2D uVideo;
  uniform float uVideoMix;
  uniform vec2 uPointerUv;
  uniform float uHover;
  uniform float uHasBackground;
  uniform float uTime;
  uniform float uFilm;
  uniform float uOpacity;
  uniform float uEntryEdge;
  uniform float uExitEdge;
  uniform vec3 uTint;
  varying vec2 vUv;
  varying vec4 vClip;
  varying vec3 vNormal;
  varying vec3 vView;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
      mix(hash(i + vec2(0., 1.)), hash(i + vec2(1.)), f.x), f.y);
  }
  mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
  vec3 film(vec2 p, float t) {
    vec3 color = vec3(.006, .018, .027);
    if (uFilm < .5) {
      // Slowly folding liquid metal.
      p = rotate(-.32) * p;
      float fold = sin(p.x * 9. + sin(p.y * 5. - t * .35) * 2. + t * .3);
      float ridge = pow(.5 + .5 * sin(p.y * 19. + fold * 3.4), 10.);
      color += mix(vec3(.05, .11, .22), vec3(.36, .51, .57), fold * .5 + .5) * .7;
      color += vec3(.65, .77, .69) * ridge * .8;
    } else if (uFilm < 1.5) {
      // A luminous current, formed from drifting nested noise.
      vec2 q = p * 3.2 + vec2(t * .06, -t * .09);
      float n = noise(q + noise(q * 2.1 + t * .08) * 2.2);
      float ribbons = pow(max(0., 1. - abs(n - .53) * 5.), 3.);
      color += mix(vec3(.03, .13, .39), vec3(.26, .53, .49), n) * ribbons;
      color += vec3(.32, .08, .35) * pow(n, 3.);
    } else if (uFilm < 2.5) {
      // An illuminated globe with a moving atmosphere.
      vec2 globe = p - vec2(sin(t * .12) * .07, 0.);
      float radius = length(globe);
      color += vec3(.13, .3, .62) * exp(-abs(radius - .32) * 34.) * .7;
      if (radius < .32) {
        vec3 n = vec3(globe / .32, sqrt(max(0., 1. - radius * radius / .1024)));
        float land = noise(n.xy * 6. + vec2(t * .09, 0.));
        vec3 surface = mix(vec3(.018, .075, .14), vec3(.14, .36, .32), smoothstep(.38, .64, land));
        surface += vec3(.31, .36, .4) * smoothstep(.59, .77, noise(n.xy * 10. + t * .045));
        color = surface * (.22 + max(0., dot(n, normalize(vec3(-.6, .4, 1.)))));
      }
    } else if (uFilm < 3.5) {
      // A warm eclipse over a moving fluid surface.
      vec2 sun = p - vec2(.18 + sin(t * .1) * .08, .07);
      float ring = exp(-abs(length(sun) - .24) * 25.);
      float ripples = .5 + .5 * sin(p.y * 24. + sin(p.x * 8. + t * .4) * 1.6 - t * .55);
      color += vec3(.68, .32, .12) * ring;
      color += vec3(.22, .11, .075) * ripples * (1. - smoothstep(-.2, .2, p.y));
    } else if (uFilm < 4.5) {
      // Architectural waves in a shared, imaginary landscape.
      p = rotate(.25) * p;
      float wave = sin(p.x * 9. + t * .26) * .08;
      float bands = pow(.5 + .5 * sin((p.y + wave) * 36. - t * .45), 12.);
      float light = exp(-length(p - vec2(sin(t * .17) * .3, .1)) * 1.9);
      color += mix(vec3(.19, .15, .32), vec3(.4, .52, .47), light) * (bands * .8 + .12);
    } else {
      // A slow aurora viewed through fine vertical threads.
      float curtain = p.y + sin(p.x * 5. + t * .2) * .19;
      float glow = exp(-abs(curtain) * 8.);
      float threads = .55 + .45 * noise(vec2(p.x * 95., t * .13));
      color += mix(vec3(.12, .17, .4), vec3(.23, .49, .35), p.x + .5) * glow * threads;
      color += vec3(.43, .17, .26) * exp(-abs(curtain - .15) * 13.) * .4;
    }
    return color;
  }
  void main() {
    vec2 panel = (vUv - .5) * vec2(1.6, 1.);
    vec2 corner = abs(panel) - vec2(.745, .445);
    float distanceToEdge = length(max(corner, 0.)) + min(max(corner.x, corner.y), 0.) - .055;
    float antialias = max(fwidth(distanceToEdge), .0004);
    float mask = 1. - smoothstep(-antialias, antialias, distanceToEdge);
    if (mask <= .001 || uOpacity <= .001) discard;

    float t = uTime;
    vec2 touch = (vUv - uPointerUv) * vec2(1.6, 1.);
    float touchRadius = length(touch);
    float hover = exp(-dot(touch, touch) * 15.) * uHover;
    float wave = sin(touchRadius * 30. - t * 2.1) * hover;
    vec2 drift = vec2(t * .028, -t * .035);
    float liquid = noise(panel * 5. + drift);
    float detail = noise(panel * 27. + vec2(liquid * 2., t * .025));
    vec2 ripple = vec2(
      sin(panel.y * 46. + liquid * 9. + t * .35),
      cos(panel.x * 41. + detail * 6. - t * .25));
    ripple *= .0008 + liquid * .0012;
    ripple += (vec2(liquid, detail) - .5) * .0042;
    ripple += panel * dot(panel, panel) * .003;
    // Fine ripples keep particles recognizable instead of melting their shapes.
    ripple += vec2(sin(panel.y * 115. + detail * 4. + t * .21),
      cos(panel.x * 103. + liquid * 5. - t * .19)) * .00035;
    ripple += touch * wave * .006;

    vec2 screenUv = vClip.xy / max(vClip.w, .0001) * .5 + .5;
    float boundary = screenUv.y - (screenUv.x - .5) * .20;
    float grain = (hash(floor(screenUv * vec2(1700., 1100.))) - .5) * .009;
    float passageMask = (1. - smoothstep(uEntryEdge - .006, uEntryEdge + .006, boundary + grain))
      * smoothstep(uExitEdge - .006, uExitEdge + .006, boundary + grain);
    if (passageMask < .001) discard;
    vec2 refractedUv = clamp(screenUv + ripple, vec2(.001), vec2(.999));
    vec3 image = film(panel, t);
    vec2 videoUv = vUv + ripple * (2.5 + hover * 2.);
    videoUv.x = gl_FrontFacing ? videoUv.x : 1. - videoUv.x;
    videoUv = clamp(videoUv, vec2(.002), vec2(.998));
    // Custom ShaderMaterial samplers do not get Three's map-video decode.
    vec3 videoSrgb = texture2D(uVideo, videoUv).rgb;
    vec3 videoLinear = mix(pow((videoSrgb + .055) / 1.055, vec3(2.4)), videoSrgb / 12.92,
      step(videoSrgb, vec3(.04045)));
    image = mix(image, videoLinear * (.72 + hover * .12), uVideoMix);
    image *= gl_FrontFacing ? 1. : .52;
    vec3 color = image * .88 + uTint * .014;
    if (uHasBackground > .5) {
      vec2 dispersion = normalize(ripple + vec2(.00001)) * (.0004 + detail * .0003);
      vec3 background;
      background.r = texture2D(uBackground, clamp(refractedUv + dispersion, vec2(.001), vec2(.999))).r;
      background.g = texture2D(uBackground, refractedUv).g;
      background.b = texture2D(uBackground, clamp(refractedUv - dispersion, vec2(.001), vec2(.999))).b;
      vec3 glassTint = mix(vec3(.68, .75, .79), uTint, .09);
      float filmCoverage = mix(.37, .72, uVideoMix) + hover * .055;
      color = mix(background * glassTint * .82, image, filmCoverage);
    }
    float fresnel = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
    float rim = exp(-abs(distanceToEdge + .004) * 230.);
    float sheen = pow(max(0., 1. - abs(panel.x * .62 + panel.y - .34) * 2.), 7.);
    float frost = exp(-abs(distanceToEdge + .012) * 105.);
    float micrograin = hash(floor(vUv * vec2(1900., 1200.))) - .5;
    color += uTint * (rim * .30 + fresnel * .11 + sheen * .043);
    color += vec3(.22, .29, .30) * frost * (.24 + detail * .2);
    color += vec3(.18, .26, .24) * hover * .16;
    color += micrograin * .006 + vec3(.1, .15, .17) * pow(detail, 5.) * .10;

    vec2 titleUv = vec2(gl_FrontFacing ? vUv.x : 1. - vUv.x, vUv.y);
    float titleShadow = texture2D(uTitle, titleUv + vec2(.0025, .004)).a;
    color *= 1. - titleShadow * .65;
    float title = texture2D(uTitle, titleUv).a;
    float titleWeight = title * (gl_FrontFacing ? .9 : .27) * (1. - hover * .26);
    color = mix(color, vec3(.88, .94, .93), titleWeight);
    float alpha = mix(.88, .98, uHasBackground);
    alpha = max(alpha, titleWeight);
    gl_FragColor = vec4(color, alpha * uOpacity * mask * passageMask);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function titleTexture(lines: string[]) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 640
  const context = canvas.getContext('2d')
  if (context) {
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#ffffff'
    context.lineWidth = 3
    context.strokeStyle = '#ffffff'
    // Original O identity, independent of the reference studio's branding.
    context.beginPath()
    context.ellipse(512, 223 - (lines.length - 1) * 26, 12, 16, 0, 0, Math.PI * 2)
    context.stroke()
    context.font = '400 66px "IBM Plex Mono", monospace'
    lines.forEach((line, index) => {
      context.fillText(line, 512, 324 + (index - (lines.length - 1) / 2) * 70, 780)
    })
    context.font = '14px monospace'
    context.globalAlpha = .68
    context.fillText('A E T H E R   /   M O T I O N   S T U D Y', 512, 405 + (lines.length - 1) * 25)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

function roundedPath(path: THREE.Path, w: number, h: number, r: number) {
  const x = -w / 2, y = -h / 2
  path.moveTo(x + r, y)
  path.lineTo(x + w - r, y)
  path.quadraticCurveTo(x + w, y, x + w, y + r)
  path.lineTo(x + w, y + h - r)
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  path.lineTo(x + r, y + h)
  path.quadraticCurveTo(x, y + h, x, y + h - r)
  path.lineTo(x, y + r)
  path.quadraticCurveTo(x, y, x + r, y)
}

const rimFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform float uOpacity;
  uniform float uEntryEdge;
  uniform float uExitEdge;
  uniform float uHover;
  varying vec4 vClip;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec2 screen = vClip.xy / max(vClip.w, .0001) * .5 + .5;
    float edge = screen.y - (screen.x - .5) * .20;
    float mask = (1. - smoothstep(uEntryEdge - .006, uEntryEdge + .006, edge))
      * smoothstep(uExitEdge - .006, uExitEdge + .006, edge);
    if (mask * uOpacity < .001) discard;
    vec3 n = normalize(vNormal);
    float fresnel = pow(1. - abs(dot(n, normalize(vView))), 2.);
    float reflection = pow(abs(dot(n, normalize(vec3(-.4, .7, 1.)))), 9.);
    vec3 color = uTint * (.045 + fresnel * .20 + reflection * .32 + uHover * .05);
    gl_FragColor = vec4(color, mask * uOpacity * .88);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Scroll arranges six finite glass screens; media and subtle hover remain independent. */
export function createSceneMonitors(software: boolean, mobile: boolean, externalMedia?: ReturnType<typeof createSceneVideo>) {
  const media = externalMedia ?? createSceneVideo()
  let mediaActive = false
  let reducedMotion = false
  const group = new THREE.Group()
  group.name = 'aether-monitors'
  group.visible = false
  const width = 6.1
  const height = 3.8
  const geometry = new THREE.PlaneGeometry(width, height, software || mobile ? 12 : 28, software || mobile ? 8 : 18)
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / (width / 2)
    const y = positions.getY(i) / (height / 2)
    positions.setZ(i, .035 * (1 - x * x) + .009 * (1 - y * y))
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  // Sampler uniforms always have a valid texture, including before first capture.
  const fallback = new THREE.DataTexture(new Uint8Array([2, 5, 7, 255]), 1, 1, THREE.RGBAFormat)
  fallback.colorSpace = THREE.LinearSRGBColorSpace
  fallback.needsUpdate = true
  const names = [['LIMINAL'], ['PULSE', 'ARCHIVE'], ['ORBITAL'], ['SOLSTICE'], ['LIMINAL'], ['PULSE', 'ARCHIVE']]
  const tints = [0x80b9ca, 0xb697db, 0x769cd4, 0xd8ad71, 0xa4c6ae, 0x69baaa]
  const textures = names.map(titleTexture)
  const materials = textures.map((texture, i) => new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uBackground: { value: fallback }, uTitle: { value: texture },
      uVideo: { value: fallback }, uVideoMix: { value: 0 },
      uPointerUv: { value: new THREE.Vector2(.5, .5) }, uHover: { value: 0 },
      uHasBackground: { value: 0 }, uTime: { value: 0 },
      uFilm: { value: i }, uOpacity: { value: 0 },
      uEntryEdge: { value: 1.5 }, uExitEdge: { value: -.5 },
      uTint: { value: new THREE.Color(tints[i]) },
    },
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.NormalBlending,
  }))
  const rimShape = new THREE.Shape()
  roundedPath(rimShape, width, height, .21)
  const rimHole = new THREE.Path()
  roundedPath(rimHole, width - .045, height - .045, .19)
  rimShape.holes.push(rimHole)
  const rimGeometry = new THREE.ExtrudeGeometry(rimShape, {
    depth: .048, bevelEnabled: true, bevelThickness: .006, bevelSize: .006,
    bevelSegments: 1, steps: 1, curveSegments: 6,
  })
  rimGeometry.translate(0, 0, -.028)
  geometry.computeBoundingBox()
  rimGeometry.computeBoundingBox()
  const captureBounds = geometry.boundingBox!.clone().union(rimGeometry.boundingBox!)
  const rimMaterials = materials.map((material) => new THREE.ShaderMaterial({
    vertexShader, fragmentShader: rimFragment, uniforms: material.uniforms,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  }))
  const panels = materials.map((material, i) => {
    const panel = new THREE.Mesh(geometry, material)
    panel.name = `aether-monitor-${i}`
    panel.renderOrder = 3
    const rim = new THREE.Mesh(rimGeometry, rimMaterials[i])
    rim.renderOrder = 3
    panel.add(rim)
    group.add(panel)
    return panel
  })
  const useCapture = !software && !mobile
  const target = useCapture ? new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace,
  }) : null
  if (target) target.texture.name = 'aether-shared-glass-background'
  const drawingSize = new THREE.Vector2()
  let disposed = false
  let capturing = false
  let captureFailed = false
  let captureVisible = false
  let captureDirty = true
  const captureVisibility = createCurtainVisibility()
  let lastTime = Number.NaN
  let hoveredPanel = -1
  const hover = new Float32Array(panels.length)
  const raycaster = new THREE.Raycaster()
  const pointerUv = new THREE.Vector2(.5, .5)
  let occluderRoots: THREE.Object3D[] = []
  let occluders: THREE.Mesh[] = []
  const occluderSphere = new THREE.Sphere()
  const occluderHits: THREE.Intersection[] = []
  const instanceBoundsVersion = new WeakMap<THREE.InstancedMesh, number>()
  group.userData.refraction = useCapture ? 'pending' : 'transparent-fallback'

  const clearBackground = () => {
    for (const material of materials) {
      material.uniforms.uBackground.value = fallback
      material.uniforms.uHasBackground.value = 0
    }
  }

  const blocksPanel = (material: THREE.Material) => material.visible && material.depthWrite
    && material.opacity >= .98
    && (material.blending === THREE.NormalBlending || material.blending === THREE.NoBlending)
    && (!(material instanceof THREE.MeshPhysicalMaterial) || material.transmission < .01)

  const occluded = (distance: number, camera: THREE.Camera) => {
    const previousFar = raycaster.far
    raycaster.far = Math.max(0, distance - .0001)
    try {
      for (const root of occluderRoots) root.updateWorldMatrix(true, true)
      for (const mesh of occluders) {
        let ancestor: THREE.Object3D | null = mesh
        let visible = true
        while (ancestor) {
          if (!ancestor.visible) { visible = false; break }
          ancestor = ancestor.parent
        }
        if (!visible || !mesh.layers.test(camera.layers)) continue
        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        if (!meshMaterials.some(blocksPanel)) continue
        if (mesh instanceof THREE.InstancedMesh) {
          // The spine changes its instance transforms on scroll. Three's cached
          // instance bound otherwise remains at its first raycast pose.
          if (mesh.boundingSphere === null || instanceBoundsVersion.get(mesh) !== mesh.instanceMatrix.version) {
            mesh.computeBoundingSphere()
            instanceBoundsVersion.set(mesh, mesh.instanceMatrix.version)
          }
          if (!mesh.boundingSphere) continue
          occluderSphere.copy(mesh.boundingSphere)
        } else {
          if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
          if (!mesh.geometry.boundingSphere) continue
          occluderSphere.copy(mesh.geometry.boundingSphere)
        }
        occluderSphere.applyMatrix4(mesh.matrixWorld)
        if (raycaster.ray.origin.distanceTo(occluderSphere.center) - occluderSphere.radius > raycaster.far
          || !raycaster.ray.intersectsSphere(occluderSphere)) continue
        occluderHits.length = 0
        raycaster.intersectObject(mesh, false, occluderHits)
        if (occluderHits.some(intersection => blocksPanel(meshMaterials[intersection.face?.materialIndex ?? 0]))) return true
      }
      return false
    } finally {
      occluderHits.length = 0
      raycaster.far = previousFar
    }
  }

  const hit = (ndc: THREE.Vector2, camera: THREE.Camera) => {
    if (disposed || !group.visible) return null
    const boundary = ndc.y * .5 + .5 - ndc.x * .1
    if (boundary > materials[0].uniforms.uEntryEdge.value || boundary < materials[0].uniforms.uExitEdge.value) return null
    group.updateWorldMatrix(true, true)
    raycaster.setFromCamera(ndc, camera)
    for (const intersection of raycaster.intersectObjects(panels, false)) {
      const index = panels.indexOf(intersection.object as typeof panels[number])
      if (index < 0 || !panels[index].visible || !intersection.uv || materials[index].uniforms.uOpacity.value < .2) continue
      // Ignore the transparent corners of the rectangular raycast geometry.
      const x = Math.abs((intersection.uv.x - .5) * 1.6) - .745
      const y = Math.abs(intersection.uv.y - .5) - .445
      if (Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) > .055) continue
      if (occluded(intersection.distance, camera)) return null
      return { index, uv: intersection.uv }
    }
    return null
  }

  return {
    group,
    setOccluders(roots: readonly THREE.Object3D[]) {
      if (disposed) return
      occluderRoots = [...new Set(roots)]
      const meshes = new Set<THREE.Mesh>()
      for (const root of occluderRoots) root.traverse(object => {
        // Points, lines and the unrelated scale wall never enter this list.
        if (object instanceof THREE.Mesh) meshes.add(object)
      })
      occluders = [...meshes]
    },
    setMediaActive(active: boolean, reduce: boolean) {
      mediaActive = active
      reducedMotion = reduce
      media.update(active && group.visible, reduce)
    },
    getVideoStatus: () => media.status(),
    getHoveredPanel: () => hoveredPanel,
    pick: (ndc: THREE.Vector2, camera: THREE.Camera) => hit(ndc, camera)?.index ?? null,
    update(time: number, progress: number, pointer?: MonitorPointer, camera?: THREE.Camera) {
      if (disposed) return
      const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0
      const weight = windowWeight(p, .23, .27, .675, .70)
      const layers = sampleLayers(p)
      for (const material of materials) {
        material.uniforms.uEntryEdge.value = layers.monitorEntry
        material.uniforms.uExitEdge.value = layers.monitorExit
      }
      group.position.y = -5 * (1 - smooth(.23, .305, p))
      group.visible = weight > .001 && curtainHasCoverage(layers.monitorEntry, layers.monitorExit)
      if (!group.visible) { captureVisible = false; captureDirty = true }
      media.update(mediaActive && group.visible, reducedMotion)
      const video = media.status()
      const delta = Number.isFinite(lastTime) ? THREE.MathUtils.clamp(time - lastTime, 0, .05) : 1 / 60
      lastTime = time
      const ease = 1 - Math.exp(-delta * 10)
      for (const material of materials) material.uniforms.uTime.value = Number.isFinite(time) ? time : 0
      const passage = (p - .303) / .064
      const mobileScale = mobile ? .74 : 1
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i]
        const step = i - passage
        const side = i % 2 === 0 ? 1 : -1
        hover[i] = THREE.MathUtils.lerp(hover[i], hoveredPanel === i && !reducedMotion ? 1 : 0, ease)
        if (hover[i] < .0001) hover[i] = 0
        // Each screen has an authored facing and front-of-chain depth. Scroll
        // translates the stack vertically; it never swings a screen through
        // the column. Hover moves toward the outside, preserving its facing.
        const x = (i === 0 ? .35 : side * 3.55) * mobileScale
        panel.position.set(x + side * hover[i] * .24 * mobileScale,
          -step * 2.85 * mobileScale, 3.3 + hover[i] * .12)
        panel.rotation.set(.012, i === 0 ? -.06 : -side * .24, -side * .015)
        panel.scale.setScalar(mobileScale * (i === 0 ? .90 : .84))
        const localWeight = 1 - smooth(2.05, 3.05, Math.abs(step))
        panel.visible = localWeight > .001
        materials[i].uniforms.uOpacity.value = weight * localWeight
        const uniforms = materials[i].uniforms
        const videoIndex = i % 2
        uniforms.uVideo.value = video.ready[videoIndex] ? media.textures[videoIndex] : fallback
        uniforms.uVideoMix.value = video.ready[videoIndex]
          ? (reducedMotion ? 1 : THREE.MathUtils.lerp(uniforms.uVideoMix.value, 1, ease)) : 0
        uniforms.uHover.value = hover[i]
        if (hoveredPanel === i) uniforms.uPointerUv.value.copy(pointerUv)
      }
      const targetHit = pointer?.active && camera && !reducedMotion ? hit(pointer.ndc, camera) : null
      hoveredPanel = targetHit?.index ?? -1
      if (targetHit) pointerUv.lerp(targetHit.uv, ease)
    },
    prepare(renderer: THREE.WebGLRenderer) {
      if (disposed || !target) return
      renderer.getDrawingBufferSize(drawingSize)
      const w = Math.max(1, Math.min(720, Math.floor(drawingSize.x)))
      const h = Math.max(1, Math.round(w * drawingSize.y / Math.max(1, drawingSize.x)))
      if (target.width !== w || target.height !== h) target.setSize(w, h)
      renderer.initRenderTarget(target)
      captureDirty = true
    },
    capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, scheduled = true, indirectVisible = false) {
      if (disposed || !target || capturing || captureFailed) return
      if (!group.visible) { captureVisible = false; captureDirty = true; return }
      // The group may be reflected indirectly even outside the main camera.
      // Restrict this camera's background capture, not the panel visibility.
      // A visible planar reflector may show panels outside the main frustum.
      // Keep their shared background live rather than freezing that reflection.
      let visible = indirectVisible
      if (!visible) {
        captureVisibility.begin(camera)
        for (const panel of panels) {
          if (panel.visible && panel.material.uniforms.uOpacity.value > .001
            && captureVisibility.intersects(panel, panel.material.uniforms.uEntryEdge.value,
              panel.material.uniforms.uExitEdge.value, captureBounds)) {
            visible = true
            break
          }
        }
      }
      if (!visible) { captureVisible = false; captureDirty = true; return }
      const entering = !captureVisible
      captureVisible = true
      if (!scheduled && !entering && !captureDirty) return
      renderer.getDrawingBufferSize(drawingSize)
      const w = Math.max(1, Math.min(720, Math.floor(drawingSize.x)))
      const h = Math.max(1, Math.round(w * drawingSize.y / Math.max(1, drawingSize.x)))
      if (target.width !== w || target.height !== h) target.setSize(w, h)
      const previousTarget = renderer.getRenderTarget()
      const previousCubeFace = renderer.getActiveCubeFace()
      const previousMipmapLevel = renderer.getActiveMipmapLevel()
      const previousAutoClear = renderer.autoClear
      const previousXr = renderer.xr.enabled
      const previousVisible = group.visible
      capturing = true
      group.visible = false
      try {
        renderer.xr.enabled = false
        renderer.autoClear = true
        // Render-target viewport/scissor are already physical pixels. Calling
        // setViewport here would multiply them by the canvas DPR a second time.
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        for (const material of materials) {
          material.uniforms.uBackground.value = target.texture
          material.uniforms.uHasBackground.value = 1
        }
        group.userData.refraction = 'shared-render-target'
        captureDirty = false
      } catch {
        // Keep readable, animated transparent screens if capture is unavailable.
        captureFailed = true
        clearBackground()
        group.userData.refraction = 'capture-failed-fallback'
      } finally {
        group.visible = previousVisible
        capturing = false
        renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel)
        renderer.autoClear = previousAutoClear
        renderer.xr.enabled = previousXr
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      clearBackground()
      target?.dispose()
      geometry.dispose()
      rimGeometry.dispose()
      rimMaterials.forEach((material) => material.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      fallback.dispose()
      if (!externalMedia) media.dispose()
      occluderRoots.length = 0
      occluders.length = 0
      occluderHits.length = 0
      group.clear()
    },
  }
}
