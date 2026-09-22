import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { sampleLayers } from './SceneLayers'

const TAU = Math.PI * 2
const HEIGHT = 10.8
const clamp = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }

/** Closed oval links, with their long axis along the local chain tangent. */
class LinkCurve extends THREE.Curve<THREE.Vector3> {
  constructor() { super() }
  getPoint(t: number, target = new THREE.Vector3()) {
    return target.set(Math.sin(t * TAU) * .085, Math.cos(t * TAU) * .145, 0)
  }
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
      + Math.cos(angle + .7) * .085 + Math.sin(angle * 5 - y * 10.7) * .05
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
  ], segments + 4, sides, .30, 1.08)
  const parts: THREE.BufferGeometry[] = [body, arch]
  for (const side of [-1, 1]) {
    parts.push(processGeometry([
      new THREE.Vector3(side * .50, -.01, -.05),
      new THREE.Vector3(side * .80, .11, -.26),
      new THREE.Vector3(side * 1.04, .02, -.37),
      new THREE.Vector3(side * (side > 0 ? 1.22 : 1.13), -.19, -.23),
    ], segments, sides, .32, .98))
    const facet = new THREE.SphereGeometry(1, software ? 8 : 12, software ? 5 : 8)
    facet.scale(.29, .24, .29)
    facet.rotateX(side * .22)
    facet.translate(side * .51, .30, -.58)
    parts.push(facet)
  }
  parts.push(processGeometry([
    new THREE.Vector3(0, .12, -.92), new THREE.Vector3(.03, .08, -1.23),
    new THREE.Vector3(.01, -.17, -1.39), new THREE.Vector3(-.07, -.34, -1.53),
  ], segments, sides, .31, 1.12))

  const tint = new THREE.Color()
  for (const part of parts) {
    const p = part.getAttribute('position')
    const normals = part.getAttribute('normal')
    const colors = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      // Broad, non-periodic-looking dents break a lathed rim's straight highlight.
      const relief = Math.sin(p.getX(i) * 5.7 + p.getZ(i) * 3.1)
        * Math.cos(p.getY(i) * 11.3 - p.getZ(i) * 4.2) * .037
      p.setXYZ(i, p.getX(i) + normals.getX(i) * relief,
        p.getY(i) + normals.getY(i) * relief, p.getZ(i) + normals.getZ(i) * relief)
      const angle = Math.atan2(p.getX(i), p.getZ(i) - .13)
      const shift = .5 + .5 * Math.sin(angle * 1.8 + p.getY(i) * 8.4)
      const weathering = .5 + .5 * Math.sin(p.getX(i) * 12.3 + p.getY(i) * 7.7 + p.getZ(i) * 9.1)
      tint.setHSL(.08 + shift * .51, .08 + shift * .15, .40 + weathering * .23)
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
  const rows = software ? 12 : mobile ? 16 : 18
  const linksPerStrand = software ? 48 : mobile ? 76 : 104
  const spacing = HEIGHT / rows
  const boneGeometry = vertebraGeometry(software)
  const discGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -.035), new THREE.Vector2(.45, -.035),
    new THREE.Vector2(.56, -.015), new THREE.Vector2(.57, .012),
    new THREE.Vector2(.45, .04), new THREE.Vector2(0, .04),
  ], software ? 16 : 28)
  discGeometry.scale(1, 1, .79)
  discGeometry.translate(0, 0, .23)
  const linkGeometry = new THREE.TubeGeometry(new LinkCurve(), software ? 12 : 20,
    .024, software ? 5 : 6, true)
  const boneMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd2cbbd, vertexColors: true, metalness: software ? .48 : .87,
    roughness: software ? .58 : .47, envMapIntensity: 1.05,
    iridescence: software ? 0 : .48, iridescenceIOR: 1.34,
    iridescenceThicknessRange: [115, 430], clearcoat: software ? 0 : .045,
    clearcoatRoughness: .54, transparent: true,
  })
  if (!software) {
    // Texture-free micrograin stays attached to the bone through instancing.
    // Screen derivatives attenuate subpixel grain; the low-amplitude surface
    // gradient changes reflections without adding geometry or a render pass.
    boneMaterial.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vSpineSurface;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSpineSurface = position;')
      shader.fragmentShader = 'varying vec3 vSpineSurface;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 spineDx = dFdx(-vViewPosition);
        vec3 spineDy = dFdy(-vViewPosition);
        vec3 spineRx = cross(spineDy, normal);
        vec3 spineRy = cross(normal, spineDx);
        float spineDet = dot(spineDx, spineRx);
        float spineFootprint = max(length(dFdx(vSpineSurface)), length(dFdy(vSpineSurface))) * 150.0;
        float spineGrain = sin(dot(vSpineSurface, vec3(113.0, 79.0, 137.0)))
          * sin(dot(vSpineSurface, vec3(61.0, 151.0, 97.0)));
        float spineGrainWeight = 1.0 - smoothstep(1.5, 6.0, spineFootprint);
        vec3 spineGradient = dFdx(spineGrain) * spineRx + dFdy(spineGrain) * spineRy;
        normal = normalize(max(abs(spineDet), 0.0000001) * normal
          - sign(spineDet) * spineGradient * 0.00065 * spineGrainWeight);
        float spineWear = sin(dot(vSpineSurface, vec3(9.1, 13.7, 7.3)))
          * cos(dot(vSpineSurface, vec3(17.3, 5.7, 11.1)));
        roughnessFactor = clamp(roughnessFactor + spineWear * .12
          + spineGrain * spineGrainWeight * .045, .34, .69);
      `)
    }
    boneMaterial.customProgramCacheKey = () => 'aether-organic-spine-grain-v2'
  }
  const discMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x354766, metalness: software ? .45 : .86, roughness: .41,
    envMapIntensity: .72, iridescence: software ? 0 : .65,
    iridescenceThicknessRange: [160, 380], transparent: true,
  })
  const linkMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5bc9f, metalness: software ? .5 : .94, roughness: .31,
    envMapIntensity: 1.35, transparent: true,
  })
  const entryEdge = { value: -0.25 }
  for (const material of [boneMaterial, discMaterial, linkMaterial]) {
    // Keep the bone's micrograin hook and share the same diagonal boundary as
    // the outgoing ring and incoming monitors. Hidden fragments write no depth.
    const previousCompile = material.onBeforeCompile
    const previousCacheKey = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer)
      shader.uniforms.uSpineEntry = entryEdge
      shader.vertexShader = 'varying vec4 vSpineClip;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvSpineClip = gl_Position;')
      shader.fragmentShader = 'uniform float uSpineEntry;\nvarying vec4 vSpineClip;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
        #include <alphamap_fragment>
        vec2 spineScreen = vSpineClip.xy / vSpineClip.w * .5 + .5;
        float spineNoise = fract(sin(dot(floor(spineScreen * vec2(1800., 1100.)), vec2(12.9898, 78.233))) * 43758.5453);
        float spineBoundary = spineScreen.y - (spineScreen.x - .5) * .20 + (spineNoise - .5) * .009;
        float spineEntry = 1. - smoothstep(uSpineEntry - .004, uSpineEntry + .004, spineBoundary);
        if (spineEntry < .003) discard;
        diffuseColor.a *= spineEntry;
      `)
    }
    material.customProgramCacheKey = () => previousCacheKey + '-monitor-entry-v1'
  }
  const bones = new THREE.InstancedMesh(boneGeometry, boneMaterial, rows)
  bones.name = 'aether-spine-vertebrae'
  const discs = new THREE.InstancedMesh(discGeometry, discMaterial, rows)
  const chains = new THREE.InstancedMesh(linkGeometry, linkMaterial, linksPerStrand * 2)
  chains.name = 'aether-spine-chain'
  group.userData.chainTurns = 2.15
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
  let previousProgress = Number.NaN
  let previousEmergence = Number.NaN
  let disposed = false
  group.visible = false

  return {
    group,
    update(value: number, opacity: number, emergence: number) {
      if (disposed) return
      const alpha = clamp(opacity)
      const form = ease(emergence)
      const progress = clamp(value)
      entryEdge.value = sampleLayers(progress).monitorEntry
      group.userData.entryEdge = entryEdge.value
      group.visible = alpha > .001 && form > .001
      boneMaterial.opacity = alpha
      discMaterial.opacity = alpha * .9
      linkMaterial.opacity = alpha
      if (!group.visible) return
      if (progress === previousProgress && form === previousEmergence) return
      previousProgress = progress
      previousEmergence = form
      const travel = progress * 1.4
      for (let i = 0; i < rows; i++) {
        const y = (THREE.MathUtils.euclideanModulo(i / rows + travel, 1) - .5) * HEIGHT
        const edge = ease((HEIGHT * .5 - Math.abs(y)) / .55)
        const bend = y * .48 + travel * 1.1
        const scale = edge * form
        dummy.position.set(Math.sin(bend) * .14 * form, y * form, Math.cos(bend * .8) * .095)
        dummy.rotation.set(Math.sin(i * .81 + travel) * .065,
          Math.sin(bend * .72) * .15 + Math.sin(i * 1.1) * .13,
          Math.sin(i * .72 + travel) * .055)
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
      for (let strand = 0; strand < 2; strand++) {
        for (let i = 0; i < linksPerStrand; i++) {
          const t = THREE.MathUtils.euclideanModulo(i / linksPerStrand + progress * 3.4, 1)
          const y = (t - .5) * HEIGHT
          const angle = t * TAU * 2.15 + strand * Math.PI + progress * TAU * 3.2
          const radius = 1.60 + Math.sin(y * .85 + strand) * .075
          const radiusSlope = Math.cos(y * .85 + strand) * .075 * .85
          const turnSlope = TAU * 2.15 / HEIGHT
          const bend = y * .48 + travel * 1.1
          const edge = ease((HEIGHT * .5 - Math.abs(y)) / .30)
          // Both strands pass in front of AND behind the actual bone surface.
          // Their tangent is the analytic derivative of this same helix.
          dummy.position.set((Math.cos(angle) * radius + Math.sin(bend) * .14) * form,
            y * form, (Math.sin(angle) * radius + Math.cos(bend * .8) * .095) * form)
          tangent.set(radiusSlope * Math.cos(angle) - radius * Math.sin(angle) * turnSlope
            + Math.cos(bend) * .14 * .48, 1,
          radiusSlope * Math.sin(angle) + radius * Math.cos(angle) * turnSlope
            - Math.sin(bend * .8) * .095 * .48 * .8)
          const linkSpacing = tangent.length() * HEIGHT / linksPerStrand
          tangent.normalize()
          dummy.quaternion.setFromUnitVectors(up, tangent)
          // Alternate within each strand, not by the strand's own index.
          if (i % 2) dummy.quaternion.multiply(alternating)
          dummy.scale.set(edge * form, linkSpacing / .235 * edge * form, edge * form)
          dummy.updateMatrix()
          chains.setMatrixAt(strand * linksPerStrand + i, dummy.matrix)
        }
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
