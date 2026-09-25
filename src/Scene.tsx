import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createAtmosphere } from './Atmosphere'
import { createSceneInteraction } from './SceneInteraction'
import { createSceneWorlds } from './SceneWorlds'
import { sampleJourney, sampleViewAzimuth } from './Journey'
import { scrollToScene } from './ScrollTimeline'
import { createSceneGlow } from './SceneGlow'
import { createSceneForest } from './SceneForest'
import { createSceneJellyfish } from './SceneJellyfish'
import { createSceneLayers, sampleLayers } from './SceneLayers'
import { bindCurtain, createCurtainBounds } from './SceneCurtains'
import { createSceneVideo } from './SceneVideo'
import { prepareSceneShaders } from './ScenePreparation'
import type { LoadingStage } from './loading'
import { createSceneLightVideo } from './SceneLightVideo'
import { createLightFilmUniforms, lightChoreographyGLSL, sampleLightChoreography } from './SceneLighting'
import { createSceneLightShafts } from './SceneLightShafts'
import { createSceneEmblem } from './SceneEmblem'

type SceneProps = {
  reducedMotion: boolean
  active: boolean
  onLoading: (stage: LoadingStage) => void
  onUnavailable: () => void
  onSelectProject?: (index: number) => void
}

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uMotion;
  varying vec3 vColor;
  varying float vDepth;
  varying float vPhase;
  ${lightChoreographyGLSL}
  void main() {
    vec3 p = position;
    float t = uTime * 0.12;
    p.x += sin(p.y * 0.9 + t + aPhase) * 0.14 * uMotion;
    p.z += cos(p.y * 0.7 + t + aPhase) * 0.18 * uMotion;
    p.y += sin(t * 0.6 + aPhase) * 0.10 * uMotion;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPixelRatio * (13.0 / -mv.z), 0.9, 26.0 * uPixelRatio);
    vColor = aColor;
    if (uLightFilmReady > .5) {
      vec3 film = aetherFilmRadiance((modelMatrix * vec4(p, 1.)).xyz);
      vColor = aColor * .20 + film * .62;
    }
    vDepth = -mv.z;
    vPhase = aPhase;
  }
