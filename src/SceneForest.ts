import * as THREE from 'three'
import { sampleJourney } from './Journey'
import { createForestParticles, sampleForestAssembly } from './ForestAssembly'
import { sampleLayers } from './SceneLayers'
import { createForestGeometry, FOREST_FLOOR_Y, FOREST_GROVE_OFFSETS } from './ForestGeometry'
import { createLightFilmUniforms, lightChoreographyGLSL, sampleLightChoreography } from './SceneLighting'
import type { LightFilmUniforms } from './SceneLighting'

type ForestPointer = { ndc: THREE.Vector2; strength: number; aspect: number; active?: boolean; flowTexture?: THREE.Texture }

const sharedShader = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform float uExit;
  uniform float uEntry;
  uniform float uDarkness;
  uniform float uLightDepth;
  uniform float uLightStrength;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  varying vec4 vClip;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vSeed;
  varying vec2 vUv;
  varying float vDepth;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
  }
  float wipe() {
    vec2 screen=vClip.xy/vClip.w*.5+.5;
    float y=screen.y-(screen.x-.5)*.20+(noise(screen*230.)-.5)*.006;
    float top=smoothstep(uExit-.006,uExit+.006,y);
    float bottom=1.-smoothstep(uEntry-.006,uEntry+.006,y);
    return max(top,bottom);
  }
  float pointerLight() {
    vec2 delta=(vClip.xy/vClip.w-uPointer)*vec2(uAspect,1.);
    return exp(-dot(delta,delta)*13.)*uPointerStrength;
  }
  float groveCoverage() {
    float nearFade=smoothstep(2.4,5.2,vDepth);
    return wipe()*nearFade;
  }
  vec3 finishForest(vec3 color) {
    float fog=1.-exp(-max(0.,vDepth-6.)*.035);
    return mix(color*(1.-uDarkness*.2),vec3(.002,.006,.005),fog*.72);
  }
`

// Screen-space flow is projected back onto the camera plane, so the lower
// grove's rotation and an orbit never reverse the visible pointer direction.
// This runs before the same curtain coverage as the resting foliage: the
// transition masks what is visible, rather than switching interaction off.
const forestFlowVertex = /* glsl */ `
  uniform sampler2D uPointerFlow;
  uniform float uFlowActive;
  vec3 forestFlow(vec4 view, vec3 seed) {
    if(view.z>=-.1)return vec3(0.);
    vec4 clip=projectionMatrix*view;
    vec2 uv=clip.xy/clip.w*.5+.5;
    vec2 inside=smoothstep(vec2(0.),vec2(.04),uv)
      *(1.-smoothstep(vec2(.96),vec2(1.),uv));
    vec2 flow=(texture2D(uPointerFlow,clamp(uv,0.,1.)).rg-vec2(128./255.))*(255./127.);
    float depth=smoothstep(2.4,5.2,-view.z);
    vec2 shift=flow*(.045+seed.x*.02)*inside.x*inside.y*depth*uFlowActive;
    shift.x/=uAspect;
    vec2 offset=shift*clip.w/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);
    vec3 cameraRight=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
    vec3 cameraUp=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
    return cameraRight*offset.x+cameraUp*offset.y;
  }
`

const microVertex = /* glsl */ `
  ${sharedShader}
  ${forestFlowVertex}
  attribute vec3 aSeed;
  attribute float aSize;
  attribute vec3 aOrigin;
  attribute float aAssemblyPhase;
  uniform float uAssembly;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  void main() {
    float arrival=smoothstep(aAssemblyPhase*.68,aAssemblyPhase*.68+.32,uAssembly);
    vec3 p=mix(aOrigin,position,arrival);
    p.y+=sin(uTime*.62+aSeed.y*29.)*.008;
    vec4 world=modelMatrix*vec4(p,1.);
    vec4 view=viewMatrix*world;
    world.xyz+=forestFlow(view,aSeed);
    view=viewMatrix*world;
    vWorld=world.xyz;
    vDepth=-view.z;
    vClip=projectionMatrix*view;
    vSeed=aSeed;
    vNormal=vec3(0.,1.,0.);
    vUv=vec2(.5);
    gl_Position=vClip;
    gl_PointSize=clamp(aSize*uViewportHeight*projectionMatrix[1][1]*.5/max(.1,vDepth),.8,6.*uPixelRatio);
  }
