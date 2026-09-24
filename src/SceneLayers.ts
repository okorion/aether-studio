import * as THREE from 'three'
import { smooth, windowWeight } from './Journey'
import { createSurfaceFlowUniforms, surfaceFlowGLSL, type SurfaceFlowInput } from './SceneSurfaceFlow'

/** All boundaries use viewport UVs, independent of render-target resolution. */
export function sampleLayers(progress: number) {
  const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0
  return {
    forestExit: -0.35 + 1.7 * smooth(.10, .20, p),
    forestEntry: -0.35 + 1.7 * smooth(.855, .925, p),
    monitorEntry: -0.25 + 1.5 * smooth(.23, .31, p),
    monitorExit: -0.25 + 1.5 * smooth(.61, .69, p),
    deviceExit: -0.25 + 1.5 * smooth(.715, .785, p),
    statement: windowWeight(p, .095, .12, .265, .305),
    statementY: -1.15 * (1 - smooth(.10, .175, p)) + 1.5 * smooth(.22, .305, p),
    scaleCopy: windowWeight(p, .765, .805, .89, .93),
  }
}

/** The emblem belongs above the incoming monitors, below the incoming forest. */
export function sampleEmblemCurtain(progress: number) {
  const layers = sampleLayers(progress)
  return progress < .5
    ? { upper: 1.5, lower: layers.monitorEntry }
    : { upper: layers.forestEntry, lower: -.5 }
}

