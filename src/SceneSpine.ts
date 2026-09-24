import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { sampleLayers } from './SceneLayers'
import { getChainLinkCount, CHAIN_LINK_PITCH, createChainGeometry, createChainMaterial, sampleChainPath } from './SceneChain'

const HEIGHT = 10.8
const clamp = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }

/** Only the column surface changes exposure; the chain keeps its own lighting. */
export function sampleSpineExposure(progress: number) {
  const p = clamp(progress)
  return .22 + .78 * ease((p - .275) / .11) * ease((.665 - p) / .11)
}

/** Tapered, flattened processes share one surface with the vertebral body. */
function processGeometry(points: THREE.Vector3[], segments: number, radial: number,
  radius: number, flatten = 1) {
  const curve = new THREE.CatmullRomCurve3(points)
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, false)
  const positions = geometry.getAttribute('position')
  const centre = new THREE.Vector3()
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    curve.getPointAt(t, centre)
    // Broad roots, a small knuckle, and a closed tip avoid a tube-like silhouette.
    const width = radius * (.98 - t * .66 + Math.sin(t * Math.PI) * .10)
      * (1 - ease((t - .84) / .16))
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      positions.setXYZ(k,
        centre.x + (positions.getX(k) - centre.x) * width,
        centre.y + (positions.getY(k) - centre.y) * width * flatten,
        centre.z + (positions.getZ(k) - centre.z) * width)
    }
  }
  geometry.computeVertexNormals()
  return geometry
}

function vertebraGeometry(software: boolean) {
  const radial = software ? 14 : 24
  const body = new THREE.LatheGeometry([
    new THREE.Vector2(0, -.43), new THREE.Vector2(.32, -.40),
    new THREE.Vector2(.52, -.34), new THREE.Vector2(.61, -.22),
    new THREE.Vector2(.57, -.06), new THREE.Vector2(.56, .12),
    new THREE.Vector2(.64, .25), new THREE.Vector2(.57, .35),
    new THREE.Vector2(.35, .41), new THREE.Vector2(0, .44),
  ], radial)
  const positions = body.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
    const angle = Math.atan2(x, z)
    const bulge = 1 + Math.sin(angle * 3 + y * 4.1) * .14
      + Math.cos(angle + .7) * .11 + Math.sin(angle * 5 - y * 10.7) * .09
    const rimWarp = (Math.sin(angle + .3) * .068 + Math.sin(angle * 3 - y * 7) * .035)
      * Math.min(1, Math.hypot(x, z) / .4)
    // A kidney-shaped body leaves space behind it for the neural arch.
    const back = Math.max(0, -Math.cos(angle))
    positions.setXYZ(i, x * bulge * 1.02 + Math.sin(y * 5) * .038,
      y + rimWarp,
      z * bulge * .94 + .22 + back * back * .09)
  }
  body.computeVertexNormals()
  const segments = software ? 8 : 14
  const sides = software ? 5 : 8
  const arch = processGeometry([
    new THREE.Vector3(-.50, .05, -.12), new THREE.Vector3(-.70, .10, -.57),
    new THREE.Vector3(-.40, .16, -.99), new THREE.Vector3(0, .18, -1.13),
    new THREE.Vector3(.43, .13, -1.01), new THREE.Vector3(.71, .05, -.59),
    new THREE.Vector3(.49, .02, -.09),
  ], segments + 4, sides, .25, .92)
  const parts: THREE.BufferGeometry[] = [body, arch]
  for (const side of [-1, 1]) {
    parts.push(processGeometry([
      new THREE.Vector3(side * .50, -.01, -.05),
      new THREE.Vector3(side * .80, .11, -.26),
      new THREE.Vector3(side * 1.10, .04, -.39),
      new THREE.Vector3(side * (side > 0 ? 1.31 : 1.22), -.16, -.26),
    ], segments, sides, .30, .76))
    const facet = new THREE.SphereGeometry(1, software ? 8 : 12, software ? 5 : 8)
    facet.scale(.27, .17, .28)
    facet.rotateX(side * .22)
    facet.translate(side * .51, .30, -.58)
    parts.push(facet)
  }
  parts.push(processGeometry([
    new THREE.Vector3(0, .12, -.92), new THREE.Vector3(.03, .08, -1.23),
    new THREE.Vector3(.01, -.17, -1.39), new THREE.Vector3(-.07, -.34, -1.53),
  ], segments, sides, .28, .86))

  const tint = new THREE.Color()
  const silver = new THREE.Color(.48, .47, .53)
  const teal = new THREE.Color(.21, .31, .34)
  const violet = new THREE.Color(.31, .23, .36)
  for (const part of parts) {
    const p = part.getAttribute('position')
    const normals = part.getAttribute('normal')
    const colors = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      // Broad, non-periodic-looking dents break a lathed rim's straight highlight.
      const relief = Math.sin(p.getX(i) * 5.7 + p.getZ(i) * 3.1)
        * Math.cos(p.getY(i) * 11.3 - p.getZ(i) * 4.2) * .048
      p.setXYZ(i, p.getX(i) + normals.getX(i) * relief,
        p.getY(i) + normals.getY(i) * relief, p.getZ(i) + normals.getZ(i) * relief)
      const angle = Math.atan2(p.getX(i), p.getZ(i) - .13)
      const shift = .5 + .5 * Math.sin(angle * 1.35 + p.getY(i) * 3.2 + p.getZ(i) * 1.7)
      const weathering = .5 + .5 * Math.sin(p.getX(i) * 12.3 + p.getY(i) * 7.7 + p.getZ(i) * 9.1)
      // Restrained patina leaves a silver base for reflected light instead of
      // baking the old yellow/green stripes into every segment.
      tint.copy(silver)
        .lerp(teal, ease((shift - .46) / .54) * .22)
        .lerp(violet, ease((.52 - shift) / .52) * .24)
        .multiplyScalar(.94 + weathering * .06)
      tint.toArray(colors, i * 3)
    }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    part.computeVertexNormals()
  }
  const merged = mergeGeometries(parts)
  parts.forEach(part => part.dispose())
  if (!merged) throw new Error('Unable to build the shared vertebra geometry')
  merged.computeBoundingSphere()
  return merged
}

