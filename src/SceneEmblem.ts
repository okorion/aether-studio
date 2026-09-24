import * as THREE from 'three'
import { sampleJourney, smooth } from './Journey'
import { bindGroupCurtain, createCurtainBounds } from './SceneCurtains'
import { sampleEmblemCurtain } from './SceneLayers'
import { createCurtainVisibility } from './SceneVisibility'
import { lightChoreographyGLSL, type LightFilmUniforms } from './SceneLighting'

export type EmblemVariant = 'glass' | 'silver'

export type SceneEmblemOptions = {
  software: boolean
  mobile: boolean
  /** Change this one option to restore the original silver ring and ribbons. */
  variant?: EmblemVariant
  /** Borrowed templates. Every emblem surface gets its own immediate clone. */
  silver: { chrome: THREE.MeshPhysicalMaterial; darkChrome: THREE.MeshPhysicalMaterial }
  /** The media owner retains both the texture and the shared uniform objects. */
  film: LightFilmUniforms
}

type CaptureState = 'disabled' | 'pending' | 'ready' | 'failed'

/** A solid annulus with broad curved faces and rounded, polished bevels. */
function glassBandGeometry(software: boolean) {
  const profile = [
    [.854, -.043], [.850, -.015], [.853, .025], [.862, .050],
    [.881, .063], [.910, .070], [.940, .062], [.960, .047],
    [.970, .024], [.971, -.020], [.962, -.047], [.944, -.062],
    [.911, -.070], [.880, -.063], [.862, -.053], [.854, -.043],
  ].map(([radius, depth]) => new THREE.Vector2(radius, depth))
  const geometry = new THREE.LatheGeometry(profile, software ? 80 : 192)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

/** Owns the emblem only: its travelling world parent and ambient particles stay outside. */
export function createSceneEmblem(options: SceneEmblemOptions) {
  const { software, mobile, film } = options
  const variant = options.variant ?? 'glass'
  const group = new THREE.Group()
  group.name = 'aether-emblem'
  group.userData.variant = variant
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const ownGeometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value }
  const ownMaterial = <T extends THREE.Material>(value: T): T => { materials.add(value); return value }
  const ringSurface = ownMaterial(options.silver.chrome.clone())
  const innerSurface = ownMaterial(options.silver.darkChrome.clone())
  const glyphSurface = ownMaterial(options.silver.chrome.clone())
  const tailChrome = ownMaterial(options.silver.chrome.clone())
  const tailDark = ownMaterial(options.silver.darkChrome.clone())
  const physical = [ringSurface, innerSurface, glyphSurface, tailChrome, tailDark]
  physical.forEach(surface => { surface.transparent = true })

  const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  fallback.name = 'aether-emblem-background-fallback'
  fallback.colorSpace = THREE.LinearSRGBColorSpace
  fallback.needsUpdate = true
  const background = { value: fallback as THREE.Texture }
  const backgroundReady = { value: 0 }
  const backgroundTexel = { value: new THREE.Vector2(1, 1) }
  const captureAspect = { value: 1 }

  const glowSurface = ownMaterial(new THREE.MeshBasicMaterial({
    color: variant === 'silver' ? 0x9bfff0 : 0xd4f5ff,
    transparent: true, opacity: variant === 'silver' ? .26 : .10,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  // These are the original silver insignia values and its original shader hook.
  glyphSurface.color.set(0xb9e4d3)
  glyphSurface.roughness = .25
  glyphSurface.metalness = software ? .25 : .87
  glyphSurface.emissive.set(0x163b35)
  glyphSurface.emissiveIntensity = .18
  glyphSurface.envMapIntensity = 2.4
  glyphSurface.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vInsigniaPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvInsigniaPosition = position;')
    shader.fragmentShader = `varying vec3 vInsigniaPosition;\n${shader.fragmentShader}`
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float ridge = sin(vInsigniaPosition.y * 5.0 + vInsigniaPosition.x * 7.0);
        normal = normalize(normal + vec3(ridge * 0.055, cos(vInsigniaPosition.y * 7.0) * 0.025, 0.0));`)
      .replace('#include <opaque_fragment>', variant === 'glass' ? '#include <opaque_fragment>' : `#include <opaque_fragment>
        float sheen = smoothstep(-0.8, 0.9, sin(vInsigniaPosition.y * 7.0 + vInsigniaPosition.x * 3.0));
        gl_FragColor.rgb *= mix(vec3(0.43, 0.65, 0.67), vec3(1.02, 1.12, 0.95), sheen);`)
  }
  glyphSurface.customProgramCacheKey = () => 'aether-sculpted-o-v2'

  const tailTime = { value: 0 }
  const tailLift = { value: 0 }
  for (const surface of [tailChrome, tailDark]) {
    surface.onBeforeCompile = shader => {
      shader.uniforms.uTailTime = tailTime
      shader.uniforms.uTailLift = tailLift
      shader.vertexShader = `uniform float uTailTime; uniform float uTailLift;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>', `#include <begin_vertex>
          float distanceFromRoot = max(0., -position.y);
          float flex = smoothstep(0., 1.2, distanceFromRoot);
          transformed.x += sin(distanceFromRoot * 1.3 - uTailTime * .5) * .18 * flex;
          transformed.z += sin(distanceFromRoot * 1.7 - uTailTime * .4) * .23 * flex;
          transformed.y = mix(position.y, -position.y * 1.35, uTailLift);
          transformed.z += sin(distanceFromRoot * .38) * uTailLift * .7;`)
    }
    surface.customProgramCacheKey = () => 'aether-descending-tail-v4'
  }

  if (variant === 'glass') {
    // A separate material recipe preserves the silver branch above. Built-in
    // transmission is deliberately zero: its opaque-only capture omits the film.
    for (const [index, surface] of physical.entries()) {
      surface.name = `aether-emblem-glass-${index}`
      surface.color.set(0xe0f2f0)
      surface.metalness = 0
      surface.roughness = software ? .23 : .065
      surface.envMapIntensity = software ? 1 : 1.8
      surface.clearcoat = software ? 0 : .7
      surface.clearcoatRoughness = .08
      surface.iridescence = software ? 0 : .82
      surface.iridescenceIOR = 1.38
      surface.iridescenceThicknessRange = [130, 470]
      surface.transmission = 0
      surface.ior = 1.46
      surface.emissive.set(0)
      surface.emissiveIntensity = 0
      surface.depthWrite = true
      surface.defines = { ...surface.defines, AETHER_LIGHT_FILM: 1 }
      const previous = surface.onBeforeCompile
      const previousKey = surface.customProgramCacheKey()
      const thickness = { value: index === 2 ? .042 : index >= 3 ? .012 : .050 }
      surface.onBeforeCompile = (shader, renderer) => {
        previous.call(surface, shader, renderer)
        Object.assign(shader.uniforms, {
          uEmblemBackground: background, uEmblemBackgroundReady: backgroundReady,
          uEmblemTexel: backgroundTexel, uEmblemAspect: captureAspect,
          uEmblemThickness: thickness, uLightFilm: film.map, uLightFilmReady: film.ready,
        })
        shader.vertexShader = `varying vec4 vEmblemClip; varying vec3 vEmblemWorld; varying vec3 vEmblemLocal;\n${shader.vertexShader}`
          .replace('#include <project_vertex>', `#include <project_vertex>
            vEmblemClip = gl_Position;
            vEmblemLocal = transformed;
            vEmblemWorld = (modelMatrix * vec4(transformed, 1.)).xyz;`)
        shader.fragmentShader = /* glsl */ `
          uniform sampler2D uEmblemBackground;
          uniform float uEmblemBackgroundReady;
          uniform vec2 uEmblemTexel;
          uniform float uEmblemAspect;
          uniform float uEmblemThickness;
          varying vec4 vEmblemClip;
          varying vec3 vEmblemWorld;
          varying vec3 vEmblemLocal;
          ${lightChoreographyGLSL}
        ` + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
          #include <normal_fragment_maps>
          // Static shallow tooling ripples bend the background, never the outline.
          vec2 opticalRipple = vec2(
            sin(vEmblemLocal.y * 13. + sin(vEmblemLocal.x * 7.) * 2.),
            cos(vEmblemLocal.x * 11. + sin(vEmblemLocal.y * 9.) * 1.7));
          normal = normalize(normal + vec3(opticalRipple * .13, 0.));
        `)
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */ `
          vec2 emblemUv = vEmblemClip.xy / max(.0001, vEmblemClip.w) * .5 + .5;
          float emblemFacing = clamp(abs(dot(normal, normalize(vViewPosition))), 0., 1.);
          float emblemFresnel = .045 + .955 * pow(1. - emblemFacing, 1.8);
          vec2 emblemBend = normal.xy * vec2(1. / max(.25, uEmblemAspect), 1.)
            * uEmblemThickness * (.45 + .55 * (1. - emblemFacing));
          vec2 emblemInset = min(uEmblemTexel * .5, vec2(.49));
          vec2 emblemUvR = clamp(emblemUv + emblemBend * 1.10, emblemInset, 1. - emblemInset);
          vec2 emblemUvG = clamp(emblemUv + emblemBend, emblemInset, 1. - emblemInset);
          vec2 emblemUvB = clamp(emblemUv + emblemBend * .90, emblemInset, 1. - emblemInset);
          // The capture is linear HDR. Only the shared VideoTexture helper
          // decodes sRGB; applying that conversion to this target would darken it.
          vec3 emblemThrough = totalDiffuse * .18;
          if (uEmblemBackgroundReady > .5) {
            emblemThrough = vec3(texture2D(uEmblemBackground, emblemUvR).r,
              texture2D(uEmblemBackground, emblemUvG).g,
              texture2D(uEmblemBackground, emblemUvB).b);
            emblemThrough *= vec3(.93, .985, 1.);
          }
          vec3 emblemReflection = totalSpecular;
          #ifdef USE_CLEARCOAT
            emblemReflection += (clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat;
          #endif
          vec3 emblemFilm = mix(aetherFilmRadiance(vEmblemWorld),
            aetherFilmColor(.5 + normal.xy * .34), .48);
          float emblemFilmLuma = dot(emblemFilm, vec3(.2126,.7152,.0722));
          // A dark film interval also dims the reflected highlight. Its colour
          // reaches the edge instead of leaving an always-silver light source.
          float emblemProjection = mix(.8, .45 + .8 * smoothstep(.015,.55,emblemFilmLuma), uLightFilmReady);
          vec3 emblemTint = mix(vec3(1.), normalize(emblemFilm + vec3(.06)) * 1.45, uLightFilmReady * .28);
          vec3 prism = .5 + .5 * cos(vec3(.4, 2.5, 4.6)
            + emblemFresnel * 8.5 + vEmblemLocal.y * .9 + normal.x * 1.5);
          vec3 glassBody = mix(vec3(.010,.017,.040), vec3(.035,.022,.060), .5+.5*normal.y);
          outgoingLight = emblemThrough * (1. - emblemFresnel * .52) * .89
            + glassBody * (.18 + emblemFresnel * .5)
            + emblemReflection * emblemTint * emblemProjection * (.12 + emblemFresnel * 1.4)
            + prism * pow(emblemFresnel, 1.5) * .36
            + emblemFilm * (.018 + emblemFresnel * emblemFresnel * .75);
          #include <opaque_fragment>
        `)
      }
      surface.customProgramCacheKey = () => `${previousKey}-solid-prism-${index}-v2`
    }
  }

  const ringSegments = software ? 64 : 144
  const ring = new THREE.Mesh(ownGeometry(variant === 'silver'
    ? new THREE.TorusGeometry(.89, .052, software ? 6 : 12, ringSegments)
    : glassBandGeometry(software)), ringSurface)
  ring.name = 'aether-emblem-ring'
  const inner = new THREE.Mesh(ownGeometry(new THREE.TorusGeometry(.84, .009, software ? 4 : 8, ringSegments)), innerSurface)
  inner.name = 'aether-emblem-inner-ring'
  inner.position.z = -.035
  inner.visible = variant === 'silver'
  const glow = new THREE.Mesh(ownGeometry(new THREE.TorusGeometry(.89, .006, software ? 4 : 6, ringSegments)), glowSurface)
  glow.name = 'aether-emblem-edge'
  glow.position.z = .026
  glow.visible = variant === 'silver'
  group.add(ring, inner, glow)

  const letter = new THREE.Shape()
  letter.moveTo(0, .49)
  letter.bezierCurveTo(.26, .49, .385, .30, .385, 0)
  letter.bezierCurveTo(.385, -.30, .26, -.49, 0, -.49)
  letter.bezierCurveTo(-.26, -.49, -.385, -.30, -.385, 0)
  letter.bezierCurveTo(-.385, .30, -.26, .49, 0, .49)
  letter.closePath()
  const counter = new THREE.Path()
  counter.moveTo(0, .365)
  counter.bezierCurveTo(-.14, .365, -.195, .21, -.195, 0)
  counter.bezierCurveTo(-.195, -.21, -.14, -.365, 0, -.365)
  counter.bezierCurveTo(.14, -.365, .195, -.21, .195, 0)
  counter.bezierCurveTo(.195, .21, .14, .365, 0, .365)
  counter.closePath()
  letter.holes.push(counter)
  const glyph = new THREE.Mesh(ownGeometry(new THREE.ExtrudeGeometry(letter, {
    depth: variant === 'silver' ? .055 : .070, bevelEnabled: true,
    bevelSegments: variant === 'silver' ? 3 : 10, steps: 1,
    bevelSize: variant === 'silver' ? .014 : .070,
    bevelThickness: variant === 'silver' ? .013 : .085,
    curveSegments: software ? 16 : variant === 'silver' ? 32 : 48,
  })), glyphSurface)
  glyph.name = 'aether-emblem-glyph'
  glyph.position.z = .03
  group.add(glyph)

  const ribbons = new THREE.Group()
  ribbons.name = 'aether-emblem-ribbons'
  group.add(ribbons)
  for (let strand = 0; strand < 2; strand++) {
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const theta = t * 5.5 + strand * Math.PI
      const spread = .89 + t ** 2 * .55
      points.push(new THREE.Vector3(Math.cos(theta) * spread, -t * 7.3, Math.sin(theta) * .5))
    }
    const path = new THREE.CatmullRomCurve3(points)
    const tail = new THREE.Mesh(ownGeometry(new THREE.TubeGeometry(path, software ? 64 : 180, .015, software ? 4 : 6, false)), tailChrome)
    tail.name = `aether-emblem-ribbon-${strand}`
    ribbons.add(tail)
    const edgePath = new THREE.CatmullRomCurve3(points.map(p => p.clone().add(new THREE.Vector3(.025, 0, -.017))))
    const edge = new THREE.Mesh(ownGeometry(new THREE.TubeGeometry(edgePath, software ? 64 : 180, .007, software ? 3 : 5, false)), tailDark)
    edge.name = `aether-emblem-ribbon-edge-${strand}`
    ribbons.add(edge)
  }
  const curtain = createCurtainBounds()
  // Install this once, after the glyph, ribbon and glass hooks have been composed.
  bindGroupCurtain(group, curtain)
  const captureMeshes: { mesh: THREE.Mesh; bounds: THREE.Box3 }[] = []
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object === glow) return
    object.geometry.computeBoundingBox()
    const bounds = object.geometry.boundingBox!.clone()
    // GPU ribbon flex/lift is absent from the CPU box; keep a conservative fringe.
    bounds.expandByScalar(object.parent === ribbons ? 2.8 : .04)
    captureMeshes.push({ mesh: object, bounds })
  })

  const target = variant === 'glass' && !software ? new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace,
  }) : null
  if (target) target.texture.name = 'aether-emblem-hdr-background'
  const drawingSize = new THREE.Vector2()
  const visibility = createCurtainVisibility()
  let disposed = false
  let capturing = false
  let captureVisible = false
  let captureDirty = true
  let captureState: CaptureState = target ? 'pending' : 'disabled'
  const clearBackground = () => {
    background.value = fallback
    backgroundReady.value = 0
  }
  const failCapture = () => {
    captureState = 'failed'
    clearBackground()
  }
  const sizeTarget = (renderer: THREE.WebGLRenderer) => {
    if (!target) return
    renderer.getDrawingBufferSize(drawingSize)
    const width = Math.max(1, drawingSize.x)
    const height = Math.max(1, drawingSize.y)
    const scale = Math.min(1, (mobile ? 384 : 720) / width, 900 / height)
    const w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale))
    if (target.width !== w || target.height !== h) {
      target.setSize(w, h)
      captureDirty = true
      clearBackground()
    }
    backgroundTexel.value.set(1 / w, 1 / h)
    captureAspect.value = width / height
  }

  return {
    group,
    update(time: number, progress: number) {
      if (disposed) return
      const state = sampleJourney(progress)
      const p = state.progress
      tailTime.value = Number.isFinite(time) ? Math.max(0, time) : 0
      tailLift.value = p > .5 ? 1 : 0
      const fold = smooth(.205, .295, p) * (1 - state.end)
      const opacity = (1 - smooth(.305, .32, p)) + smooth(.88, .955, p)
      const bounds = sampleEmblemCurtain(p)
      curtain.upper.value = bounds.upper
      curtain.lower.value = bounds.lower
      group.visible = opacity > .001
      ringSurface.opacity = innerSurface.opacity = tailChrome.opacity = tailDark.opacity = opacity
      glowSurface.opacity = (variant === 'silver' ? .26 : .10) * opacity
      group.position.set(0, 0, 0)
      const statement = smooth(.10, .18, p) * (1 - smooth(.25, .31, p))
      group.scale.setScalar(1.15 + statement * .48)
      group.rotation.set(0, smooth(.21, .30, p) * .7 * (1 - state.end), 0)
      ribbons.rotation.x = 0
      const tailPresence = p < .5 ? 1 - smooth(.10, .18, p) : 1
      ribbons.visible = tailPresence > .001
      tailChrome.opacity = tailDark.opacity = opacity * tailPresence
      glyph.scale.setScalar(1)
      glyphSurface.opacity = opacity
      glyph.visible = opacity > .005
      ringSurface.roughness = variant === 'silver' ? .12 + fold * .1 : (software ? .23 : .055) + fold * .025
    },
    prepare(renderer: THREE.WebGLRenderer) {
      if (disposed || !target || capturing) return
      clearBackground()
      captureState = 'pending'
      captureDirty = true
      captureVisible = false
      try {
        sizeTarget(renderer)
        renderer.initTexture(fallback)
        renderer.initRenderTarget(target)
      } catch { failCapture() }
    },
    capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
      scheduled = true, exclude: readonly THREE.Object3D[] = []) {
      if (disposed || !target || capturing || captureState === 'failed') return
      if (!group.visible) { captureVisible = false; captureDirty = true; return }
      visibility.begin(camera)
      const visible = captureMeshes.some(({ mesh, bounds }) => mesh.visible
        && (mesh.parent !== ribbons || ribbons.visible)
        && visibility.intersects(mesh, curtain.upper.value, curtain.lower.value, bounds))
      if (!visible) { captureVisible = false; captureDirty = true; return }
      const entering = !captureVisible
      captureVisible = true
      try { sizeTarget(renderer) }
      catch { failCapture(); return }
      if (!scheduled && !entering && !captureDirty) return
      const previousTarget = renderer.getRenderTarget()
      const previousFace = renderer.getActiveCubeFace()
      const previousLevel = renderer.getActiveMipmapLevel()
      const previousAutoClear = renderer.autoClear
      const previousXr = renderer.xr.enabled
      const previousShadows = renderer.shadowMap.autoUpdate
      const hidden = [...new Set<THREE.Object3D>([group, ...exclude])]
        .map(object => ({ object, visible: object.visible }))
      capturing = true
      try {
        hidden.forEach(({ object }) => { object.visible = false })
        renderer.xr.enabled = false
        renderer.shadowMap.autoUpdate = false
        renderer.autoClear = true
        // Target dimensions/viewport are physical pixels. Do not apply DPR twice.
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        if (!disposed) {
          background.value = target.texture
          backgroundReady.value = 1
          captureDirty = false
          captureState = 'ready'
        }
      } catch { failCapture() }
      finally {
        hidden.forEach(({ object, visible: wasVisible }) => { object.visible = disposed && object === group ? false : wasVisible })
        try { renderer.setRenderTarget(previousTarget, previousFace, previousLevel) }
        catch { failCapture() }
        renderer.autoClear = previousAutoClear
        renderer.xr.enabled = previousXr
        renderer.shadowMap.autoUpdate = previousShadows
        capturing = false
      }
    },
    getStatus() {
      return { variant, capture: captureState, width: target?.width ?? 0, height: target?.height ?? 0 }
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearBackground()
      captureState = 'disabled'
      group.visible = false
      group.removeFromParent()
      target?.dispose()
      fallback.dispose()
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
      geometries.clear()
      materials.clear()
      group.clear()
    },
  }
}