/** Flat editorial wrappers live inside the scene, behind the actual 3D ring. */
export function createSceneLayers(scene: THREE.Scene) {
  const group = new THREE.Group()
  group.name = 'aether-editorial-wrappers'
  const geometry = new THREE.PlaneGeometry(2, 2)
  const canvases = [document.createElement('canvas'), document.createElement('canvas')]
  const textures = canvases.map(canvas => new THREE.CanvasTexture(canvas))
  const flow = createSurfaceFlowUniforms()
  textures.forEach(texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false })
  const materials = textures.map(texture => new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture }, uOpacity: { value: 0 },
      ...flow.uniforms, uFluidWeight: { value: texture === textures[0] ? 1 : 0 },
      uTop: { value: 1.5 }, uBottom: { value: -.5 },
    },
    vertexShader: `varying vec2 vUv; varying vec4 vClip;
      void main(){vUv=uv; vClip=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=vClip;}`,
    fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; uniform float uTop; uniform float uBottom;
      uniform float uFluidWeight;
      ${surfaceFlowGLSL}
      varying vec2 vUv; varying vec4 vClip;
      void main(){
        vec2 screen=vClip.xy/vClip.w*.5+.5;
        float edge=(screen.x-.5)*.20;
        float noise=fract(sin(dot(floor(screen*vec2(1800.,1100.)),vec2(12.9898,78.233)))*43758.5453);
        float y=screen.y-edge+(noise-.5)*.006;
        float mask=(1.-smoothstep(uTop-.005,uTop+.005,y))*smoothstep(uBottom-.005,uBottom+.005,y);
        vec3 water=surfaceWater(screen)*uFluidWeight;
        vec2 displacement=water.xy*.014;
        displacement*=min(1.,.0027/max(length(displacement),.00001));
        displacement.x/=max(uFlowAspect,.25);
        vec2 inkUv=vUv-displacement;
        vec4 ink=texture2D(uMap,clamp(inkUv,vec2(0.),vec2(1.)));
        if(mask*ink.a*uOpacity<.003)discard;
        // A faint sheen belongs to this black plate, below the solid glass emblem.
        // The forest and emblem never sample this displacement for their silhouette.
        float filmEdge=min(1.,length(water.xy)*4.);
        float reflection=pow(max(0.,dot(normalize(vec3(water.xy*7.,1.)),normalize(vec3(-.5,.6,1.)))),12.);
        ink.rgb+=vec3(.032,.055,.064)*filmEdge*reflection;
        // Narrow chromatic refraction belongs to the moving liquid surface.
        ink.r=mix(ink.r,texture2D(uMap,clamp(inkUv-displacement*.08,0.,1.)).r,filmEdge*.4);
        ink.b=mix(ink.b,texture2D(uMap,clamp(inkUv+displacement*.08,0.,1.)).b,filmEdge*.4);
        gl_FragColor=vec4(ink.rgb,ink.a*uOpacity*mask);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true,
  }))
  const panels = materials.map((material, i) => {
    const panel = new THREE.Mesh(geometry, material)
    panel.name = i ? 'aether-scale-wrapper' : 'aether-statement-wrapper'
    panel.frustumCulled = false
    panel.renderOrder = i ? 4 : -3
    group.add(panel)
    return panel
  })
  scene.add(group)
  let aspect = 0
  let disposed = false
  const forward = new THREE.Vector3()
  const up = new THREE.Vector3()
  const scaleAnchor = new THREE.Vector3()
  function draw(nextAspect: number) {
    aspect = nextAspect
    const narrow = aspect < 1
    for (let i = 0; i < 2; i++) {
      const canvas = canvases[i]
      canvas.width = narrow ? 900 : 2048
      canvas.height = Math.round(canvas.width / aspect)
      const c = canvas.getContext('2d')
      if (!c) continue
      const w = canvas.width, h = canvas.height
      c.clearRect(0, 0, w, h)
      if (!i) {
        const shade=c.createLinearGradient(0,0,w,h)
        shade.addColorStop(0,'#05090d')
        shade.addColorStop(.6,'#050a0e')
        shade.addColorStop(1,'#09121c')
        c.fillStyle=shade
        c.fillRect(0,0,w,h)
      }
      c.fillStyle = '#eef3ed'
      c.textBaseline = 'top'
      if (!i) {
        const size = w * (narrow ? .145 : .088)
        c.font = `400 ${size}px "IBM Plex Mono", monospace`
        const x = w * .1, y = h * (narrow ? .27 : .25)
        for (const [j, text] of ['WORLDS', 'IN HUMAN', 'MOTION.'].entries()) c.fillText(text, x, y + j * size * 1.04)
        const body = w * (narrow ? .026 : .012)
        c.font = `400 ${body}px "IBM Plex Mono", monospace`
        c.fillStyle = '#b9cdc8'
        const bx = w * (narrow ? .12 : .65), by = h * (narrow ? .66 : .49)
        ;['INDEPENDENT BY NATURE', '', 'ART, CODE AND HUMAN CURIOSITY.', 'WE BUILD WORLDS THAT MOVE US.', '', 'IMAGINATION, MADE TANGIBLE.'].forEach((line, j) => c.fillText(line, bx, by + body * 1.75 * j))
      } else {
        // The centre mark is formed by actual scale facets in the 3D sheet.
        c.font = `400 ${w * (narrow ? .049 : .027)}px "IBM Plex Mono", monospace`
        c.fillText('MATTER', w * (narrow ? .1 : .25), h * .45)
        c.fillText('IN MOTION ↗', w * (narrow ? .1 : .25), h * .45 + w * .037)
        c.font = `400 ${w * (narrow ? .024 : .011)}px "IBM Plex Mono", monospace`
        c.fillStyle = '#d2e2da'
        ;['A THOUSAND SURFACES.', 'ONE LIVING FORM.', 'RESPONDING TO YOUR PRESENCE.'].forEach((line, j) => c.fillText(line, w * (narrow ? .1 : .59), h * (narrow ? .60 : .455) + w * (narrow ? .037 : .019) * j))
      }
      textures[i].needsUpdate = true
    }
  }
  void document.fonts.ready.then(() => { if (!disposed && aspect) draw(aspect) })
  return {
    update(progress: number, camera: THREE.PerspectiveCamera, pointer?: SurfaceFlowInput) {
      if (disposed) return
      flow.update(pointer)
      if (Math.abs(aspect - camera.aspect) > .001) draw(camera.aspect)
      const state = sampleLayers(progress)
      camera.getWorldDirection(forward)
      up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      for (let i = 0; i < 2; i++) {
        // A screen-aligned plane provides a flat wrapper while retaining depth
        // ordering with foreground geometry and the incoming forest canopy.
        const depth = i ? 4.5 : 18
        const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * depth
        const panel = panels[i]
        panel.position.copy(camera.position).addScaledVector(forward, depth)
        scaleAnchor.set(0, -48, 0).project(camera)
        panel.position.addScaledVector(up, i ? scaleAnchor.y * halfHeight : state.statementY * halfHeight)
        panel.quaternion.copy(camera.quaternion)
        panel.scale.set(halfHeight * aspect, halfHeight, 1)
        materials[i].uniforms.uOpacity.value = i ? state.scaleCopy : state.statement
        materials[i].uniforms.uTop.value = i ? state.deviceExit : state.forestExit
        materials[i].uniforms.uBottom.value = i ? state.forestEntry : state.monitorEntry
        panel.visible = materials[i].uniforms.uOpacity.value > .001
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      scene.remove(group)
      geometry.dispose()
      materials.forEach(m => m.dispose())
      textures.forEach(t => t.dispose())
      flow.dispose()
    },
  }
}
