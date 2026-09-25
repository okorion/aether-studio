import * as THREE from 'three'
import { createPointerFlow } from '../../src/PointerFlow'
import { createSurfaceFlowUniforms, surfaceFlowGLSL } from '../../src/SceneSurfaceFlow'
import { createSceneLayers, sampleLayers } from '../../src/SceneLayers'
import { createSceneMonitors } from '../../src/SceneMonitors'
import { sampleJourney } from '../../src/Journey'

/** Read the production water normal, including the dry-contact mask, on GPU. */
export function probeDryContact() {
  const flow = createPointerFlow()
  const surface = createSurfaceFlowUniforms()
  surface.update({ flowTexture: flow.texture, waterTexture: flow.surfaceTexture, aspect: 1.6 })
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(64, 40)
  const target = new THREE.WebGLRenderTarget(64, 40, { type: THREE.FloatType })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({ uniforms: surface.uniforms,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `${surfaceFlowGLSL}\nvarying vec2 vUv;void main(){gl_FragColor=vec4(surfaceWater(vUv),1.);}`,
  })
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.Camera()
  const pixels = new Float32Array(64 * 40 * 4)
  const read = () => {
    renderer.setRenderTarget(target); renderer.render(scene, camera)
    renderer.readRenderTargetPixels(target, 0, 0, 64, 40, pixels)
    let dryMax = 0, rimMax = 0, dryPixels = 0, energy = 0
    const field = flow.texture.image.data as Uint8Array
    for (let i = 0; i < pixels.length; i += 4) {
      const normal = Math.hypot(pixels[i], pixels[i + 1]); energy += normal
      if (field[i + 3] < 180) { dryMax = Math.max(dryMax, normal); dryPixels++ }
      if (field[i + 3] === 255 && field[i + 2] > 8) rimMax = Math.max(rimMax, normal)
    }
    return { dryMax, rimMax, dryPixels, energy }
  }
  try {
    for (let i = 0; i <= 12; i++) { flow.move(-.32 + i * .04, 0, 1.6); flow.update(1 / 60) }
    const contact = read(), recovery: number[] = []
    const previous = new Float32Array(pixels.length)
    const originalDry = Array.from({ length: pixels.length / 4 }, (_, i) => i * 4)
      .filter(i => (flow.texture.image.data as Uint8Array)[i + 3] < 180)
    let refill = 0, dryAfterStop = 0
    let reversals = 0, increases = 0
    flow.release()
    for (let frame = 0; frame < 145; frame++) {
      flow.update(1 / 60)
      const sample = read()
      if (frame % 6 === 0) recovery.push(sample.energy)
      if(frame > 4 && frame < 30) for(const i of originalDry)
        refill = Math.max(refill, Math.hypot(pixels[i], pixels[i + 1]))
      if(frame === 18) dryAfterStop = sample.dryPixels
      if (frame > 40) for (let i = 0; i < pixels.length; i += 4) {
        for (let channel = 0; channel < 2; channel++) {
          const a = previous[i + channel], b = pixels[i + channel]
          if (a * b < -1e-12) reversals++
          if (Math.abs(b) > Math.abs(a) + 1e-6) increases++
        }
      }
      previous.set(pixels)
    }
    return { contact, recovery, refill, dryAfterStop, reversals, increases, end: read(), error: renderer.getContext().getError() }
  } finally {
    flow.dispose(); surface.dispose(); target.dispose(); geometry.dispose(); material.dispose()
    renderer.dispose(); renderer.forceContextLoss()
  }
}

/** A bright background reveals any hole above the production diagonal wipe. */
export function probeStatementHandoff(mobile: boolean) {
  const width=mobile?117:240,height=mobile?253:150,aspect=width/height
  const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true})
  renderer.setSize(width,height)
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xff00ff)
  const layers=createSceneLayers(scene),monitors=createSceneMonitors(true,mobile)
  scene.add(monitors.group)
  const camera=new THREE.PerspectiveCamera(42,aspect,.1,100)
  const gl=renderer.getContext()
  const read=()=>{renderer.render(scene,camera);const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes}
  const sample=(progress:number)=>{
    const j=sampleJourney(progress),radius=j.radius+(mobile?4.8:0)
    camera.position.set(Math.sin(j.azimuth)*Math.cos(j.elevation)*radius,Math.sin(j.elevation)*radius,Math.cos(j.azimuth)*Math.cos(j.elevation)*radius)
    camera.lookAt(0,0,0);camera.updateMatrixWorld()
    layers.update(progress,camera)
    monitors.group.visible=false
    const background=read()
    monitors.update(0,progress,undefined,camera)
    const withMonitors=read(),edge=sampleLayers(progress).monitorEntry
    let leaked=0,protectedPixels=0,monitorPixels=0
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=(y*width+x)*4,slant=(y+.5)/height-((x+.5)/width-.5)*.20
      if(slant>edge+.025){protectedPixels++;if(background[i]>64&&background[i+2]>64&&background[i+1]<background[i]*.45)leaked++}
      if(slant<edge-.015&&Math.abs(withMonitors[i+1]-background[i+1])>12)monitorPixels++
    }
    return{progress,leaked,protectedPixels,monitorPixels,pixels:withMonitors}
  }
  try{
    const progress=[.235,.25,.255,.265,.275,.29]
    const forward=progress.map(sample),reverse=[...progress].reverse().map(sample).reverse()
    return forward.map((s,i)=>({progress:s.progress,leaked:s.leaked,protectedPixels:s.protectedPixels,monitorPixels:s.monitorPixels,
      reverseChanged:s.pixels.reduce((count,value,index)=>count+Number(value!==reverse[i].pixels[index]),0)}))
  }finally{layers.dispose();monitors.dispose();renderer.dispose();renderer.forceContextLoss()}
}