/** Scroll-only articulated spine. Its parent owns world height and overall yaw. */
export function createSpineAssembly(software: boolean, mobile: boolean) {
  const group = new THREE.Group()
  group.name = 'aether-spine-assembly'
  const rows = software ? 9 : mobile ? 11 : 13
  const spacing = HEIGHT / rows
  const boneGeometry = vertebraGeometry(software)
  const discGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -.035), new THREE.Vector2(.45, -.035),
    new THREE.Vector2(.56, -.015), new THREE.Vector2(.57, .012),
    new THREE.Vector2(.45, .04), new THREE.Vector2(0, .04),
  ], software ? 16 : 28)
  discGeometry.scale(1, 1, .79)
  discGeometry.translate(0, 0, .23)
  const linkGeometry = createChainGeometry(software, mobile)
  const exposure = { value: sampleSpineExposure(0) }
  const boneMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb4b9c8, vertexColors: true, metalness: software ? .48 : .94,
    roughness: software ? .51 : .34, envMapIntensity: .94,
    iridescence: software ? 0 : .18, iridescenceIOR: 1.36,
    iridescenceThicknessRange: [260, 340], clearcoat: software ? 0 : .08,
    clearcoatRoughness: .38, transparent: true,
  })
  if (!software) {
    // Texture-free micrograin stays attached to the bone through instancing.
    // Screen derivatives attenuate subpixel grain; the low-amplitude surface
    // gradient changes reflections without adding geometry or a render pass.
    boneMaterial.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vSpineSurface;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSpineSurface = position;')
      shader.fragmentShader = /* glsl */ `
        varying vec3 vSpineSurface;
        float spineHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
        float spineNoise(vec3 p) {
          vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(spineHash(i),spineHash(i+vec3(1,0,0)),f.x),
            mix(spineHash(i+vec3(0,1,0)),spineHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(spineHash(i+vec3(0,0,1)),spineHash(i+vec3(1,0,1)),f.x),
            mix(spineHash(i+vec3(0,1,1)),spineHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
      ` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 spineDx = dFdx(-vViewPosition);
        vec3 spineDy = dFdy(-vViewPosition);
        vec3 spineRx = cross(spineDy, normal);
        vec3 spineRy = cross(normal, spineDx);
        float spineDet = dot(spineDx, spineRx);
        float spineFootprint = max(length(dFdx(vSpineSurface)), length(dFdy(vSpineSurface))) * 190.0;
        float spineGrain = spineNoise(vSpineSurface * 190.) * 2. - 1.;
        float spineGrainWeight = 1.0 - smoothstep(1.5, 6.0, spineFootprint);
        float spineRelief = spineGrain * .00065 * spineGrainWeight
          + spineNoise(vSpineSurface * 3.7) * .002;
        vec3 spineGradient = dFdx(spineRelief) * spineRx + dFdy(spineRelief) * spineRy;
        normal = normalize(max(abs(spineDet), 0.0000001) * normal
          - sign(spineDet) * spineGradient);
        roughnessFactor = clamp(roughnessFactor
          + (spineNoise(vSpineSurface * 2.3) - .5) * .055
          + spineGrain * spineGrainWeight * .065, .25, .46);
      `)
      // Broad reflected colour follows the view and surface orientation. Fine
      // grain only roughens those reflections; it never drives rainbow bands.
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec3 spineReflection = inverseTransformDirection(
          reflect(-normalize(vViewPosition), normal), viewMatrix);
        float spinePink = pow(max(0., dot(spineReflection, normalize(vec3(-.62,.38,.69)))), 4.2);
        float spineCyan = pow(max(0., dot(spineReflection, normalize(vec3(.73,-.13,.67)))), 5.0);
        float spineViolet = pow(max(0., dot(spineReflection, normalize(vec3(.12,.80,-.56)))), 4.0);
        float spineWindow = max(spinePink, max(spineCyan, spineViolet * .65));
        float spineDarkFace = .07 + .93 * smoothstep(.035, .58, spineWindow);
        vec3 spineReflectionColor = vec3(.92,.15,.56) * spinePink * 1.5
          + vec3(.08,.78,.96) * spineCyan * 1.25
          + vec3(.31,.13,.66) * spineViolet * .65;
        float spineFresnel = pow(1. - max(dot(normal, normalize(vViewPosition)), 0.), 2.);
        outgoingLight = outgoingLight * spineDarkFace * .54
          + spineReflectionColor * (.36 + spineFresnel * .64)
            * (.92 + spineGrain * spineGrainWeight * .15);
        #include <opaque_fragment>
      `)
    }
    boneMaterial.customProgramCacheKey = () => 'aether-spine-broad-reflection-v1'
  }
  const discMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x26364a, metalness: software ? .45 : .86, roughness: .44,
    envMapIntensity: .58, iridescence: software ? 0 : .14,
    iridescenceThicknessRange: [160, 380], transparent: true,
  })
  for (const material of [boneMaterial, discMaterial]) {
    const previousCompile = material.onBeforeCompile
    const previousCacheKey = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer)
      shader.uniforms.uSpineExposure = exposure
      shader.fragmentShader = 'uniform float uSpineExposure;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
        'outgoingLight *= uSpineExposure;\n#include <opaque_fragment>')
    }
    material.customProgramCacheKey = () => previousCacheKey + '-stage-exposure-v1'
  }
  const linkMaterial = createChainMaterial(software)
  const entryEdge = { value: -0.25 }
  const exitEdge = { value: -0.25 }
  for (const material of [boneMaterial, discMaterial, linkMaterial]) {
    // Keep the bone's micrograin hook and share the same diagonal boundary as
    // the outgoing ring and incoming monitors. Hidden fragments write no depth.
    const previousCompile = material.onBeforeCompile
    const previousCacheKey = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer)
      shader.uniforms.uSpineEntry = entryEdge
      shader.uniforms.uSpineExit = exitEdge
      shader.vertexShader = 'varying vec4 vSpineClip;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvSpineClip = gl_Position;')
      shader.fragmentShader = 'uniform float uSpineEntry; uniform float uSpineExit;\nvarying vec4 vSpineClip;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
        #include <alphamap_fragment>
        vec2 spineScreen = vSpineClip.xy / vSpineClip.w * .5 + .5;
        float spineBoundaryNoise = fract(sin(dot(floor(spineScreen * vec2(1800., 1100.)), vec2(12.9898, 78.233))) * 43758.5453);
        float spineBoundary = spineScreen.y - (spineScreen.x - .5) * .20 + (spineBoundaryNoise - .5) * .009;
        float spineEntry = (1. - smoothstep(uSpineEntry - .006, uSpineEntry + .006, spineBoundary))
          * smoothstep(uSpineExit - .006, uSpineExit + .006, spineBoundary);
        if (spineEntry < .003) discard;
        diffuseColor.a *= spineEntry;
      `)
    }
    material.customProgramCacheKey = () => previousCacheKey + '-monitor-passage-v2'
  }
  const bones = new THREE.InstancedMesh(boneGeometry, boneMaterial, rows)
  bones.name = 'aether-spine-vertebrae'
  const discs = new THREE.InstancedMesh(discGeometry, discMaterial, rows)
  // Reserve the longer layout once; resizing only changes the active range.
  const chains = new THREE.InstancedMesh(linkGeometry, linkMaterial, getChainLinkCount(true))
  chains.count = getChainLinkCount(mobile)
  chains.name = 'aether-spine-chain'
  group.userData.chainStrands = 1
  group.userData.motion = 'absolute-scroll-phase'
  const meshes = [bones, discs, chains]
  for (const mesh of meshes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    group.add(mesh)
  }
  const dummy = new THREE.Object3D()
  const up = new THREE.Vector3(0, 1, 0)
  const tangent = new THREE.Vector3()
  const alternating = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2)
  const chainRoll = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 6)
  let previousProgress = Number.NaN
  let previousEmergence = Number.NaN
  let previousMobile = mobile
  let disposed = false
  group.visible = false

  return {
    group,
    update(value: number, opacity: number, emergence: number, mobileView = mobile) {
      if (disposed) return
      const alpha = clamp(opacity)
      const form = ease(emergence)
      const progress = clamp(value)
      exposure.value = sampleSpineExposure(progress)
      group.userData.surfaceExposure = exposure.value
      entryEdge.value = sampleLayers(progress).monitorEntry
      exitEdge.value = sampleLayers(progress).monitorExit
      group.userData.entryEdge = entryEdge.value
      group.visible = alpha > .001 && form > .001
      boneMaterial.opacity = alpha
      discMaterial.opacity = alpha * .9
      linkMaterial.opacity = alpha
      if (!group.visible) return
      if (progress === previousProgress && form === previousEmergence && mobileView === previousMobile) return
      previousProgress = progress
      previousEmergence = form
      previousMobile = mobileView
      chains.count = getChainLinkCount(mobileView)
      const travel = progress * 1.4
      for (let i = 0; i < rows; i++) {
        const y = (THREE.MathUtils.euclideanModulo(i / rows + travel, 1) - .5) * HEIGHT
        const edge = ease((HEIGHT * .5 - Math.abs(y)) / .55)
        const bend = y * .48 + travel * 1.1
        const scale = edge * form
        dummy.position.set(Math.sin(bend) * .29 * form, y * form, Math.cos(bend * .8) * .18)
        // Consecutive bodies turn together along the column rather than
        // jittering independently around one straight, front-facing axis.
        dummy.rotation.set(Math.sin(bend * .8) * .07,
          y * .25 + Math.sin(bend * .72) * .22,
          -Math.cos(bend) * .13)
        // Fewer, taller bodies retain narrow joints instead of widely spaced rings.
        dummy.scale.set((.97 + Math.sin(i * 1.37) * .045) * scale,
          spacing / .98 * scale, (.96 + Math.cos(i * .87) * .065) * scale)
        dummy.updateMatrix()
        bones.setMatrixAt(i, dummy.matrix)
        dummy.position.y -= spacing * .47 * form
        dummy.scale.set(.97 * scale, spacing / .54 * scale, .97 * scale)
        dummy.updateMatrix()
        discs.setMatrixAt(i, dummy.matrix)
      }
      bones.instanceMatrix.needsUpdate = true
      discs.instanceMatrix.needsUpdate = true
      const chainPath = sampleChainPath(progress, mobileView)
      const chainLength = chainPath.getLength()
      for (let i = 0; i < chains.count; i++) {
        const t = i * CHAIN_LINK_PITCH / chainLength
        chainPath.getPointAt(t, dummy.position).multiplyScalar(form)
        chainPath.getTangentAt(t, tangent)
        dummy.quaternion.setFromUnitVectors(up, tangent)
        // A fixed roll opens the upper terminal toward the authored stage
        // views. It stays in the column frame rather than facing the camera.
        dummy.quaternion.multiply(chainRoll)
        if (i % 2) dummy.quaternion.multiply(alternating)
        // The free end is a full-size closed link, never faded or recycled.
        dummy.scale.setScalar(form)
        dummy.updateMatrix()
        chains.setMatrixAt(i, dummy.matrix)
      }
      chains.instanceMatrix.needsUpdate = true
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      meshes.forEach(mesh => mesh.dispose())
      boneGeometry.dispose()
      discGeometry.dispose()
      linkGeometry.dispose()
      boneMaterial.dispose()
      discMaterial.dispose()
      linkMaterial.dispose()
      group.clear()
    },
  }
}
