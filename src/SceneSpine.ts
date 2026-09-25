import * as THREE from 'three'
import lumbarMesh from './assets/lumbar-vertebra.json' with { type: 'json' }
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

/** Licensed anatomical body, neural arch and processes share one continuous mesh. */
function vertebraGeometry() {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lumbarMesh.positions, 3))
  const vertices = geometry.getAttribute('position')
  // The scan's body endplates form a wedge even with an upright instance.
  // Level those two fitted surfaces, blending out before the neural arch.
  // Preserve the source mesh connectivity and the open vertebral foramen.
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i)
    const weight = 1 - THREE.MathUtils.smoothstep(z, -.40, .12)
    const bottom = -.00913 * x - .12398 * z - .58966
    const top = -.06666 * x + .13745 * z + .12915
    const height = THREE.MathUtils.clamp((y - bottom) / Math.max(.25, top - bottom), -.035, 1.035)
    vertices.setY(i, THREE.MathUtils.lerp(y, -.535 + height * .60, weight))
  }
  geometry.setIndex(lumbarMesh.indices)
  const colors = new Float32Array(lumbarMesh.positions.length).fill(.94)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** Scroll-only articulated spine. Its parent owns world height and overall yaw. */
export function createSpineAssembly(software: boolean, mobile: boolean) {
  const group = new THREE.Group()
  group.name = 'aether-spine-assembly'
  const rows = 10
  const spacing = HEIGHT / rows
  const boneGeometry = vertebraGeometry()
  const linkGeometry = createChainGeometry(software, mobile)
  const exposure = { value: sampleSpineExposure(0) }
  const boneMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xa3bce1, vertexColors: true, metalness: software ? .48 : .96,
    roughness: software ? .51 : .29, envMapIntensity: 1.18,
    iridescence: software ? 0 : .24, iridescenceIOR: 1.36,
    iridescenceThicknessRange: [180, 460], clearcoat: software ? 0 : .12,
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
        float spineFolds(vec3 p, float footprint) {
          float warp = spineNoise(p * 2.1);
          p += vec3(warp, spineNoise(p.zxy * 3.3), spineNoise(p.yzx * 2.7)) * .8;
          float fineWeight = 1. - smoothstep(.4, 1.5, footprint * 65.);
          return spineNoise(p * vec3(5., 19., 5.)) * .70
            + mix(.5, spineNoise(p * vec3(13., 49., 13.)), fineWeight) * .30;
        }
      ` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 spineDx = dFdx(-vViewPosition);
        vec3 spineDy = dFdy(-vViewPosition);
        vec3 spineRx = cross(spineDy, normal);
        vec3 spineRy = cross(normal, spineDx);
        float spineDet = dot(spineDx, spineRx);
        float spineFootprint = max(length(dFdx(vSpineSurface)), length(dFdy(vSpineSurface)));
        float spineGrain = spineNoise(vSpineSurface * 160.) * 2. - 1.;
        float spineGrainWeight = 1.0 - smoothstep(1., 3.2, spineFootprint * 160.);
        float spineFold = spineFolds(vSpineSurface, spineFootprint);
        // Coating thickness varies across broad patches. Folds and grain only
        // change the reflection shape, never the coating's RGB phase.
        float spineCoating = spineNoise(vSpineSurface * vec3(1.6, 2.8, 1.6));
        float spineRelief = spineGrain * .00048 * spineGrainWeight
          + spineFold * .006 + spineNoise(vSpineSurface * 4.7) * .002;
        vec3 spineGradient = dFdx(spineRelief) * spineRx + dFdy(spineRelief) * spineRy;
        normal = normalize(max(abs(spineDet), 0.0000001) * normal
          - sign(spineDet) * spineGradient);
        roughnessFactor = clamp(roughnessFactor
          + (spineCoating - .5) * .10 + (spineFold - .5) * .14
          + spineGrain * spineGrainWeight * .065, .17, .43);
      `)
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `
        #include <lights_physical_fragment>
        #ifdef USE_IRIDESCENCE
          material.iridescenceThickness = mix(iridescenceThicknessMinimum,
            iridescenceThicknessMaximum, spineCoating);
        #endif
      `)
      // Broad reflected colour follows the view and surface orientation. Fine
      // grain only roughens those reflections; it never drives rainbow bands.
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec3 spineReflection = inverseTransformDirection(
          reflect(-normalize(vViewPosition), normal), viewMatrix);
        float spinePink = pow(max(0., dot(spineReflection, normalize(vec3(-.62,.38,.69)))), 2.8);
        float spineCyan = pow(max(0., dot(spineReflection, normalize(vec3(.73,-.13,.67)))), 3.4);
        float spineViolet = pow(max(0., dot(spineReflection, normalize(vec3(.12,.80,-.56)))), 2.5);
        float spineGold = pow(max(0., dot(spineReflection, normalize(vec3(-.72,-.32,-.60)))), 3.1);
        float spineGreen = pow(max(0., dot(spineReflection, normalize(vec3(.40,.56,-.73)))), 3.8);
        vec3 spineReflectionColor = vec3(.58,.26,.58) * spinePink
          + vec3(.12,.51,1.0) * spineCyan * 1.25
          + vec3(.24,.32,.88) * spineViolet * 1.05
          + vec3(.94,.59,.22) * spineGold * .12
          + vec3(.25,.82,.46) * spineGreen * .22;
        float spineFresnel = pow(1. - max(dot(normal, normalize(vViewPosition)), 0.), 2.);
        // Compress strong studio radiance without changing its RGB ratios.
        // Broad reflected color coats the midtones; only the brightest metal
        // highlights approach silver. Grain never controls the coating hue.
        float spineLightPeak = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));
        float spineSilverPeak = min(outgoingLight.r, min(outgoingLight.g, outgoingLight.b));
        float spineWhiteHighlight = smoothstep(1.4, 4., spineLightPeak);
        float spineColorPeak = max(spineReflectionColor.r, max(spineReflectionColor.g, spineReflectionColor.b));
        vec3 spineCoatTint = mix(vec3(.62,.60,.67),
          spineReflectionColor / max(.12, spineColorPeak), .78);
        spineCoatTint = mix(spineCoatTint, vec3(.96,.98,1.), spineWhiteHighlight * .68);
        vec3 spineRadiance = outgoingLight / (1. + spineLightPeak * .38);
        outgoingLight = spineRadiance * spineCoatTint * (.68 + spineCoating * .16)
          + spineReflectionColor * (.46 + spineFresnel * .35)
            * (.84 + spineCoating * .16);
        // The common RGB component of a bright PBR reflection is its neutral
        // silver glint. Keep that narrow peak above the colored coating; tinting
        // every peak as well as the midtones removes the metal's white sparkle.
        float spineSilverGlint = smoothstep(.45, 1.4, spineSilverPeak);
        spineSilverGlint *= spineSilverGlint;
        vec3 spineSilverRadiance = vec3(spineSilverPeak * .90 / (1. + spineSilverPeak * .32));
        outgoingLight = mix(outgoingLight, spineSilverRadiance, spineSilverGlint * .72);
        #include <opaque_fragment>
      `)
    }
    boneMaterial.customProgramCacheKey = () => 'aether-spine-layered-silver-v6'
  }
  for (const material of [boneMaterial]) {
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
  for (const material of [boneMaterial, linkMaterial]) {
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
  // Reserve the longer layout once; resizing only changes the active range.
  const chains = new THREE.InstancedMesh(linkGeometry, linkMaterial, getChainLinkCount(true))
  chains.count = getChainLinkCount(mobile)
  chains.name = 'aether-spine-chain'
  group.userData.chainStrands = 1
  group.userData.motion = 'absolute-scroll-phase'
  const meshes = [bones, chains]
  for (const mesh of meshes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    group.add(mesh)
  }
  const dummy = new THREE.Object3D()
  const up = new THREE.Vector3(0, 1, 0)
  const tangent = new THREE.Vector3()
  const projection = new THREE.Matrix4()
  const terminal = new THREE.Vector3()
  const alternating = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2)
  const chainRoll = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2)
  let previousProgress = Number.NaN
  let previousEmergence = Number.NaN
  let previousMobile = mobile
  let previousAnchor = Number.NaN
  let disposed = false
  group.visible = false

  return {
    group,
    update(value: number, opacity: number, emergence: number, mobileView = mobile, camera?: THREE.Camera) {
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
      linkMaterial.opacity = alpha
      if (!group.visible) return
      const chainPath = sampleChainPath(progress, mobileView)
      let anchorOffset = chainPath.getPointAt(0, terminal).y
      if (camera) {
        // The free end descends across the frame with scroll. At the lower
        // curtain it occupies only the bottom third, including camera motion.
        group.updateWorldMatrix(true, false)
        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(group.matrixWorld)
        chainPath.getPointAt(0, terminal).multiplyScalar(form)
        const startY = terminal.applyMatrix4(projection).y
        const screenY = THREE.MathUtils.lerp(startY,
          .72 - 1.06 * ease((progress - .40) / .215), ease((progress - .235) / .055))
        // Solve on the helix itself. A Y-only correction detaches the links
        // from their track and makes the diagonal strand fall vertically.
        let low = -30, high = 30
        for (let iteration = 0; iteration < 30; iteration++) {
          const height = (low + high) * .5
          chainPath.setTopHeight(height)
          chainPath.getPointAt(0, terminal).multiplyScalar(form).applyMatrix4(projection)
          if (terminal.y < screenY) low = height
          else high = height
        }
        anchorOffset = (low + high) * .5
        chainPath.setTopHeight(anchorOffset)
      }
      if (progress === previousProgress && form === previousEmergence && mobileView === previousMobile && anchorOffset === previousAnchor) return
      previousProgress = progress
      previousEmergence = form
      previousMobile = mobileView
      previousAnchor = anchorOffset
      chains.count = getChainLinkCount(mobileView)
      const travel = progress * 1.4
      for (let i = 0; i < rows; i++) {
        const y = (THREE.MathUtils.euclideanModulo(i / rows + travel, 1) - .5) * HEIGHT
        const edge = ease((HEIGHT * .5 - Math.abs(y)) / .55)
        const bend = y * .48 + travel * 1.1
        const scale = edge * form
        dummy.position.set(Math.sin(bend) * .29 * form, y * form, Math.cos(bend * .8) * .18)
        // The authored twist follows height, independently of the parent's
        // scroll rotation. Each adjacent body turns about 26 degrees, so the
        // neural arches form a continuous spiral instead of a straight seam.
        dummy.rotation.set(0, y * .42 + Math.sin(bend * .72) * .035, 0)
        // Fewer, taller bodies retain narrow joints instead of widely spaced rings.
        dummy.scale.set((.97 + Math.sin(i * 1.37) * .045) * scale,
          spacing / .61 * scale, (.96 + Math.cos(i * .87) * .065) * scale)
        dummy.updateMatrix()
        bones.setMatrixAt(i, dummy.matrix)
      }
      bones.instanceMatrix.needsUpdate = true
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
      linkGeometry.dispose()
      boneMaterial.dispose()
      linkMaterial.dispose()
      group.clear()
    },
  }
}
