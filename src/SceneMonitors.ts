import * as THREE from 'three'
import { smooth, windowWeight } from './Journey'

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
  uniform float uHasBackground;
  uniform float uTime;
  uniform float uFilm;
  uniform float uOpacity;
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

    vec2 screenUv = vClip.xy / max(vClip.w, .0001) * .5 + .5;
    vec2 refractedUv = clamp(screenUv + ripple, vec2(.001), vec2(.999));
    vec3 image = film(panel, t);
    vec3 color = image * .68 + uTint * .025;
    if (uHasBackground > .5) {
      vec2 dispersion = normalize(ripple + vec2(.00001)) * (.0004 + detail * .0003);
      vec3 background;
      background.r = texture2D(uBackground, clamp(refractedUv + dispersion, vec2(.001), vec2(.999))).r;
      background.g = texture2D(uBackground, refractedUv).g;
      background.b = texture2D(uBackground, clamp(refractedUv - dispersion, vec2(.001), vec2(.999))).b;
      vec3 glassTint = mix(vec3(.68, .75, .79), uTint, .09);
      color = mix(background * glassTint, image * .86, .16 + liquid * .05);
    }
    float fresnel = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
    float rim = exp(-abs(distanceToEdge + .004) * 230.);
    float sheen = pow(max(0., 1. - abs(panel.x * .62 + panel.y - .34) * 2.), 7.);
    color += uTint * (rim * .16 + fresnel * .065 + sheen * .027);
    color += vec3(.1, .15, .17) * pow(detail, 5.) * .18;

    vec2 titleUv = vec2(gl_FrontFacing ? vUv.x : 1. - vUv.x, vUv.y);
    float title = texture2D(uTitle, titleUv).a;
    float titleWeight = title * (gl_FrontFacing ? .96 : .38);
    color = mix(color, vec3(.88, .94, .93), titleWeight);
    float alpha = mix(.66, .97, uHasBackground);
    alpha = max(alpha, titleWeight);
    gl_FragColor = vec4(color, alpha * uOpacity * mask);
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
    // A small Aether mark, independent of the reference studio's identity.
    context.beginPath()
    context.moveTo(495, 237 - (lines.length - 1) * 26)
    context.lineTo(512, 213 - (lines.length - 1) * 26)
    context.lineTo(529, 237 - (lines.length - 1) * 26)
    context.stroke()
    context.font = '300 66px Arial, sans-serif'
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

/** Six finite, vertically staggered glass screens; transforms depend on scroll only. */
export function createSceneMonitors(software: boolean, mobile: boolean) {
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
    positions.setZ(i, .17 * (1 - x * x) + .025 * (1 - y * y))
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  // Sampler uniforms always have a valid texture, including before first capture.
  const fallback = new THREE.DataTexture(new Uint8Array([2, 5, 7, 255]), 1, 1, THREE.RGBAFormat)
  fallback.colorSpace = THREE.LinearSRGBColorSpace
  fallback.needsUpdate = true
  const names = [['LIMINAL'], ['PULSE', 'ARCHIVE'], ['ORBITAL'], ['SOLSTICE'], ['COMMON', 'FUTURES'], ['AFTERLIGHT']]
  const tints = [0x80b9ca, 0xb697db, 0x769cd4, 0xd8ad71, 0xa4c6ae, 0x69baaa]
  const textures = names.map(titleTexture)
  const materials = textures.map((texture, i) => new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uBackground: { value: fallback }, uTitle: { value: texture },
      uHasBackground: { value: 0 }, uTime: { value: 0 },
      uFilm: { value: i }, uOpacity: { value: 0 },
      uTint: { value: new THREE.Color(tints[i]) },
    },
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.NormalBlending,
  }))
  const panels = materials.map((material, i) => {
    const panel = new THREE.Mesh(geometry, material)
    panel.name = `aether-monitor-${i}`
    panel.renderOrder = 3
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
  let lastProgress = Number.NaN
  group.userData.refraction = useCapture ? 'pending' : 'transparent-fallback'

  const clearBackground = () => {
    for (const material of materials) {
      material.uniforms.uBackground.value = fallback
      material.uniforms.uHasBackground.value = 0
    }
  }

  return {
    group,
    update(time: number, progress: number) {
      if (disposed) return
      const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0
      const weight = windowWeight(p, .265, .325, .60, .68)
      group.visible = weight > .001
      for (const material of materials) material.uniforms.uTime.value = Number.isFinite(time) ? time : 0
      if (p === lastProgress) return
      lastProgress = p
      const passage = (p - .303) / .064
      const mobileScale = mobile ? .74 : 1
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i]
        const step = i - passage
        const turn = step * 1.13
        const front = Math.cos(turn)
        const proximity = Math.max(0, front)
        // No modulo/recycling: every screen travels from the lower-right,
        // through the foreground, then above and behind the preceding screen.
        panel.position.set(Math.sin(turn) * (mobile ? 2.8 : 4.2) * mobileScale,
          -step * 1.8 * mobileScale, front * 2.65 - .05)
        panel.rotation.set(.015 + Math.sin(turn) * .025,
          -Math.sin(turn) * .86, -Math.sin(turn) * .035)
        panel.scale.setScalar(mobileScale * (.86 + proximity * .14))
        const localWeight = 1 - smooth(2.05, 3.05, Math.abs(step))
        panel.visible = localWeight > .001
        materials[i].uniforms.uOpacity.value = weight * localWeight
      }
    },
    capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
      if (disposed || !target || !group.visible || capturing || captureFailed) return
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
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      fallback.dispose()
      group.clear()
    },
  }
}
