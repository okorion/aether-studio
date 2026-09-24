import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createAtmosphere } from './Atmosphere'
import { createSceneInteraction } from './SceneInteraction'
import { createSceneWorlds } from './SceneWorlds'
import { sampleJourney, smooth } from './Journey'
import { createSceneGlow } from './SceneGlow'
import { createSceneForest } from './SceneForest'
import { createSceneLayers, sampleLayers, sampleEmblemCurtain } from './SceneLayers'
import { bindCurtain, bindGroupCurtain, createCurtainBounds } from './SceneCurtains'
import { createSceneVideo } from './SceneVideo'
import { prepareSceneShaders } from './ScenePreparation'
import type { LoadingStage } from './loading'
import { createSceneLightVideo } from './SceneLightVideo'
import { createLightFilmUniforms, sampleLightChoreography } from './SceneLighting'
import { createSceneLightShafts } from './SceneLightShafts'

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
  // Motion preference changes rebuild the render budget, preserving the view
  // and time so pausing cannot snap a user's chosen angle back to the front.
  const preserved = useRef({ yaw: 0, pitch: 0, elapsed: 0, scaleElapsed: 0 })

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
      const luminous = material(
        new THREE.MeshBasicMaterial({
          color: 0x9bfff0,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      const glyphChrome = material(chrome.clone())
      glyphChrome.color.set(0xb9e4d3)
      glyphChrome.roughness = 0.25
      glyphChrome.metalness = softwareRenderer ? 0.25 : 0.87
      glyphChrome.emissive.set(0x163b35)
      glyphChrome.emissiveIntensity = 0.18
      glyphChrome.envMapIntensity = 2.4
      glyphChrome.transparent = true
      // Very shallow sculpted normals make the otherwise planar letter catch
      // different parts of the environment like a pressed-metal insignia.
      glyphChrome.onBeforeCompile = (shader) => {
        shader.vertexShader = `varying vec3 vInsigniaPosition;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvInsigniaPosition = position;',
        )
        shader.fragmentShader = `varying vec3 vInsigniaPosition;\n${shader.fragmentShader}`
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            float ridge = sin(vInsigniaPosition.y * 5.0 + vInsigniaPosition.x * 7.0);
            normal = normalize(normal + vec3(ridge * 0.055, cos(vInsigniaPosition.y * 7.0) * 0.025, 0.0));
          `,
          )
          .replace(
            '#include <opaque_fragment>',
            `#include <opaque_fragment>
            float sheen = smoothstep(-0.8, 0.9, sin(vInsigniaPosition.y * 7.0 + vInsigniaPosition.x * 3.0));
            gl_FragColor.rgb *= mix(vec3(0.43, 0.65, 0.67), vec3(1.02, 1.12, 0.95), sheen);
          `,
          )
      }
      glyphChrome.customProgramCacheKey = () => 'aether-sculpted-o-v2'

      const world = new THREE.Group()
      scene.add(world)
      const emblem = new THREE.Group()
      emblem.position.set(0, 0, 0)
      world.add(emblem)

      const ringSegments = softwareRenderer ? 64 : 144
      const ring = new THREE.Mesh(
        geometry(new THREE.TorusGeometry(0.89, 0.052, softwareRenderer ? 6 : 12, ringSegments)),
        chrome,
      )
      const ringInner = new THREE.Mesh(
        geometry(new THREE.TorusGeometry(0.84, 0.009, softwareRenderer ? 4 : 8, ringSegments)),
        darkChrome,
      )
      ringInner.position.z = -0.035
      const ringGlow = new THREE.Mesh(
        geometry(new THREE.TorusGeometry(0.89, 0.006, softwareRenderer ? 4 : 6, ringSegments)),
        luminous,
      )
      ringGlow.position.z = 0.026
      emblem.add(ring, ringInner, ringGlow)

      // A tall, high-contrast capital O: thick vertical strokes and a generous
      // counter distinguish the letter from the thin circular outer halo.
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
      const glyph = new THREE.Mesh(
        geometry(
          new THREE.ExtrudeGeometry(letter, {
            depth: 0.055,
            bevelEnabled: true,
            bevelSegments: 3,
            steps: 1,
            bevelSize: 0.014,
            bevelThickness: 0.013,
            curveSegments: softwareRenderer ? 16 : 32,
          }),
        ),
        glyphChrome,
      )
      glyph.position.z = 0.03
      emblem.add(glyph)

      const ribbons = new THREE.Group()
      // The ring and both tails are a single organism. Local attachment points
      // must inherit the emblem's pointer tilt, bobbing and scroll transform.
      emblem.add(ribbons)
      const tailTime = { value: 0 }
      const tailLift = { value: 0 }
      const tailChrome = material(chrome.clone())
      const tailDark = material(darkChrome.clone())
      for (const surface of [tailChrome, tailDark]) {
        surface.onBeforeCompile = (shader) => {
          shader.uniforms.uTailTime = tailTime
          shader.uniforms.uTailLift = tailLift
          shader.vertexShader = `uniform float uTailTime; uniform float uTailLift;\n${shader.vertexShader}`.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
              float distanceFromRoot = max(0., -position.y);
              float flex = smoothstep(0., 1.2, distanceFromRoot);
              transformed.x += sin(distanceFromRoot * 1.3 - uTailTime * .5) * .18 * flex;
              transformed.z += sin(distanceFromRoot * 1.7 - uTailTime * .4) * .23 * flex;
              transformed.y = mix(position.y, -position.y * 1.35, uTailLift);
              transformed.z += sin(distanceFromRoot * .38) * uTailLift * .7;`,
          )
        }
        surface.customProgramCacheKey = () => 'aether-descending-tail-v4'
      }
      for (let strand = 0; strand < 2; strand += 1) {
        const points: THREE.Vector3[] = []
        for (let i = 0; i <= 100; i += 1) {
          const t = i / 100
          const theta = t * 5.5 + strand * Math.PI
          const spread = 0.89 + Math.pow(t, 2) * 0.55
          points.push(new THREE.Vector3(Math.cos(theta) * spread, -t * 7.3, Math.sin(theta) * 0.5))
        }
        const path = new THREE.CatmullRomCurve3(points)
        ribbons.add(
          new THREE.Mesh(
            geometry(
              new THREE.TubeGeometry(
                path,
                softwareRenderer ? 64 : 180,
                0.015,
                softwareRenderer ? 4 : 6,
                false,
              ),
            ),
            tailChrome,
          ),
        )
        const edgePath = new THREE.CatmullRomCurve3(
          points.map((p) => p.clone().add(new THREE.Vector3(0.025, 0, -0.017))),
        )
        ribbons.add(
          new THREE.Mesh(
            geometry(
              new THREE.TubeGeometry(
                edgePath,
                softwareRenderer ? 64 : 180,
                0.007,
                softwareRenderer ? 3 : 5,
                false,
              ),
            ),
            tailDark,
          ),
        )
      }

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
            uTime: { value: 0 },
            uPixelRatio: { value: activeRenderer.getPixelRatio() },
            uMotion: { value: reducedMotion ? 0 : 1 },
            uOpacity: { value: 0.87 },
          },
          vertexShader: particleVertex,
          fragmentShader: particleFragment,
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

      // Tiny translucent bell creatures lend scale to the surrounding space.
      const creatures: { group: THREE.Group; anchor: THREE.Vector3; phase: number }[] = []
      const creatureRoot = new THREE.Group()
      creatureRoot.name = 'aether-forest-creatures'
      scene.add(creatureRoot)
      const creatureCurtain = createCurtainBounds()
      const creatureLipMaterial = material(chrome.clone())
      const bellMaterial = material(
        new THREE.MeshPhysicalMaterial({
          color: 0x6b9b9e,
          metalness: 0.65,
          roughness: 0.18,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          depthWrite: false,
          envMapIntensity: 1.7,
        }),
      )
      if (softwareRenderer) {
        bellMaterial.metalness = 0.1
        bellMaterial.roughness = 0.6
        bellMaterial.emissive.set(0x152927)
      }
      const threadMaterial = material(
        new THREE.LineBasicMaterial({
          color: 0x58968c,
          transparent: true,
          opacity: 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      for (
        let creatureIndex = 0;
        creatureIndex < (softwareRenderer ? 2 : smallScreen ? 4 : 8);
        creatureIndex += 1
      ) {
        const group = new THREE.Group()
        const bell = new THREE.Mesh(
          geometry(new THREE.SphereGeometry(0.23, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
          bellMaterial,
        )
        bell.scale.y = 0.5
        group.add(bell)
        const lip = new THREE.Mesh(geometry(new THREE.TorusGeometry(0.23, 0.006, 5, 40)), creatureLipMaterial)
        lip.rotation.x = Math.PI * 0.5
        group.add(lip)
        const strandCount = softwareRenderer ? 4 : 8
        for (let strand = 0; strand < strandCount; strand += 1) {
          const theta = (strand / strandCount) * Math.PI * 2
          const points: THREE.Vector3[] = []
          for (let p = 0; p <= 20; p += 1) {
            const t = p / 20
            points.push(
              new THREE.Vector3(
                Math.cos(theta) * 0.16 + Math.sin(t * 7 + theta) * 0.04 * t,
                -t * (0.7 + random() * 0.2),
                Math.sin(theta) * 0.16 + Math.cos(t * 5 + theta) * 0.06 * t,
              ),
            )
          }
          group.add(
            new THREE.Line(
              geometry(new THREE.BufferGeometry().setFromPoints(points)),
              threadMaterial,
            ),
          )
        }
        const anchors = [
          [3.2, 1.3, -3],
          [-3.5, -2, -2],
          [5.5, -3.8, -5],
          [-4.4, 3.1, -8],
        ]
        const anchor = new THREE.Vector3(...(anchors[creatureIndex % 4] as [number, number, number]))
        const perForest = softwareRenderer ? 1 : smallScreen ? 2 : 4
        anchor.y -= creatureIndex >= perForest ? 61.5 : 0
        group.position.copy(anchor)
        const scale = creatureIndex === 0 ? 1 : 0.6 + random() * 0.5
        group.scale.setScalar(scale)
        creatureRoot.add(group)
        creatures.push({ group, anchor, phase: random() * Math.PI * 2 })
      }
      // Bell, rim and every tentacle share one boundary. Dedicated lip material
      // prevents this curtain from leaking onto the other chrome objects.
      bindGroupCurtain(creatureRoot, creatureCurtain)

      const lightVideo = lightVideoRef.current ??= createSceneLightVideo()
      const lightFilm = createLightFilmUniforms(lightVideo.texture)
      const lightShafts = createSceneLightShafts(scene, softwareRenderer, smallScreen, lightFilm)
      effectDisposers.push(() => lightShafts.dispose())
      const atmosphere = createAtmosphere(scene, softwareRenderer, smallScreen, lightFilm)
      effectDisposers.push(() => atmosphere.dispose())
      const video = videoRef.current ??= createSceneVideo()
      const worlds = createSceneWorlds(scene, softwareRenderer, smallScreen, video, lightFilm)
      effectDisposers.push(() => worlds.dispose())
      const forest = createSceneForest(scene, softwareRenderer, smallScreen, lightFilm)
      effectDisposers.push(() => forest.dispose())
      const layers = createSceneLayers(scene)
      effectDisposers.push(() => layers.dispose())
      const glow = softwareRenderer || smallScreen ? undefined : createSceneGlow(activeRenderer, scene, camera)
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
        return THREE.MathUtils.clamp(
          window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight),
          0,
          1,
        )
      }
      // The ring travels down the same shaft as the camera. The architecture
      // and distant life remain in world space, providing vertical parallax.
      const ringSurface = material(chrome.clone())
      const innerSurface = material(darkChrome.clone())
      for (const surface of [ringSurface, innerSurface, tailChrome, tailDark]) surface.transparent = true
      ring.material = ringSurface
      ringInner.material = innerSurface
      // Both transitions share the visible scene's edge: the emblem belongs
      // above incoming monitors and below the returning forest canopy.
      const emblemCurtain = createCurtainBounds()
      bindGroupCurtain(emblem, emblemCurtain)
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
        lightVideo.setActive(enabled && !softwareRenderer && !preparing &&
          (targetProgress < .235 || targetProgress > .60), reducedMotion)
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
        tailTime.value = elapsed
        // Set the hidden ribbon pose before the lower forest reveals it.
        tailLift.value = scroll > .5 ? 1 : 0
        interaction.setOrbitEnabled(state.orbitEnabled)
        interaction.setFocus(centre)
        const input = interaction.update(delta || 0.016, elapsed, activeRenderer.getPixelRatio(), scroll)
        preserved.current.yaw = input.yaw
        preserved.current.pitch = input.pitch
        preserved.current.elapsed = elapsed
        preserved.current.scaleElapsed = scaleElapsed
        const fold = smooth(.205, .295, scroll) * (1 - state.end)
        // The original organism unfolds into the spine. Keep its free tails
        // from crossing the project screens after that transformation settles.
        const emblemOpacity = (1 - smooth(.305, .32, scroll)) + smooth(.88, .955, scroll)
        const emblemBounds = sampleEmblemCurtain(scroll)
        emblemCurtain.upper.value = emblemBounds.upper
        emblemCurtain.lower.value = emblemBounds.lower
        emblem.visible = emblemOpacity > .001
        ringSurface.opacity = innerSurface.opacity = tailChrome.opacity = tailDark.opacity = emblemOpacity
        luminous.opacity = .26 * emblemOpacity
        world.rotation.set(0, 0, 0)
        world.position.copy(centre)
        emblem.position.set(0, 0, 0)
        const statementScale = smooth(.10, .18, scroll) * (1 - smooth(.25, .31, scroll))
        particles.visible = distantParticles.visible = scroll < .20 || scroll > .855
        emblem.scale.setScalar(1.15 + statementScale * .48)
        emblem.rotation.set(0, smooth(.21, .30, scroll) * .7 * (1 - state.end), 0)
        ribbons.rotation.x = 0
        const tailPresence = scroll < .5 ? 1 - smooth(.10, .18, scroll) : 1
        ribbons.visible = tailPresence > .001
        tailChrome.opacity = tailDark.opacity = emblemOpacity * tailPresence
        glyph.scale.setScalar(1)
        glyphChrome.opacity = emblemOpacity
        glyph.visible = glyphChrome.opacity > .005
        ringSurface.roughness = .12 + fold * .1
        const mobileView = innerWidth < 768
        const orbitRadius = state.radius + (mobileView ? 4.8 : 0)
        const azimuth = state.azimuth + (input.yaw + input.field.ndc.x * .012 * input.field.strength) * state.orbitWeight
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
        const creatureLayers = sampleLayers(scroll)
        creatureCurtain.upper.value = scroll < .5 ? 1.5 : creatureLayers.forestEntry
        creatureCurtain.lower.value = scroll < .5 ? creatureLayers.forestExit : -.5
        ambientCurtain.upper.value = creatureCurtain.upper.value
        ambientCurtain.lower.value = creatureCurtain.lower.value
        creatureRoot.visible = scroll < .20 || scroll > .855
        for (const creature of creatures) {
          creature.group.position.y =
            creature.anchor.y + Math.sin(elapsed * 0.24 + creature.phase) * 0.28
          creature.group.position.x =
            creature.anchor.x + Math.sin(elapsed * 0.1 + creature.phase) * 0.18
          creature.group.rotation.z = Math.sin(elapsed * 0.17 + creature.phase) * 0.13
        }
        camera.lookAt(centre)
        camera.updateMatrixWorld()
        lightFilm.map.value = lightVideo.texture
        lightFilm.ready.value = lightVideo.getReady() ? 1 : 0
        canvas.dataset.lightVideoState = JSON.stringify(lightVideo.getStatus())
        // Projection-based surface interaction must use this frame's camera.
        worlds.update(elapsed, scroll, input.field, camera, scaleElapsed, mobileView)
        canvas.dataset.scaleTime = scaleElapsed.toFixed(4)
        const monitorHover = sceneAvailable() && input.field.active ? worlds.getHoveredPanel() : -1
        canvas.dataset.monitorHover = String(monitorHover)
        document.documentElement.classList.toggle('scene-monitor-hover', monitorHover >= 0)
        canvas.dataset.videoState = JSON.stringify(worlds.getVideoStatus())
        atmosphere.update(elapsed, scroll, activeRenderer.getPixelRatio(), input.field, camera)
        lightShafts.update(elapsed, scroll, camera)
        forest.update(elapsed, scroll, camera, input.field, activeRenderer.getPixelRatio())
        layers.update(scroll, camera)

        try {
          activeRenderer.info.reset()
          // All glass screens share one bounded background capture. Refresh it
          // at half the display cadence; paused/reduced-motion frames stay exact.
          worlds.capture(activeRenderer, camera, renderedFrames % 2 === 0 || reducedMotion)
          if (glow && quality > .65 && innerWidth >= 768) glow.render(state.energy)
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
          report('resources')
          // Exercise the film sampling branch with the black placeholder too.
          // No media request is needed to prime an otherwise dormant GPU path.
          lightFilm.ready.value = 1
          try {
            await prepareSceneShaders(activeRenderer, scene, camera, cancelled, stage => {
              if (!cancelled()) report(stage)
            })
          } finally {
            lightFilm.ready.value = lightVideo.getReady() ? 1 : 0
          }
          if (cancelled()) return
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
        worlds.setMediaActive(false, true)
        lightVideo.setActive(false, true)
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
