import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { bindGroupCurtain, createCurtainBounds } from './SceneCurtains'
import { sampleLayers } from './SceneLayers'

const TAU = Math.PI * 2
const RADIUS = .23
const smooth = (value: number) => {
  const x = THREE.MathUtils.clamp(value, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Absolute scene time preserves poses across pauses and context restoration. */
export function sampleJellyStroke(time: number, phase: number, period: number) {
  const cycle = time / period + phase
  const fraction = cycle - Math.floor(cycle)
  const contraction = fraction < .24
    ? smooth(fraction / .24)
    : 1 - smooth((fraction - .24) / .76)
  return { contraction, surge: smooth(fraction / .38) - fraction }
}

function surface(rows: number, columns: number, copies = 1) {
  const geometry = new THREE.BufferGeometry()
  const position = new THREE.Float32BufferAttribute(new Float32Array(copies * (rows + 1) * (columns + 1) * 3), 3)
  position.setUsage(THREE.DynamicDrawUsage)
  const uv = new Float32Array(position.count * 2)
  const indices: number[] = []
  for (let copy = 0; copy < copies; copy++) {
    const base = copy * (rows + 1) * (columns + 1)
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const vertex = base + row * (columns + 1) + col
      uv[vertex * 2] = col / columns
      uv[vertex * 2 + 1] = row / rows
      if (row < rows && col < columns) {
        const next = vertex + columns + 1
        indices.push(vertex, next, vertex + 1, next, next + 1, vertex + 1)
      }
    }
  }
  geometry.setAttribute('position', position)
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -.4, 0), 1.1)
  return geometry
}