`

const microFragment = /* glsl */ `
  ${sharedShader}
  ${lightChoreographyGLSL}
  void main() {
    vec2 p=gl_PointCoord*2.-1.;
    float r=dot(p,p);
    if(r>1.)discard;
    float edge=1.-smoothstep(.64,1.,r);

    float coverage=groveCoverage();
    // A zero hash must not survive a completely closed curtain.
    if(edge<.12||coverage<.003||coverage<hash(vSeed.xy))discard;
    vec3 n=vec3(p,sqrt(max(0.,1.-r)));
    float light=max(0.,dot(n,normalize(vec3(-.4,.65,.65))));
    vec3 olive=mix(vec3(.014,.028,.003),vec3(.17,.22,.026),vSeed.x);
    vec3 green=mix(vec3(.006,.026,.009),vec3(.036,.13,.046),vSeed.x);
    vec3 color=mix(olive,green,smoothstep(.27,.75,vSeed.z))*(.3+light*.65);
    color*=.52+vSeed.y*.65;
    color+=vec3(.44,.51,.30)*pow(light,24.)*(.10+vSeed.y*.45);
    color+=aetherLightCloud(vWorld,vNormal,uTime,uLightDepth)*uLightStrength*(.13+light*.08);
    color+=vec3(.14,.35,.23)*pointerLight()*(.3+light*.4);
    gl_FragColor=vec4(finishForest(color),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// Short branching clusters sit on the forest side of each curtain. The same
// screen-space wake and film projection used by the existing foliage also
// reach these points; the curtain still clips their final fragments.
const boundaryVertex = /* glsl */ `
  ${sharedShader}
  ${forestFlowVertex}
  attribute vec3 aSeed;
  attribute float aSize;
  attribute float aKind;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  uniform float uBoundaryStrength;
  varying float vKind;
  void main() {
    vSeed=aSeed;
    vKind=aKind;
    vec3 p=position;
    float sway=sin(uTime*.45+aSeed.y*19.+p.x*.6)*.035;
    p.x+=sway*step(.5,aKind);
    p.y+=sin(uTime*.37+aSeed.z*23.)*.025;
    vec4 world=modelMatrix*vec4(p,1.);
    vec4 view=viewMatrix*world;
    world.xyz+=forestFlow(view,aSeed)*(.65+.35*step(.5,aKind));
    view=viewMatrix*world;
    vWorld=world.xyz;
    vDepth=-view.z;
    vClip=projectionMatrix*view;
    // Roots and soil occupy the forest's actual floor. The editorial wipe only
    // clips fragments; it must never reposition the landscape in screen space.
    vNormal=normalize(mat3(modelMatrix)*vec3(0.,1.,0.));
    vUv=vec2(.5);
    gl_Position=vClip;
    float size=aSize*uViewportHeight*projectionMatrix[1][1]*.5/max(.1,vDepth);
    gl_PointSize=clamp(size*uBoundaryStrength,.1,12.*uPixelRatio);
  }
`

const boundaryFragment = /* glsl */ `
  ${sharedShader}
  ${lightChoreographyGLSL}
  uniform float uBoundaryStrength;
  varying float vKind;
  void main() {
    vec2 q=gl_PointCoord*2.-1.;
    float r=dot(q,q);
    if(r>1.)discard;
    float plant=step(.5,vKind);
    float mist=step(1.5,vKind);
    float core=1.-smoothstep(mix(.32,.05,mist),1.,r);
    float coverage=wipe()*smoothstep(1.2,3.,vDepth)*uBoundaryStrength*core;
    if(coverage<.003||coverage<hash(gl_FragCoord.xy))discard;
    vec3 n=normalize(vec3(q,sqrt(max(.01,1.-r))));
    float facing=.25+.75*max(0.,dot(n,normalize(vec3(-.4,.7,.6))));
    vec3 green=mix(vec3(.025,.085,.035),vec3(.22,.32,.075),vSeed.x);
    vec3 color=green*facing*(plant>.5?1.15:.75);
    vec3 cloud=aetherLightCloud(vWorld,n,uTime,uLightDepth);
    color+=cloud*uLightStrength*(mist>.5?.38:.22);
    color+=vec3(.16,.42,.29)*pointerLight()*(.35+plant*.45);
    if(mist>.5) color=mix(color,cloud*.9,.7);
    gl_FragColor=vec4(finishForest(color),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function createBoundaryGeometry(software:boolean,mobile:boolean) {
  let state=0x51f0e57
  const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296)
  const positions:number[]=[], seeds:number[]=[], sizes:number[]=[], kinds:number[]=[]
  const add=(x:number,y:number,z:number,size:number,kind:number)=>{
    positions.push(x,y,z);seeds.push(random(),random(),random());sizes.push(size);kinds.push(kind)
  }
  const clusters=software?110:mobile?240:460
  for(let i=0;i<clusters;i++) {
    const angle=i*2.399963+(random()-.5)*.55
    const radius=Math.sqrt(random())*11.4
    const rootX=Math.cos(angle)*radius,rootZ=Math.sin(angle)*radius
    const height=.35+random()*1.35
    const shoots=2+(i%3)
    for(let shoot=0;shoot<shoots;shoot++) {
      const spread=angle+shoot*2.399963
      const length=height*(.6+random()*.55)
      for(let step=0;step<6;step++) {
        const t=step/5
        const fan=t*t*(.16+shoot*.085)
        const x=rootX+Math.cos(spread)*fan
        const z=rootZ+Math.sin(spread)*fan
        add(x,t*length,z,.045+t*.035,1)
        if(step>1&&step<5) {
          const side=spread+(step%2?1:-1)*1.05
          add(x+Math.cos(side)*t*.17,t*length-.045,z+Math.sin(side)*t*.17,.045+t*.055,1)
        }
      }
    }
  }
  // Dense, uneven soil/canopy grains fill the roots between fern shoots.
  // One shared point buffer and draw call cover the bank on both profiles.
  const bank=software?5000:mobile?18000:56000
  for(let i=0;i<bank;i++) {
    const angle=random()*Math.PI*2,radius=Math.sqrt(random())*13.8
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius
    const mound=.10+.35*Math.pow(.5+.5*Math.sin(x*.8+z*.55),2)
    add(x,random()*mound,z,.025+random()*.065,1)
  }
  const motes=software?220:mobile?600:1400
  for(let i=0;i<motes;i++) {
    const angle=random()*Math.PI*2,radius=3.4+random()*9
    add(Math.cos(angle)*radius,(random()-.3)*3,Math.sin(angle)*radius,.025+random()*.055,0)
  }
  const clouds=software?40:mobile?75:120
  for(let i=0;i<clouds;i++) {
    const angle=random()*Math.PI*2,radius=4+random()*8
    add(Math.cos(angle)*radius,(random()-.5)*2.8,Math.sin(angle)*radius,.22+random()*.28,2)
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,3))
  geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1))
  geometry.setAttribute('aKind',new THREE.Float32BufferAttribute(kinds,1))
  geometry.computeBoundingSphere()
  return {geometry,count:kinds.length,clusters,motes,clouds}
}

/** Fixed groves share geometry; foliage and fine grain retain one total budget. */
export function createSceneForest(scene: THREE.Scene, software: boolean, mobile: boolean, sharedFilm?: LightFilmUniforms) {
  const group=new THREE.Group()
  group.name='aether-forest'
  scene.add(group)
  const budget=software?7000:mobile?48000:180000
  const assets=createForestGeometry(budget,software,mobile)
  const fallback=sharedFilm?null:new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1)
  if(fallback){fallback.colorSpace=THREE.LinearSRGBColorSpace;fallback.needsUpdate=true}
  const film=sharedFilm??createLightFilmUniforms(fallback!)
  const neutralFlow=new THREE.DataTexture(new Uint8Array([128,128,0,255]),1,1)
  neutralFlow.needsUpdate=true
  const shared={
    uTime:{value:0}, uAspect:{value:1.6}, uExit:{value:-.35}, uEntry:{value:-.35},
    uDarkness:{value:0}, uPointer:{value:new THREE.Vector2(3,3)}, uPointerStrength:{value:0},
    uLightDepth:{value:0},uLightStrength:{value:1},
    uLightFilm:film.map,uLightFilmReady:film.ready,
    uPointerFlow:{value:neutralFlow as THREE.Texture},uFlowActive:{value:0},
    uViewportHeight:{value:900},uPixelRatio:{value:1},uAssembly:{value:0},
  }
  const materials: THREE.ShaderMaterial[]=[]
  const particleAssets=createForestParticles(assets,budget)
  const microGeometry=particleAssets.geometry
  const microMaterial=new THREE.ShaderMaterial({
    uniforms:shared,vertexShader:microVertex,fragmentShader:microFragment,depthWrite:true,depthTest:true,
    defines:{AETHER_LIGHT_FILM:1},
  })
  materials.push(microMaterial)
  const boundary=createBoundaryGeometry(software,mobile)
  const boundaryUniforms={...shared,uBoundaryStrength:{value:1}}
  const boundaryMaterial=new THREE.ShaderMaterial({
    uniforms:boundaryUniforms,vertexShader:boundaryVertex,fragmentShader:boundaryFragment,
    depthWrite:false,depthTest:true,defines:{AETHER_LIGHT_FILM:1},
  })
  materials.push(boundaryMaterial)
  const renderViewport=new THREE.Vector4()
  let currentProgress=0
  const groves=[0,1].map(index=>{
    const grove=new THREE.Group()
    grove.name=index?'aether-forest-lower':'aether-forest-upper'
    // Fixed heights span the two clearings. Their common parent turns the
    // foreground on drag; the separate world-space video remains in place.
    // Translate soil, branches and foliage together, independently of the wrapper.
    grove.position.y=sampleJourney(index?1:0).height+FOREST_GROVE_OFFSETS[index]
    grove.rotation.y=index?.83:0
    grove.rotation.z=index?Math.PI:0
    const micro=new THREE.Points(microGeometry,microMaterial)
    micro.name='aether-forest-microfoliage'
    micro.onBeforeRender=renderer=>{
      // Point diameters use the actual target viewport, including the lower
      // resolution glow pass, rather than accidentally enlarging its sprites.
      shared.uAssembly.value=sampleForestAssembly(currentProgress,index===1)
      renderer.getCurrentViewport(renderViewport)
      shared.uViewportHeight.value=renderViewport.w
      shared.uPixelRatio.value=renderViewport.w/(typeof window==='undefined'?900:Math.max(1,window.innerHeight))
    }
    const edge=new THREE.Points(boundary.geometry,boundaryMaterial)
    edge.name='aether-forest-boundary-plants-motes-mist'
    edge.position.y=FOREST_FLOOR_Y
    edge.frustumCulled=false
    edge.onBeforeRender=micro.onBeforeRender
    micro.frustumCulled=false
    grove.add(micro,edge)
    group.add(grove)
    return grove
  })
  group.userData.particleBudget=particleAssets.total
  group.userData.barkParticles=particleAssets.barkCount
  group.userData.worldSpace=true
  group.userData.treeCount=assets.treeCount
  group.userData.foliageClusterCount=assets.foliageClusterCount
  group.userData.drawCalls=2
  group.userData.boundary= {clusters:boundary.clusters,motes:boundary.motes,clouds:boundary.clouds,count:boundary.count}
  let disposed=false
  return {
    group,
    update(time:number,progress:number,camera:THREE.Camera,pointer?:ForestPointer,pixelRatio?:number) {
      if(disposed)return
      const p=Number.isFinite(progress)?THREE.MathUtils.clamp(progress,0,1):0
      currentProgress=p
      group.userData.assembly=sampleForestAssembly(p,p>.5)
      group.visible=p<.201||p>.854
      groves[0].visible=p<.201
      groves[1].visible=p>.854
      if(!group.visible)return
      const layers=sampleLayers(p)
      shared.uExit.value=layers.forestExit
      shared.uEntry.value=layers.forestEntry
      const lighting=sampleLightChoreography(time,p)
      shared.uTime.value=lighting.time
      shared.uLightDepth.value=lighting.depth
      shared.uLightStrength.value=lighting.cloudStrength
      boundaryUniforms.uBoundaryStrength.value=1
      shared.uDarkness.value=sampleJourney(p).darkness
      const projection=camera.projectionMatrix.elements
      const aspect=Math.abs(projection[5]/projection[0])
      shared.uAspect.value=Number.isFinite(aspect)&&aspect>0?aspect:1.6
      // Geometric leaves scale naturally with resolution; DPR does not resize
      // their world-space geometry. Preserve the existing renderer API.
      const ratio=Number.isFinite(pixelRatio)?THREE.MathUtils.clamp(pixelRatio!, .4, 2):1
      group.userData.pixelRatio=ratio
      shared.uPixelRatio.value=ratio
      shared.uViewportHeight.value=(typeof window==='undefined'?900:window.innerHeight)*ratio
      // Bind the small neutral flow even before first input so preparation
      // executes the sampler path instead of discovering it on mouse move.
      shared.uPointerFlow.value=pointer?.flowTexture??neutralFlow
      if(pointer&&pointer.active!==false&&Number.isFinite(pointer.ndc.x)&&Number.isFinite(pointer.ndc.y)&&Number.isFinite(pointer.strength)) {
        shared.uPointer.value.copy(pointer.ndc)
        shared.uPointerStrength.value=THREE.MathUtils.clamp(pointer.strength,0,1)
        shared.uFlowActive.value=pointer.flowTexture?1:0
      } else {
        shared.uPointerStrength.value=0
        shared.uFlowActive.value=0
      }
    },
    dispose() {
      if(disposed)return
      disposed=true
      group.removeFromParent()
      groves.forEach(grove=>grove.children.forEach(mesh=>{if(mesh instanceof THREE.InstancedMesh)mesh.dispose()}))
      assets.barkGeometry.dispose()
      assets.leafGeometry.dispose()
      microGeometry.dispose()
      boundary.geometry.dispose()
      materials.forEach(material=>material.dispose())
      fallback?.dispose()
      neutralFlow.dispose()
      group.clear()
    },
  }
}