`

const particleFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vDepth;
  varying float vPhase;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = dot(uv, uv);
    if (r > 1.0) discard;
    float z = sqrt(max(0.0, 1.0 - r));
    vec3 n = vec3(uv, z);
    float diffuse = max(0.0, dot(n, normalize(vec3(-0.5, 0.7, 1.0))));
    float edge = pow(1.0 - z, 2.0);
    float spec = pow(max(0.0, dot(n, normalize(vec3(-0.35, 0.5, 1.0)))), 22.0);
    float shimmer = 0.76 + 0.24 * sin(uTime * 0.5 + vPhase);
    vec3 color = vColor * (0.28 + diffuse * 0.8 + edge * 0.6);
    color += vec3(0.6, 0.9, 1.0) * spec * 0.7;
    float fog = exp(-max(0.0, vDepth - 9.0) * 0.10);
    float focus = smoothstep(5.0, 11.0, vDepth);
    float alpha = smoothstep(1.0, mix(0.25, 0.78, focus), r) * shimmer * fog * uOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/** Original procedural geometry with two locally authored monitor films. */
export default function Scene({ reducedMotion, active, onLoading, onUnavailable, onSelectProject }: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(onLoading)
  const unavailableRef = useRef(onUnavailable)
  const activeRef = useRef(active)
  const wakeRef = useRef<(() => void) | null>(null)
  const selectProjectRef = useRef(onSelectProject)
  const videoRef = useRef<ReturnType<typeof createSceneVideo> | null>(null)
  const lightVideoRef = useRef<ReturnType<typeof createSceneLightVideo> | null>(null)
  const forestVideoRef = useRef<ReturnType<typeof createSceneLightVideo> | null>(null)
  // Motion preference changes rebuild the render budget, preserving the view
  // and time so pausing cannot snap a user's chosen angle back to the front.
  const preserved = useRef({ yaw: 0, pitch: 0, elapsed: 0, scaleElapsed: 0, reactor: undefined as Float32Array | undefined })

  useEffect(() => {
    loadingRef.current = onLoading
    unavailableRef.current = onUnavailable
  }, [onLoading, onUnavailable])

  useEffect(() => {
    selectProjectRef.current = onSelectProject
  }, [onSelectProject])

  // Decoders outlive GPU rebuilds caused by motion preference changes. Only
  // an actual component teardown releases their frames and network resources.
  useEffect(() => () => {
    videoRef.current?.dispose()
    videoRef.current = null
    lightVideoRef.current?.dispose()
    lightVideoRef.current = null
    forestVideoRef.current?.dispose()
    forestVideoRef.current = null
  }, [])

  useEffect(() => {
    activeRef.current = active
    wakeRef.current?.()
  }, [active])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer | undefined
    let frame = 0
    let frameTimer: number | undefined
    let disposed = false
    let contextLost = false
    let ready = false
    const report = (stage: LoadingStage) => {
      if (!disposed && !contextLost) loadingRef.current(stage)
    }
    report('module')
    let cleanup: (() => void) | undefined
    const effectDisposers: Array<() => void> = []
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const renderTargets = new Set<THREE.WebGLRenderTarget>()
    const markReady = () => {
      if (!ready && !disposed) {
        ready = true
        report('frame')
      }
    }
    const geometry = <T extends THREE.BufferGeometry>(value: T): T => {
      geometries.add(value)
      return value
    }
    const material = <T extends THREE.Material>(value: T): T => {
      materials.add(value)
      return value
    }
    const releaseResources = () => {
      videoRef.current?.update(false, true)
      lightVideoRef.current?.setActive(false, true)
      forestVideoRef.current?.setActive(false, true)
      document.documentElement.classList.remove('scene-monitor-hover')
      cleanup?.()
      cleanup = undefined
      effectDisposers.splice(0).forEach((dispose) => dispose())
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
      renderTargets.forEach((item) => item.dispose())
      geometries.clear()
      materials.clear()
      renderTargets.clear()
      renderer?.domElement.remove()
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = undefined
    }
    const failScene = () => {
      contextLost = true
      cancelAnimationFrame(frame)
      window.clearTimeout(frameTimer)
      frameTimer = undefined
      frame = 0
      if (renderer) renderer.domElement.dataset.renderState = 'lost'
      releaseResources()
      if (!disposed) unavailableRef.current()
    }

    try {
      const smallScreen = window.innerWidth < 768
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !smallScreen,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      })
      const activeRenderer = renderer
      const gl = activeRenderer.getContext()
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      const rendererName = String(
        gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      )
      // Software WebGL competes with input and layout for CPU time. Keep the
      // same scene, but use a bounded budget rather than starving navigation.
      const softwareRenderer = /swiftshader|llvmpipe|softpipe|software/i.test(rendererName)
      let quality = 1
      const pixelRatio = (width: number) =>
        Math.min(window.devicePixelRatio, softwareRenderer ? 0.75 : width < 768 ? 1.25 : 1.5) * quality
      activeRenderer.setPixelRatio(pixelRatio(window.innerWidth))
      activeRenderer.setSize(window.innerWidth, window.innerHeight)
      activeRenderer.setClearColor(0x020809, 0)
      activeRenderer.outputColorSpace = THREE.SRGBColorSpace
      activeRenderer.toneMapping = THREE.ACESFilmicToneMapping
      activeRenderer.toneMappingExposure = 1.45
      activeRenderer.info.autoReset = false
      const canvas = activeRenderer.domElement
      canvas.className = 'scene-canvas'
      canvas.dataset.renderProfile = softwareRenderer ? 'software' : 'gpu'
      canvas.dataset.renderState = 'loading'
      canvas.setAttribute('aria-hidden', 'true')
      canvas.style.cssText = 'display:block;width:100%;height:100%;transition:opacity 600ms ease;'
      host.appendChild(canvas)

      const scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(0x031011, 0.026)
      const camera = new THREE.PerspectiveCamera(
        42,
        window.innerWidth / window.innerHeight,
        0.1,
        90,
      )
      camera.position.set(0, 0, smallScreen ? 13.5 : 10.8)

      // Studio light cards create convincing chrome reflections without image assets.
      const environment = new THREE.Scene()
      environment.background = new THREE.Color(0x020406)
      const lightCardGeometry = geometry(new THREE.PlaneGeometry(1, 1))
      const addLightCard = (
        color: number,
        intensity: number,
        position: THREE.Vector3,
        scale: THREE.Vector2,
      ) => {
        const card = new THREE.Mesh(
          lightCardGeometry,
          material(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })),
        )
        ;(card.material as THREE.MeshBasicMaterial).color.multiplyScalar(intensity)
        card.position.copy(position)
        card.scale.set(scale.x, scale.y, 1)
        card.lookAt(0, 0, 0)
        environment.add(card)
      }
      addLightCard(0xa0fff2, 5, new THREE.Vector3(-4, 1, 3), new THREE.Vector2(1, 6))
      addLightCard(0xc1d9ff, 4, new THREE.Vector3(4, 2, 2), new THREE.Vector2(0.7, 5))
      addLightCard(0xeaf8dd, 6, new THREE.Vector3(0, 5, 1), new THREE.Vector2(5, 0.5))
      addLightCard(0x82915a, 2, new THREE.Vector3(0, -3, 2), new THREE.Vector2(4, 1))
      addLightCard(0x31427e, 2, new THREE.Vector3(0, 1, -4), new THREE.Vector2(3, 6))
      addLightCard(0x91c6bc, 1.2, new THREE.Vector3(0.7, 0.2, 6), new THREE.Vector2(3.5, 5))
      let envMap: THREE.WebGLRenderTarget | undefined
      const refreshEnvironment = () => {
        if (softwareRenderer) return
        if (envMap) {
          envMap.dispose()
          renderTargets.delete(envMap)
        }
        const pmrem = new THREE.PMREMGenerator(activeRenderer)
        try {
          envMap = pmrem.fromScene(environment, 0.06, 0.1, 30)
          renderTargets.add(envMap)
          scene.environment = envMap.texture
        } finally {
          pmrem.dispose()
        }
      }
      refreshEnvironment()

      const ambient = new THREE.AmbientLight(0x3d7072, 1.2)
      scene.add(ambient)
      const keyLight = new THREE.DirectionalLight(0xcafff0, 4)
      keyLight.position.set(-3, 5, 4)
      scene.add(keyLight)
      const rimLight = new THREE.PointLight(0x3897ff, 25, 15, 2)
      rimLight.position.set(3, -1, 4)
      scene.add(rimLight)
      const warmLight = new THREE.PointLight(0xb3ca65, 14, 14, 2)
      warmLight.position.set(-2, -3, 2)
      scene.add(warmLight)

      const chrome = material(
        new THREE.MeshPhysicalMaterial({
          color: 0xc9e4da,
          metalness: 1,
          roughness: 0.16,
          envMapIntensity: 2,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          iridescence: 0.8,
          iridescenceIOR: 1.35,
          iridescenceThicknessRange: [100, 390],
        }),
      )
      const darkChrome = material(
        new THREE.MeshPhysicalMaterial({
          color: 0x3d686b,
          metalness: 1,
          roughness: 0.22,
          envMapIntensity: 1.7,
          clearcoat: 1,
          iridescence: 0.7,
        }),
      )
      if (softwareRenderer) {
        for (const surface of [chrome, darkChrome]) {
          surface.clearcoat = 0
          surface.iridescence = 0
          surface.metalness = 0.25
          surface.roughness = 0.5
          surface.emissive.copy(surface.color).multiplyScalar(0.16)
        }
      }
      const forestVideo = forestVideoRef.current ??= createSceneLightVideo({
        source: '/media/forest-memory.mp4', role: 'forest-memory',
      })
      // One source and decoder drive the forest, reactor and water ceiling.
      const lightVideo = lightVideoRef.current = forestVideo
      const lightFilm = createLightFilmUniforms(lightVideo.texture)
      const forestFilm = createLightFilmUniforms(forestVideo.texture)
      const particleFilm = createLightFilmUniforms(forestVideo.texture)
      const world = new THREE.Group()
      scene.add(world)
      const emblemView = createSceneEmblem({
        software: softwareRenderer, mobile: smallScreen,
        variant: 'glass', // 'silver' restores the original ring, O and ribbons.
        silver: { chrome, darkChrome }, film: forestFilm,
      })
      const emblem = emblemView.group
      world.add(emblem)
      effectDisposers.push(() => emblemView.dispose())

      const random = seededRandom(27182)
      const count = softwareRenderer ? 140 : smallScreen ? 600 : 1700
      const positions = new Float32Array(count * 3)
      const colors = new Float32Array(count * 3)
      const sizes = new Float32Array(count)
      const phases = new Float32Array(count)
      const particleColor = new THREE.Color()
      for (let i = 0; i < count; i += 1) {
        const side = random() > 0.5 ? 1 : -1
        const foreground = i < (softwareRenderer ? 45 : smallScreen ? 90 : 260)
        const peripheral = foreground || random() < 0.13
        const cloud = random() + random() + random() - 1.5
        // Gaussian-height plumes avoid a flat upper edge; foreground motes stay
        // at the periphery so that neither the emblem nor the copy is obscured.
        const y = peripheral
          ? -6 + random() * 11
          : -3.7 + (random() + random() + random() - 1.5) * 3.7
        const branch = Math.max(0, y + 5)
        const spiral = Math.sin(y * 1.15 + side * 0.5) * 0.32
        const x = peripheral
          ? side * (4.0 + random() * 3.8)
          : side * (0.75 + branch * 0.27 + spiral) + cloud * (0.65 + branch * 0.2)
        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = foreground
          ? 1.2 + random() * 3.6
          : -0.5 - random() * 6 + Math.sin(y * 0.65)
        const blue = foreground || random() < 0.27
        particleColor.setHSL(
          blue ? 0.47 + random() * 0.16 : 0.15 + random() * 0.12,
          0.5 + random() * 0.35,
          foreground ? 0.18 + random() * 0.2 : 0.09 + random() * 0.22,
        )
        colors.set([particleColor.r, particleColor.g, particleColor.b], i * 3)
        sizes[i] = foreground ? 3 + Math.pow(random(), 2) * 8 : 1.2 + Math.pow(random(), 2.4) * 7
        phases[i] = random() * Math.PI * 2
      }
      const particlesGeometry = geometry(new THREE.BufferGeometry())
      particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      particlesGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
      particlesGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      particlesGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
      const particlesMaterial = material(
        new THREE.ShaderMaterial({
          uniforms: {
            uLightFilm: forestFilm.map, uLightFilmReady: forestFilm.ready,
            uTime: { value: 0 },
            uPixelRatio: { value: activeRenderer.getPixelRatio() },
            uMotion: { value: reducedMotion ? 0 : 1 },
            uOpacity: { value: 0.87 },
          },
          vertexShader: particleVertex,
          fragmentShader: particleFragment,
          defines: { AETHER_LIGHT_FILM: 1 },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      )
      const ambientCurtain = createCurtainBounds()
      bindCurtain(particlesMaterial, ambientCurtain)
      const particles = new THREE.Points(particlesGeometry, particlesMaterial)
      particles.frustumCulled = false
      world.add(particles)

      const distantCount = softwareRenderer ? 100 : smallScreen ? 220 : 700
      const distantPositions = new Float32Array(distantCount * 3)
      const distantColors = new Float32Array(distantCount * 3)
      const distantSizes = new Float32Array(distantCount)
      const distantPhases = new Float32Array(distantCount)
      for (let i = 0; i < distantCount; i += 1) {
        distantPositions.set(
          [(random() - 0.5) * 28, 8 - random() * 80, -4 - random() * 17],
          i * 3,
        )
        particleColor.setHSL(0.34 + random() * 0.3, 0.5, 0.08 + random() * 0.12)
        distantColors.set([particleColor.r, particleColor.g, particleColor.b], i * 3)
        distantSizes[i] = 1 + random() * 2.5
        distantPhases[i] = random() * 6.28
      }
      const distantGeometry = geometry(new THREE.BufferGeometry())
      distantGeometry.setAttribute('position', new THREE.BufferAttribute(distantPositions, 3))
      distantGeometry.setAttribute('aColor', new THREE.BufferAttribute(distantColors, 3))
      distantGeometry.setAttribute('aSize', new THREE.BufferAttribute(distantSizes, 1))
      distantGeometry.setAttribute('aPhase', new THREE.BufferAttribute(distantPhases, 1))
      const distantParticles = new THREE.Points(distantGeometry, particlesMaterial)
      scene.add(distantParticles)

      const jellyfish = createSceneJellyfish(scene, softwareRenderer, smallScreen)
      const creatureRoot = jellyfish.group
      effectDisposers.push(() => jellyfish.dispose())

      const lightShafts = createSceneLightShafts(scene, softwareRenderer, smallScreen, lightFilm, forestFilm)
      effectDisposers.push(() => lightShafts.dispose())
      const atmosphere = createAtmosphere(scene, softwareRenderer, smallScreen, particleFilm,
        { renderer: activeRenderer, reducedMotion, reactorSnapshot: preserved.current.reactor })
      effectDisposers.push(() => atmosphere.dispose())
      const video = videoRef.current ??= createSceneVideo()
      const artworkReady = { value: 0 }
      const artworkTexture = new THREE.TextureLoader().load('/media/scale-alloy.jpg', () => {
        if (disposed || !renderer) return
        artworkReady.value = 1
        requestRender()
      }, undefined, () => {
        // The procedural alloy is a complete fallback if this optional image
        // cannot load. A missing finish must never disable the 3D journey.
        artworkReady.value = 0
      })
      artworkTexture.colorSpace = THREE.SRGBColorSpace
      artworkTexture.anisotropy = Math.min(4, activeRenderer.capabilities.getMaxAnisotropy())
      effectDisposers.push(() => artworkTexture.dispose())
      const worlds = createSceneWorlds(scene, softwareRenderer, smallScreen, video, lightFilm,
        { map: { value: artworkTexture }, ready: artworkReady })
      effectDisposers.push(() => worlds.dispose())
      const forest = createSceneForest(scene, softwareRenderer, smallScreen, forestFilm)
      effectDisposers.push(() => forest.dispose())
      const layers = createSceneLayers(scene)
      effectDisposers.push(() => layers.dispose())
      const glow = softwareRenderer ? undefined : createSceneGlow(activeRenderer, scene, camera, !smallScreen)
      glow?.resize(innerWidth, innerHeight, activeRenderer.getPixelRatio())
      if (glow) effectDisposers.push(() => glow.dispose())
      const interaction = createSceneInteraction(
        scene,
        camera,
        canvas,
        reducedMotion,
        softwareRenderer,
        preserved.current,
      )
      effectDisposers.push(() => interaction.dispose())
      const readProgress = () => {
        if (location.hash && location.hash !== '#home') return 0
        return scrollToScene(window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight))
      }
      const emblemCaptureExclusions: THREE.Object3D[] = []
      scene.traverse(object => {
        if ((object as THREE.Object3D & { isReflector?: boolean }).isReflector) emblemCaptureExclusions.push(object)
      })
      const centre = new THREE.Vector3(0, 0, 0)
      const projectedCentre = new THREE.Vector3()
      const modelCentre = new THREE.Vector3()
      let targetProgress = readProgress()
      let progress = targetProgress
      let elapsed = preserved.current.elapsed
      let scaleElapsed = preserved.current.scaleElapsed
      let previousTime = 0
      let renderedFrames = 0
      let frameAverage = 16
      let qualityFrames = 0
      let foreground = true
      let preparing = true
      let preparationGeneration = 0
      const monitorPointer = new THREE.Vector2()
      let monitorPress: {
        id: number; x: number; y: number; started: number; scrollY: number; progress: number; panel: number
      } | null = null
      const overInterface = (target: EventTarget | null) => target instanceof Element && Boolean(
        target.closest('a,button,input,select,textarea,dialog,label,summary,[role="button"],[role="link"],[contenteditable]:not([contenteditable="false"]),[data-no-camera]'),
      )
      const sceneAvailable = () => !disposed && !contextLost && !document.hidden && foreground &&
        activeRef.current && (!location.hash || location.hash === '#home') &&
        !document.querySelector('dialog[open]')
      const clearMonitorHover = () => {
        document.documentElement.classList.remove('scene-monitor-hover')
        canvas.dataset.monitorHover = '-1'
      }
      const cancelMonitorPress = () => { monitorPress = null }
      const syncMedia = () => {
        const enabled = sceneAvailable()
        atmosphere.setFlowActive(enabled)
        // A hidden scene retains its previous panel visibility. On returning
        // home, the layout resets scroll before that GPU frame is replaced;
        // consult the actual destination so stale panels cannot resume media.
        targetProgress = readProgress()
        const mask = sampleLayers(targetProgress)
        // The slanted viewport boundary spans [-.1, 1.1] in monitor UV space.
        const targetHasMonitors = mask.monitorEntry > -.1 && mask.monitorExit < 1.1 &&
          mask.monitorEntry > mask.monitorExit
        interaction.setActive(enabled, !foreground && !document.hidden && activeRef.current &&
          (!location.hash || location.hash === '#home') && !document.querySelector('dialog[open]'))
        worlds.setMediaActive(enabled && targetHasMonitors, reducedMotion)
        forestVideo.setActive(enabled && !softwareRenderer && !preparing, reducedMotion)
        canvas.dataset.videoState = JSON.stringify(worlds.getVideoStatus())
        if (!enabled || reducedMotion) {
          clearMonitorHover()
          if (!enabled) cancelMonitorPress()
        }
      }
      const monitorHit = (event: PointerEvent) => {
        monitorPointer.set(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2)
        return worlds.getMonitorHit(monitorPointer, camera)
      }
      const monitorDown = (event: PointerEvent) => {
        cancelMonitorPress()
        if (!sceneAvailable() || event.button !== 0 || !event.isPrimary || overInterface(event.target)) return
        const panel = monitorHit(event)
        if (panel === null) return
        monitorPress = {
          id: event.pointerId, x: event.clientX, y: event.clientY, started: event.timeStamp,
          scrollY: window.scrollY, progress, panel,
        }
      }
      const monitorMove = (event: PointerEvent) => {
        if (!sceneAvailable() || overInterface(event.target)) {
          cancelMonitorPress()
          clearMonitorHover()
          return
        }
        if (reducedMotion || event.pointerType === 'touch') clearMonitorHover()
        if (monitorPress && event.pointerId === monitorPress.id &&
          Math.hypot(event.clientX - monitorPress.x, event.clientY - monitorPress.y) >= 8) {
          cancelMonitorPress()
        }
      }
      const monitorUp = (event: PointerEvent) => {
        const press = monitorPress
        cancelMonitorPress()
        if (!press || event.pointerId !== press.id || event.button !== 0 || !sceneAvailable() ||
          overInterface(event.target) || event.timeStamp - press.started > 700 ||
          Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8 ||
          Math.abs(window.scrollY - press.scrollY) > .5 || Math.abs(progress - press.progress) > .0001) return
        const panel = monitorHit(event)
        if (panel !== press.panel) return
        // Pause synchronously; the React dialog/active update follows this event.
        worlds.setMediaActive(false, reducedMotion)
        lightVideo.setActive(false, reducedMotion)
        forestVideo.setActive(false, reducedMotion)
        canvas.dataset.videoState = JSON.stringify(worlds.getVideoStatus())
        interaction.setActive(false)
        clearMonitorHover()
        document.documentElement.style.setProperty('--project-origin-x', `${event.clientX / innerWidth * 100}%`)
        document.documentElement.style.setProperty('--project-origin-y', `${event.clientY / innerHeight * 100}%`)
        document.querySelector<HTMLElement>('.hero-stage')?.focus({ preventScroll: true })
        selectProjectRef.current?.(panel)
      }
      const applyResolution = () => {
        activeRenderer.setPixelRatio(pixelRatio(innerWidth))
        activeRenderer.setSize(innerWidth, innerHeight)
        glow?.resize(innerWidth, innerHeight, activeRenderer.getPixelRatio())
        particlesMaterial.uniforms.uPixelRatio.value = activeRenderer.getPixelRatio()
      }

      const render = (timestamp: number) => {
        frame = 0
        syncMedia()
        if (disposed || contextLost || document.hidden) return
        const wallDelta = previousTime ? (timestamp - previousTime) / 1000 : 0.016
        const delta = Math.min(wallDelta, 0.05)
        previousTime = timestamp
        if (!reducedMotion) {
          elapsed += delta
          // Keep the panel's seven-second clock in wall seconds even when the
          // software renderer takes longer than the shared animation step.
          scaleElapsed += Math.max(0, wallDelta)
        }
        progress = reducedMotion
          ? targetProgress
          : THREE.MathUtils.damp(progress, targetProgress, 7, Math.min(wallDelta, 0.4))
        if (Math.abs(progress - targetProgress) < .00001) progress = targetProgress
        const scroll = THREE.MathUtils.clamp(progress, 0, 1)
        const state = sampleJourney(scroll)
        centre.set(0, state.height, 0)
        particlesMaterial.uniforms.uTime.value = elapsed
        interaction.setOrbitEnabled(state.orbitEnabled)
        interaction.setFocus(centre)
        const input = interaction.update(delta || 0.016, elapsed, activeRenderer.getPixelRatio(), scroll, wallDelta)
        preserved.current.yaw = input.yaw
        preserved.current.pitch = input.pitch
        preserved.current.elapsed = elapsed
        preserved.current.scaleElapsed = scaleElapsed
        world.rotation.set(0, 0, 0)
        world.position.copy(centre)
        particles.visible = distantParticles.visible = scroll < .20 || scroll > .855
        emblemView.update(elapsed, scroll)
        const mobileView = innerWidth < 768
        const orbitRadius = state.radius + (mobileView ? 4.8 : 0)
        const requestedAzimuth = state.azimuth + (input.yaw + input.field.ndc.x * .012 * input.field.strength) * state.orbitWeight
        // Forest drag rotates its foreground, while the camera keeps facing
        // the world-space film. Mechanical scenes retain their existing camera.
        const azimuth = sampleViewAzimuth(scroll, requestedAzimuth)
        const foregroundYaw = azimuth - requestedAzimuth
        world.rotation.y = forest.group.rotation.y = creatureRoot.rotation.y = distantParticles.rotation.y = foregroundYaw
        const elevation = THREE.MathUtils.clamp(state.elevation + input.pitch * state.orbitWeight, -.72, .72)
        camera.position.set(
          Math.sin(azimuth) * Math.cos(elevation) * orbitRadius,
          state.height + Math.sin(elevation) * orbitRadius,
          Math.cos(azimuth) * Math.cos(elevation) * orbitRadius,
        )
        activeRenderer.toneMappingExposure = state.exposure
        ambient.intensity = 1.1 - state.darkness * .68
        const light = sampleLightChoreography(elapsed, scroll)
        keyLight.color.setHSL(light.keyHue, .22, .88)
        keyLight.intensity = (3.4 - state.scales * .5 - state.darkness * 1.8) * light.keyIntensity
        rimLight.color.setHSL(light.rimHue, .8, .64)
        rimLight.intensity = (22 + state.energy * 12 + input.burst * 10) * light.rimIntensity
        warmLight.color.setHSL(light.warmHue, .7, .62)
        warmLight.intensity = (10 + state.spine * 14 + state.scales * 6) * light.warmIntensity
        keyLight.position.y = state.height + 5
        keyLight.target.position.copy(centre)
        keyLight.target.updateMatrixWorld()
        rimLight.position.y = state.height - 1
        warmLight.position.y = state.height - 3
        scene.fog!.color.set(0x03090d)
        particlesMaterial.uniforms.uOpacity.value = .35 * (1-state.darkness*.6)
        jellyfish.update(elapsed, scroll)
        ambientCurtain.upper.value = jellyfish.curtain.upper.value
        ambientCurtain.lower.value = jellyfish.curtain.lower.value
        camera.lookAt(centre)
        camera.updateMatrixWorld()
        lightFilm.map.value = lightVideo.texture
        lightFilm.ready.value = lightVideo.getReady() ? 1 : 0
        canvas.dataset.lightVideoState = JSON.stringify(lightVideo.getStatus())
        forestFilm.map.value = forestVideo.texture
        forestFilm.ready.value = forestVideo.getReady() ? 1 : 0
        const activeFilm = scroll < .235 || scroll > .855 ? forestFilm : lightFilm
        particleFilm.map.value = activeFilm.map.value
        particleFilm.ready.value = activeFilm.ready.value
        canvas.dataset.forestVideoState = JSON.stringify(forestVideo.getStatus())
        // Projection-based surface interaction must use this frame's camera.
        worlds.update(elapsed, scroll, input.field, camera, scaleElapsed, mobileView)
        canvas.dataset.scaleTime = scaleElapsed.toFixed(4)
        const monitorHover = sceneAvailable() && input.field.active ? worlds.getHoveredPanel() : -1
        canvas.dataset.monitorHover = String(monitorHover)
        document.documentElement.classList.toggle('scene-monitor-hover', monitorHover >= 0)
        canvas.dataset.videoState = JSON.stringify(worlds.getVideoStatus())
        try {
          // Include simulation passes in the same frame's draw-call accounting.
          activeRenderer.info.reset()
          atmosphere.update(elapsed, scroll, activeRenderer.getPixelRatio(), input.field, camera)
        } catch {
          failScene()
          return
        }
        canvas.dataset.reactorFlow = JSON.stringify(atmosphere.getFlowStatus())
        lightShafts.update(elapsed, scroll, camera)
        forest.update(elapsed, scroll, camera, input.field, activeRenderer.getPixelRatio())
        layers.update(scroll, camera, input.field)
        glow?.update(elapsed, scroll, input.field)

        try {
          // All glass screens share one bounded background capture. Refresh it
          // at half the display cadence; paused/reduced-motion frames stay exact.
          emblemView.capture(activeRenderer, scene, camera, renderedFrames % 2 === 0 || reducedMotion, emblemCaptureExclusions)
          canvas.dataset.emblemState = JSON.stringify(emblemView.getStatus())
          worlds.capture(activeRenderer, camera, renderedFrames % 2 === 0 || reducedMotion)
          if (glow) glow.render(state.energy, quality > .65 && innerWidth >= 768)
          else activeRenderer.render(scene, camera)
          renderedFrames++
          if (renderedFrames === 1 || renderedFrames % 15 === 0 || reducedMotion) {
            projectedCentre.copy(centre).project(camera)
            canvas.dataset.journeyStep = String(state.index + 1)
            canvas.dataset.focusX = projectedCentre.x.toFixed(4)
            canvas.dataset.focusY = projectedCentre.y.toFixed(4)
            canvas.dataset.orbitYaw = input.yaw.toFixed(4)
            canvas.dataset.renderProgress = scroll.toFixed(6)
            canvas.dataset.pointerStrength = input.field.strength.toFixed(4)
            canvas.dataset.cameraY = camera.position.y.toFixed(4)
            canvas.dataset.targetY = centre.y.toFixed(4)
            canvas.dataset.modelY = emblem.getWorldPosition(modelCentre).y.toFixed(4)
            canvas.dataset.viewAzimuth = azimuth.toFixed(4)
            canvas.dataset.forestYaw = foregroundYaw.toFixed(4)
            canvas.dataset.structureYaw = state.structureYaw.toFixed(4)
            canvas.dataset.ringRoll = emblem.rotation.z.toFixed(4)
            canvas.dataset.chainPhase = state.chainPhase.toFixed(6)
            canvas.dataset.orbitEnabled = String(state.orbitEnabled)
            canvas.dataset.chamberY = worlds.getChamberHeight().toFixed(4)
            canvas.dataset.frameMs = frameAverage.toFixed(1)
            canvas.dataset.drawCalls = String(activeRenderer.info.render.calls)
            canvas.dataset.quality = quality.toFixed(2)
            canvas.dataset.geometries = String(activeRenderer.info.memory.geometries)
            canvas.dataset.textures = String(activeRenderer.info.memory.textures)
            canvas.dataset.programs = String(activeRenderer.info.programs?.length ?? 0)
            canvas.dataset.renderFrame = String(renderedFrames)
          }
          if (canvas.dataset.renderState !== 'ready') {
            canvas.dataset.renderState = 'ready'
            canvas.style.opacity = '1'
          }
          markReady()
          // Sustained frame cost lowers resolution; hysteresis avoids oscillation
          // after one shader compilation, resize, tab switch or screenshot.
          if (!softwareRenderer && wallDelta > 0 && !reducedMotion) {
            frameAverage += (Math.min(wallDelta, .25) * 1000 - frameAverage) * .035
            qualityFrames++
            if (((qualityFrames > 150 && frameAverage > 30) ||
              (qualityFrames > 20 && frameAverage > 80)) && quality > .6) {
              quality = Math.max(.6, quality - .15)
              applyResolution()
              qualityFrames = 0
            } else if (qualityFrames > 360 && frameAverage < 19 && quality < 1) {
              quality = Math.min(1, quality + .1)
              applyResolution()
              qualityFrames = 0
            }
          }
        } catch {
          failScene()
        }
        if (!reducedMotion && !contextLost && activeRef.current) {
          if (softwareRenderer) {
            // An actual idle interval after each software frame leaves room for
            // pointer/scroll/focus events, even when one frame takes > 50 ms.
            frameTimer = window.setTimeout(() => {
              frameTimer = undefined
              requestRender()
            }, 50)
          } else {
            frame = requestAnimationFrame(render)
          }
        }
      }

      const requestRender = () => {
        if (!preparing && !frame && frameTimer === undefined && !disposed && !contextLost && !document.hidden)
          frame = requestAnimationFrame(render)
      }
      const prepare = async () => {
        preparing = true
        canvas.dataset.preparation = 'compiling'
        const generation = ++preparationGeneration
        const cancelled = () => disposed || contextLost || generation !== preparationGeneration
        try {
          // Draw wrapper canvases before shader preparation; no video is
          // downloaded here and no future section is shown to the user.
          layers.update(readProgress(), camera)
          worlds.prepare(activeRenderer)
          emblemView.prepare(activeRenderer)
          await atmosphere.prepare()
          report('resources')
          // Exercise the film sampling branch with the black placeholder too.
          // No media request is needed to prime an otherwise dormant GPU path.
          lightFilm.ready.value = forestFilm.ready.value = particleFilm.ready.value = 1
          try {
            await prepareSceneShaders(activeRenderer, scene, camera, cancelled, stage => {
              if (!cancelled()) report(stage)
            })
          } finally {
            lightFilm.ready.value = lightVideo.getReady() ? 1 : 0
            forestFilm.ready.value = forestVideo.getReady() ? 1 : 0
            particleFilm.ready.value = forestFilm.ready.value
          }
          if (cancelled()) return
          glow?.prepare()
          canvas.dataset.preparation = 'ready'
          preparing = false
          previousTime = 0
          requestRender()
        } catch {
          if (!cancelled()) failScene()
        }
      }
      // Hidden content views retain their last frame, releasing CPU/GPU time
      // for cards and dialogs without rebuilding the scene on navigation.
      wakeRef.current = () => {
        syncMedia()
        previousTime = 0
        requestRender()
      }
      const resize = () => {
        cancelMonitorPress()
        const width = window.innerWidth
        const height = window.innerHeight
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        applyResolution()
        targetProgress = readProgress()
        requestRender()
      }
      const scroll = () => {
        cancelMonitorPress()
        targetProgress = readProgress()
        syncMedia()
        requestRender()
      }
      const visibilityChange = () => {
        syncMedia()
        if (document.hidden) {
          cancelAnimationFrame(frame)
          window.clearTimeout(frameTimer)
          frameTimer = undefined
          frame = 0
        } else {
          previousTime = 0
          requestRender()
        }
      }
      const lost = (event: Event) => {
        event.preventDefault()
        contextLost = true
        preparationGeneration++
        syncMedia()
        canvas.dataset.renderState = 'lost'
        cancelAnimationFrame(frame)
        window.clearTimeout(frameTimer)
        frameTimer = undefined
        frame = 0
        canvas.style.opacity = '0'
        if (!disposed) unavailableRef.current()
      }
      const restored = () => {
        if (disposed) return
        try {
          refreshEnvironment()
          atmosphere.resetFlow()
          contextLost = false
          ready = false
          report('module')
          preparing = true
          previousTime = 0
          resize()
          void prepare()
        } catch {
          failScene()
        }
      }
      const blur = () => {
        foreground = false
        syncMedia()
      }
      const focusWindow = () => {
        foreground = true
        syncMedia()
        requestRender()
      }
      const leaveMonitor = () => {
        cancelMonitorPress()
        clearMonitorHover()
      }
      window.addEventListener('resize', resize)
      window.addEventListener('scroll', scroll, { passive: true })
      window.addEventListener('hashchange', scroll)
      window.addEventListener('pointerdown', monitorDown, { passive: true })
      window.addEventListener('pointermove', monitorMove, { passive: true })
      window.addEventListener('pointerup', monitorUp, { passive: true })
      window.addEventListener('pointercancel', leaveMonitor)
      window.addEventListener('blur', blur)
      window.addEventListener('focus', focusWindow)
      document.addEventListener('pointerleave', leaveMonitor)
      document.addEventListener('visibilitychange', visibilityChange)
      canvas.addEventListener('webglcontextlost', lost)
      canvas.addEventListener('webglcontextrestored', restored)
      cleanup = () => {
        preserved.current.reactor = contextLost ? undefined : atmosphere.snapshotFlow()
        worlds.setMediaActive(false, true)
        lightVideo.setActive(false, true)
        forestVideo.setActive(false, true)
        canvas.dataset.videoState = JSON.stringify(worlds.getVideoStatus())
        leaveMonitor()
        wakeRef.current = null
        window.removeEventListener('resize', resize)
        window.removeEventListener('scroll', scroll)
        window.removeEventListener('hashchange', scroll)
        window.removeEventListener('pointerdown', monitorDown)
        window.removeEventListener('pointermove', monitorMove)
        window.removeEventListener('pointerup', monitorUp)
        window.removeEventListener('pointercancel', leaveMonitor)
        window.removeEventListener('blur', blur)
        window.removeEventListener('focus', focusWindow)
        document.removeEventListener('pointerleave', leaveMonitor)
        document.removeEventListener('visibilitychange', visibilityChange)
        canvas.removeEventListener('webglcontextlost', lost)
        canvas.removeEventListener('webglcontextrestored', restored)
      }
      void prepare()
    } catch {
      failScene()
    }

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.clearTimeout(frameTimer)
      releaseResources()
    }
  }, [reducedMotion])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
    />
  )
}