/** Original procedural anatomy; no external model or texture dependency. */
export function createSceneJellyfish(
  scene: THREE.Scene, software: boolean, mobile: boolean,
) {
  const group = new THREE.Group()
  group.name = 'aether-forest-creatures'
  scene.add(group)
  const curtain = createCurtainBounds()
  const bellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xabcac2, metalness: 0, roughness: .24,
    transparent: true, opacity: .55, side: THREE.DoubleSide,
    depthWrite: false, envMapIntensity: 1.25, clearcoat: .7,
    clearcoatRoughness: .16, iridescence: software ? 0 : .35,
    iridescenceIOR: 1.25, emissive: 0x132d2c, emissiveIntensity: .35,
  })
  // Fresnel opacity and radial canals need no extra scene capture pass.
  bellMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vJellyUv;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvJellyUv = uv;')
    shader.fragmentShader = 'varying vec2 vJellyUv;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      float facing = pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.);
      float canal = pow(.5 + .5 * cos(vJellyUv.x * 75.3982 + sin(vJellyUv.y * 13.) * .3), 24.);
      float branches = pow(.5 + .5 * cos(vJellyUv.x * 150.7964 + sin(vJellyUv.y * 24.) * .8), 32.);
      float edge = smoothstep(.76, 1., vJellyUv.y);
      float tissue = canal * .65 + branches * edge * .35;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.71, .85, .74), tissue * .5);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.57, .75, .81), facing * .35);
      diffuseColor.a *= .32 + facing * .85 + tissue * .48 + edge * .15;
    `)
  }
  bellMaterial.customProgramCacheKey = () => 'aether-jelly-anatomy-v2'
  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xa2d5c2, metalness: 0, roughness: .31, transparent: true,
    opacity: .46, side: THREE.DoubleSide, depthWrite: false,
    emissive: 0x234439, emissiveIntensity: .22,
  })
  const armMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xacc4ad, metalness: 0, roughness: .4, transparent: true,
    opacity: .48, side: THREE.DoubleSide, depthWrite: false,
    emissive: 0x18332f, emissiveIntensity: .3,
  })
  const organMaterial = new THREE.MeshStandardMaterial({
    color: 0xcba2a0, roughness: .38, transparent: true, opacity: .48,
    depthWrite: false, emissive: 0x442229, emissiveIntensity: .25,
  })
  const organParts = Array.from({ length: 4 }, (_, index) => {
    const geometry = new THREE.TorusGeometry(.038, .008, 5, 20, TAU * .88)
    geometry.rotateX(1.0)
    geometry.rotateY(index * Math.PI / 2)
    geometry.translate(Math.cos(index * Math.PI / 2) * .057, .065, Math.sin(index * Math.PI / 2) * .057)
    return geometry
  })
  const organGeometry = mergeGeometries(organParts)!
  organParts.forEach(part => part.dispose())
  const anchors = [[3.2, 1.3, -3], [-3.5, -2, -2], [5.5, -3.8, -5], [-4.4, 3.1, -8]]
  const perForest = software ? 1 : mobile ? 2 : 4
  const radialSegments = software ? 32 : mobile ? 48 : 64
  const bellRows = software ? 10 : 16
  const segments = software ? 18 : 28
  const threadCount = software ? 4 : mobile ? 8 : 12
  const armCount = software ? 2 : 4
  const creatures = Array.from({ length: perForest * 2 }, (_, index) => {
    const root = new THREE.Group()
    root.name = `aether-bell-creature-${index}`
    // Lower forests keep the original full anchor sequence on every profile.
    const anchor = new THREE.Vector3(...anchors[index % anchors.length])
    if (index >= perForest) anchor.y -= 61.5
    root.scale.setScalar(index % perForest === 0 ? 1 : .7 + (index * .137) % .4)
    const bell = new THREE.Mesh(surface(bellRows, radialSegments), bellMaterial)
    bell.name = 'bell'
    const rim = new THREE.Mesh(surface(3, radialSegments), rimMaterial)
    rim.name = 'rim'
    const organs = new THREE.Mesh(organGeometry, organMaterial)
    organs.name = 'internal-organs'
    const threads = new THREE.Mesh(surface(segments, 4, threadCount), armMaterial)
    threads.name = 'tentacles'
    const arms = new THREE.Mesh(surface(segments, 4, armCount), armMaterial)
    arms.name = 'oral-arms'
    root.add(organs, arms, threads, bell, rim)
    group.add(root)
    return { root, anchor, bell, rim, organs, threads, arms, phase: (index * .381966) % 1, period: 2.7 + (index % 4) * .23 }
  })
  bindGroupCurtain(group, curtain)
  let disposed = false
  let lastTime = -1, lastProgress = -1

  function update(time: number, progress: number) {
    if (disposed) return
    const t = Number.isFinite(time) ? Math.max(0, time) : 0
    const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0
    if (t === lastTime && p === lastProgress) return
    lastTime = t
    lastProgress = p
    const layers = sampleLayers(p)
    curtain.upper.value = p < .5 ? 1.5 : layers.forestEntry
    curtain.lower.value = p < .5 ? layers.forestExit : -.5
    group.visible = p < .20 || p > .855
    for (const [index, creature] of creatures.entries()) {
      const { root, anchor, phase, period, bell, rim, organs, threads, arms } = creature
      root.visible = (index < perForest) === (p < .5)
      if (!group.visible || !root.visible) continue
      const { contraction, surge } = sampleJellyStroke(t, phase, period)
      const drift = t * .13 + phase * TAU
      const tiltX = Math.sin(drift * .83) * .16
      const tiltZ = Math.cos(drift) * .22
      root.position.set(
        anchor.x + Math.sin(drift) * .55 - Math.sin(tiltZ) * surge * .3,
        anchor.y + Math.sin(drift * .71) * .48 + surge * .38,
        anchor.z + Math.cos(drift * .83) * .38 + Math.sin(tiltX) * surge * .3,
      )
      root.rotation.set(tiltX, Math.sin(drift * .6) * .22, tiltZ)
      const rimRadius = 1 - contraction * .30
      const rimY = -.016 * contraction
      const bellPositions = bell.geometry.attributes.position as THREE.BufferAttribute
      for (let row = 0; row <= bellRows; row++) {
        const v = row / bellRows
        const height = Math.cos(v * Math.PI / 2)
        const skirt = 1 - height
        for (let col = 0; col <= radialSegments; col++) {
          const angle = col / radialSegments * TAU
          const scallop = 1 + .045 * Math.cos(angle * 12) * Math.pow(skirt, 5)
          const radius = RADIUS * Math.sin(v * Math.PI / 2) * (1 - contraction * (.12 + .18 * skirt * skirt)) * scallop
          const y = RADIUS * height * (.69 + contraction * .30) + rimY + .008 * Math.cos(angle * 12) * Math.pow(skirt, 6)
          bellPositions.setXYZ(row * (radialSegments + 1) + col, Math.cos(angle) * radius, y, Math.sin(angle) * radius)
        }
      }
      const rimPositions = rim.geometry.attributes.position as THREE.BufferAttribute
      for (let row = 0; row <= 3; row++) for (let col = 0; col <= radialSegments; col++) {
        const angle = col / radialSegments * TAU
        const depth = row / 3
        const radius = RADIUS * rimRadius * (1 + .045 * Math.cos(angle * 12)) + depth * .012 * (1 - contraction * .6)
        const y = rimY + .008 * Math.cos(angle * 12) - depth * .024 + Math.sin(angle * 24) * .007 * depth
        rimPositions.setXYZ(row * (radialSegments + 1) + col, Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      }
      organs.scale.set(rimRadius, 1 + contraction * .15, rimRadius)
      organs.position.y = rimY
      for (const [mesh, count, oral] of [[threads, threadCount, false], [arms, armCount, true]] as const) {
        const positions = mesh.geometry.attributes.position as THREE.BufferAttribute
        for (let strand = 0; strand < count; strand++) {
          const theta = strand / count * TAU + (oral ? .4 : 0)
          const length = oral ? .46 + strand * .035 : .75 + .25 * (.5 + .5 * Math.sin(strand * 2.4 + index))
          for (let row = 0; row <= segments; row++) {
            const depth = row / segments
            const delayed = sampleJellyStroke(t - depth * .55, phase, period).contraction
            const wave = (t / period + phase) * TAU - depth * 4.8 + theta
            const envelope = depth * depth
            const baseRadius = oral ? .047 : RADIUS * (1 + .045 * Math.cos(theta * 12))
            const spread = baseRadius * rimRadius + depth * .035 * (1 - delayed)
            const x = Math.cos(theta) * spread + envelope * (Math.sin(wave) * .075 - Math.cos(drift) * .13)
            const y = rimY + (oral ? .035 : .008 * Math.cos(theta * 12)) - depth * length * (1 + delayed * .10) + Math.sin(wave) * .022 * envelope
            const z = Math.sin(theta) * spread + envelope * (Math.cos(wave * .91 + theta) * .07 + Math.sin(drift * .83) * .1)
            for (let col = 0; col <= 4; col++) {
              const cross = col / 4
              const width = oral ? .044 * Math.pow(1 - depth, .65) * (.75 + .25 * Math.sin(depth * 27 - wave)) : .0032 * (1 - depth * .88)
              const lateral = oral ? (cross * 2 - 1) * width : Math.cos(cross * TAU) * width
              const fold = oral ? Math.sin(cross * TAU + depth * 24 - wave) * width * .42 : Math.sin(cross * TAU) * width
              const vertex = (strand * (segments + 1) + row) * 5 + col
              positions.setXYZ(vertex, x + Math.cos(theta) * lateral - Math.sin(theta) * (oral ? 0 : fold), y + (oral ? fold : 0), z + Math.sin(theta) * lateral + Math.cos(theta) * (oral ? 0 : fold))
            }
          }
        }
      }
      for (const mesh of [bell, rim, threads, arms]) {
        mesh.geometry.attributes.position.needsUpdate = true
        mesh.geometry.computeVertexNormals()
      }
    }
  }
  // Prime both forests before shader preparation uploads hidden geometry.
  // Missing normals would otherwise warm a flat-shaded variant and compile
  // a different program on the lower forest's first visible frame.
  update(0, 1)
  update(0, 0)
  return {
    group, curtain, update,
    dispose() {
      if (disposed) return
      disposed = true
      const geometries = new Set<THREE.BufferGeometry>()
      group.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry) })
      geometries.forEach(geometry => geometry.dispose())
      for (const material of [bellMaterial, rimMaterial, armMaterial, organMaterial]) material.dispose()
      group.removeFromParent()
      group.clear()
    },
  }
}
