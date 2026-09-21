import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createAtmosphere } from './Atmosphere'
import { createSceneInteraction } from './SceneInteraction'
import { createSceneWorlds } from './SceneWorlds'

type SceneProps = {
  reducedMotion: boolean
  onReady: () => void
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

/** An original, entirely procedural scene. No downloaded models or textures. */
export default function Scene({ reducedMotion, onReady }: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(onReady)

  useEffect(() => {
    readyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer | undefined
    let frame = 0
    let frameTimer: number | undefined
    let disposed = false
    let contextLost = false
    let ready = false
    let cleanup: (() => void) | undefined
    const effectDisposers: Array<() => void> = []
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const renderTargets = new Set<THREE.WebGLRenderTarget>()
    const markReady = () => {
      if (!ready && !disposed) {
        ready = true
        readyRef.current()
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
      markReady()
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
      const pixelRatio = (width: number) =>
        Math.min(window.devicePixelRatio, softwareRenderer ? 0.75 : width < 768 ? 1.4 : 1.7)
      activeRenderer.setPixelRatio(pixelRatio(window.innerWidth))
      activeRenderer.setSize(window.innerWidth, window.innerHeight)
      activeRenderer.setClearColor(0x020809, 0)
      activeRenderer.outputColorSpace = THREE.SRGBColorSpace
      activeRenderer.toneMapping = THREE.ACESFilmicToneMapping
      activeRenderer.toneMappingExposure = 1.45
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

      scene.add(new THREE.AmbientLight(0x3d7072, 1.2))
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
            normal = normalize(normal + vec3(ridge * 0.26, cos(vInsigniaPosition.y * 7.0) * 0.14, 0.0));
          `,
          )
          .replace(
            '#include <opaque_fragment>',
            `#include <opaque_fragment>
            float sheen = smoothstep(-0.8, 0.9, sin(vInsigniaPosition.y * 7.0 + vInsigniaPosition.x * 3.0));
            gl_FragColor.rgb *= mix(vec3(0.16, 0.35, 0.49), vec3(1.05, 1.16, 0.90), sheen);
          `,
          )
      }
      glyphChrome.customProgramCacheKey = () => 'aether-sculpted-chrome-v1'

      const world = new THREE.Group()
      scene.add(world)
      const emblem = new THREE.Group()
      emblem.position.set(0, 0, 0)
      world.add(emblem)

      const ringSegments = softwareRenderer ? 64 : 144
      const ring = new THREE.Mesh(
        geometry(new THREE.TorusGeometry(0.89, 0.029, softwareRenderer ? 6 : 12, ringSegments)),
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

      // A cut, asymmetric A is our own mark, rather than the reference's logo.
      const letter = new THREE.Shape()
      letter.moveTo(-0.36, -0.32)
      letter.lineTo(-0.06, 0.4)
      letter.lineTo(0.08, 0.45)
      letter.lineTo(0.4, -0.32)
      letter.lineTo(0.22, -0.32)
      letter.lineTo(0.13, -0.09)
      letter.lineTo(-0.14, -0.09)
      letter.lineTo(-0.23, -0.32)
      letter.closePath()
      const counter = new THREE.Path()
      counter.moveTo(-0.09, 0.05)
      counter.lineTo(0.08, 0.05)
      counter.lineTo(0, 0.28)
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
      const tailChrome = material(chrome.clone())
      const tailDark = material(darkChrome.clone())
      for (const surface of [tailChrome, tailDark]) {
        surface.onBeforeCompile = (shader) => {
          shader.uniforms.uTailTime = tailTime
          shader.vertexShader = `uniform float uTailTime;\n${shader.vertexShader}`.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
              float distanceFromRoot = max(0., -position.y);
              float flex = smoothstep(0., 1.2, distanceFromRoot);
              transformed.x += sin(distanceFromRoot * 1.3 - uTailTime * .5) * .18 * flex;
              transformed.z += sin(distanceFromRoot * 1.7 - uTailTime * .4) * .23 * flex;`,
          )
        }
        surface.customProgramCacheKey = () => 'aether-attached-tail-v2'
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
          [(random() - 0.5) * 28, (random() - 0.5) * 21, -4 - random() * 17],
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
      scene.add(new THREE.Points(distantGeometry, particlesMaterial))

      // Tiny translucent bell creatures lend scale to the surrounding space.
      const creatures: { group: THREE.Group; anchor: THREE.Vector3; phase: number }[] = []
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
        creatureIndex < (softwareRenderer ? 1 : smallScreen ? 2 : 4);
        creatureIndex += 1
      ) {
        const group = new THREE.Group()
        const bell = new THREE.Mesh(
          geometry(new THREE.SphereGeometry(0.23, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
          bellMaterial,
        )
        bell.scale.y = 0.5
        group.add(bell)
        const lip = new THREE.Mesh(geometry(new THREE.TorusGeometry(0.23, 0.006, 5, 40)), chrome)
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
        const anchor = new THREE.Vector3(...(anchors[creatureIndex] as [number, number, number]))
        group.position.copy(anchor)
        const scale = creatureIndex === 0 ? 1 : 0.6 + random() * 0.5
        group.scale.setScalar(scale)
        scene.add(group)
        creatures.push({ group, anchor, phase: random() * Math.PI * 2 })
      }

      const atmosphere = createAtmosphere(scene, softwareRenderer, smallScreen)
      effectDisposers.push(() => atmosphere.dispose())
      const worlds = createSceneWorlds(scene, softwareRenderer)
      effectDisposers.push(() => worlds.dispose())
      const interaction = createSceneInteraction(
        scene,
        camera,
        canvas,
        reducedMotion,
        softwareRenderer,
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
      // Position, size and orientation are authored as one connected camera journey.
      const poses = [
        [0, 0, 0, 1.15, 0, 0, 0, 10.8],
        [0.8, 0.1, 0, 2.65, 0.1, -0.55, -0.08, 10.8],
        [0, 3, -4, 0.001, 0.2, 1.2, 0.25, 11.8],
        [0, 3, -4, 0.001, 0.2, 1.2, 0.25, 11.8],
        [0, 4, -5, 0.001, 0.1, 2, 1.6, 8.9],
        [0, 0, 0, 0.95, 0.08, 0.45, Math.PI, 10.8],
      ]
      const stops = [0, 0.15, 0.25, 0.5, 0.75, 1]
      const pointer = new THREE.Vector2()
      let targetProgress = readProgress()
      let progress = targetProgress
      let elapsed = 0
      let previousTime = 0

      const render = (timestamp: number) => {
        frame = 0
        if (disposed || contextLost || document.hidden) return
        const wallDelta = previousTime ? (timestamp - previousTime) / 1000 : 0.016
        const delta = Math.min(wallDelta, 0.05)
        previousTime = timestamp
        if (!reducedMotion) elapsed += delta
        progress = reducedMotion
          ? targetProgress
          : THREE.MathUtils.damp(progress, targetProgress, 7, Math.min(wallDelta, 0.4))
        const scroll = THREE.MathUtils.clamp(progress, 0, 1)
        particlesMaterial.uniforms.uTime.value = elapsed
        tailTime.value = elapsed
        atmosphere.update(elapsed, scroll)
        worlds.update(elapsed, scroll)
        const input = interaction.update(delta || 0.016, elapsed, activeRenderer.getPixelRatio())
        const index = Math.min(4, Math.max(0, stops.findIndex((stop) => stop > scroll) - 1))
        const keyIndex = scroll >= 1 ? 4 : index
        const blend = THREE.MathUtils.smoothstep(
          (scroll - stops[keyIndex]) / (stops[keyIndex + 1] - stops[keyIndex]),
          0,
          1,
        )
        const pose = poses[keyIndex].map((n, i) =>
          THREE.MathUtils.lerp(n, poses[keyIndex + 1][i], blend),
        )
        world.rotation.set(0, 0, 0)
        world.position.set(0, 0, 0)
        emblem.position.set(pose[0], pose[1] + Math.sin(elapsed * 0.4) * 0.035, pose[2])
        emblem.scale.setScalar(pose[3])
        emblem.rotation.set(
          pose[4] - pointer.y * 0.055,
          pose[5] + Math.sin(elapsed * 0.18) * 0.1 + pointer.x * 0.12,
          pose[6],
        )
        const orbitRadius = pose[7] + (innerWidth < 768 ? 4.5 : 0) - input.zoom * 1.7
        camera.position.set(
          Math.sin(input.yaw) * orbitRadius + pointer.x * 0.22,
          Math.sin(input.pitch) * orbitRadius + pointer.y * 0.15,
          Math.cos(input.yaw) * orbitRadius,
        )
        rimLight.intensity = 25 + input.burst * 25
        particlesMaterial.uniforms.uOpacity.value = 0.5
        for (const creature of creatures) {
          creature.group.position.y =
            creature.anchor.y + Math.sin(elapsed * 0.24 + creature.phase) * 0.28
          creature.group.position.x =
            creature.anchor.x + Math.sin(elapsed * 0.1 + creature.phase) * 0.18
          creature.group.rotation.z = Math.sin(elapsed * 0.17 + creature.phase) * 0.13
        }
        camera.lookAt(0, 0, 0)

        try {
          activeRenderer.render(scene, camera)
          if (canvas.dataset.renderState !== 'ready') {
            canvas.dataset.renderState = 'ready'
            canvas.style.opacity = '1'
          }
          markReady()
        } catch {
          failScene()
        }
        if (!reducedMotion && !contextLost) {
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
        if (!frame && frameTimer === undefined && !disposed && !contextLost && !document.hidden)
          frame = requestAnimationFrame(render)
      }
      const resize = () => {
        const width = window.innerWidth
        const height = window.innerHeight
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        activeRenderer.setPixelRatio(pixelRatio(width))
        activeRenderer.setSize(width, height)
        particlesMaterial.uniforms.uPixelRatio.value = activeRenderer.getPixelRatio()
        targetProgress = readProgress()
        requestRender()
      }
      const pointerMove = (event: PointerEvent) => {
        if (
          reducedMotion ||
          event.pointerType === 'touch' ||
          (location.hash && location.hash !== '#home')
        )
          return
        pointer.set(
          (event.clientX / window.innerWidth) * 2 - 1,
          -(event.clientY / window.innerHeight) * 2 + 1,
        )
      }
      const pointerLeave = () => pointer.set(0, 0)
      const scroll = () => {
        targetProgress = readProgress()
        requestRender()
      }
      const visibilityChange = () => {
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
        canvas.dataset.renderState = 'lost'
        cancelAnimationFrame(frame)
        window.clearTimeout(frameTimer)
        frameTimer = undefined
        frame = 0
        canvas.style.opacity = '0'
        markReady()
      }
      const restored = () => {
        if (disposed) return
        try {
          refreshEnvironment()
          contextLost = false
          previousTime = 0
          resize()
          requestRender()
        } catch {
          failScene()
        }
      }
      window.addEventListener('resize', resize)
      window.addEventListener('scroll', scroll, { passive: true })
      window.addEventListener('hashchange', scroll)
      window.addEventListener('pointermove', pointerMove, { passive: true })
      document.addEventListener('pointerleave', pointerLeave)
      document.addEventListener('visibilitychange', visibilityChange)
      canvas.addEventListener('webglcontextlost', lost)
      canvas.addEventListener('webglcontextrestored', restored)
      cleanup = () => {
        window.removeEventListener('resize', resize)
        window.removeEventListener('scroll', scroll)
        window.removeEventListener('hashchange', scroll)
        window.removeEventListener('pointermove', pointerMove)
        document.removeEventListener('pointerleave', pointerLeave)
        document.removeEventListener('visibilitychange', visibilityChange)
        canvas.removeEventListener('webglcontextlost', lost)
        canvas.removeEventListener('webglcontextrestored', restored)
      }
      requestRender()
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
