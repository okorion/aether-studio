import * as THREE from 'three'
import { sampleJourney } from './Journey'
import { sampleLayers } from './SceneLayers'
import { createForestGeometry } from './ForestGeometry'
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
    vec2 p=vClip.xy/vClip.w*vec2(uAspect,1.);
    float clearing=.025+.975*smoothstep(.20,.43,length(p));
    return wipe()*nearFade*clearing;
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

const forestVertex = /* glsl */ `
  ${sharedShader}
  ${forestFlowVertex}
  uniform float uLeaf;
  void main() {
    vSeed=instanceColor;
    vUv=uv;
    vec3 p=position;
    // Only leaf tips flex; trunks, roots and anchors remain in world space.
    p.z+=uLeaf*position.y*position.y*sin(uTime*.62+instanceColor.y*29.+instanceMatrix[3].y*.17)*.045;
    vec4 world=modelMatrix*instanceMatrix*vec4(p,1.);
    vec4 view=viewMatrix*world;
    // Leaves share the fine grains' delayed wake; woody anchors stay fixed.
    world.xyz+=forestFlow(view,instanceColor)*uLeaf*.6;
    view=viewMatrix*world;
    vWorld=world.xyz;
    vDepth=-view.z;
    mat3 axes=mat3(instanceMatrix);
    vec3 corrected=normal/vec3(dot(axes[0],axes[0]),dot(axes[1],axes[1]),dot(axes[2],axes[2]));
    vNormal=normalize(mat3(modelMatrix)*axes*corrected);
    vClip=projectionMatrix*view;
    gl_Position=vClip;
  }
`

const barkFragment = /* glsl */ `
  ${sharedShader}
  ${lightChoreographyGLSL}
  void main() {
    float coverage=groveCoverage();
    if(coverage<.003||coverage<hash(gl_FragCoord.xy)) discard;
    vec3 n=normalize(vNormal);
    float light=max(0.,dot(n,normalize(vec3(-.45,.8,.3))));
    float ridge=pow(.5+.5*sin(vUv.x*83.+noise(vUv*vec2(11.,23.))*3.4),5.);
    float grain=noise(vUv*vec2(120.,34.)+vSeed.y*19.);
    float moss=smoothstep(.38,.8,noise(vWorld.xz*2.+vWorld.y*.3))*max(0.,n.y+.38);
    vec3 bark=mix(vec3(.004,.007,.005),vec3(.014,.020,.007),vSeed.x);
    bark*=.33+light*.4;
    bark*=.83+ridge*.06+grain*.08;
    bark+=vec3(.004,.009,.003)*moss;
    bark+=aetherLightCloud(vWorld,n,uTime,uLightDepth)*uLightStrength*.028*(.5+grain*.5);
    bark+=vec3(.016,.033,.021)*pointerLight()*(.3+light*.7);
    gl_FragColor=vec4(finishForest(bark),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const leafFragment = /* glsl */ `
  ${sharedShader}
  ${lightChoreographyGLSL}
  void main() {
    float coverage=groveCoverage();
    if(coverage<.003||coverage<hash(gl_FragCoord.xy)) discard;
    vec3 n=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
    vec3 key=normalize(vec3(-.45,.8,.3));
    float diffuse=.20+max(0.,dot(n,key))*.65+max(0.,dot(-n,key))*.27;
    float vein=exp(-abs(vUv.x-.5)*52.)*.035;
    float rib=pow(.5+.5*sin(vUv.y*77.+abs(vUv.x-.5)*22.),10.)*.025;
    vec3 olive=mix(vec3(.008,.019,.003),vec3(.085,.12,.013),vSeed.x);
    vec3 green=mix(vec3(.004,.019,.008),vec3(.018,.073,.025),vSeed.x);
    vec3 pigment=mix(olive,green,smoothstep(.27,.75,vSeed.z));
    vec3 color=pigment*(diffuse+vein+rib)*2.;
    vec3 viewDir=normalize(cameraPosition-vWorld);
    float reflection=pow(max(0.,dot(n,normalize(key+viewDir))),24.);
    float rim=pow(1.-max(0.,dot(n,viewDir)),3.);
    color+=vec3(.019,.043,.014)*rim*(.25+diffuse);
    color+=vec3(.34,.43,.18)*reflection*(.10+vSeed.y*.17);
    color+=aetherLightCloud(vWorld,n,uTime,uLightDepth)*uLightStrength*(.18+rim*.10+reflection*.16);
    color+=vec3(.16,.38,.24)*pointerLight()*(.3+reflection);
    gl_FragColor=vec4(finishForest(color),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const microVertex = /* glsl */ `
  ${sharedShader}
  ${forestFlowVertex}
  attribute vec3 aSeed;
  attribute float aSize;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  void main() {
    vec3 p=position;
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
    float coverage=groveCoverage()*edge;
    if(coverage<.003||coverage<hash(gl_FragCoord.xy))discard;
    vec3 n=vec3(p,sqrt(max(0.,1.-r)));
    float light=max(0.,dot(n,normalize(vec3(-.4,.65,.65))));
    vec3 olive=mix(vec3(.014,.028,.003),vec3(.17,.22,.026),vSeed.x);
    vec3 green=mix(vec3(.006,.026,.009),vec3(.036,.13,.046),vSeed.x);
    vec3 color=mix(olive,green,smoothstep(.27,.75,vSeed.z))*(.3+light*.65);
    color+=vec3(.24,.31,.10)*pow(light,16.)*(.12+vSeed.y*.3);
    color+=aetherLightCloud(vWorld,vNormal,uTime,uLightDepth)*uLightStrength*(.13+light*.08);
    color+=vec3(.14,.35,.23)*pointerLight()*(.3+light*.4);
    gl_FragColor=vec4(finishForest(color),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Fixed groves share geometry; foliage and fine grain retain one total budget. */
export function createSceneForest(scene: THREE.Scene, software: boolean, mobile: boolean, sharedFilm?: LightFilmUniforms) {
  const group=new THREE.Group()
  group.name='aether-forest'
  scene.add(group)
  const budget=software?4500:mobile?18000:60000
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
    uViewportHeight:{value:900},uPixelRatio:{value:1},
  }
  const materials=[barkFragment,leafFragment].map((fragmentShader,i)=>new THREE.ShaderMaterial({
    uniforms:{...shared,uLeaf:{value:i}},vertexShader:forestVertex,fragmentShader,
    defines:{AETHER_LIGHT_FILM:1},
    side:i?THREE.DoubleSide:THREE.FrontSide,depthWrite:true,depthTest:true,
  }))
  const makeMesh=(leaves:boolean)=>{
    const matrices=leaves?assets.leafMatrices:assets.barkMatrices
    const colors=leaves?assets.leafColors:assets.barkColors
    const mesh=new THREE.InstancedMesh(leaves?assets.leafGeometry:assets.barkGeometry,materials[leaves?1:0],matrices.length/16)
    mesh.instanceMatrix.array.set(matrices)
    mesh.instanceMatrix.needsUpdate=true
    mesh.instanceColor=new THREE.InstancedBufferAttribute(colors,3)
    if(leaves)mesh.count=Math.floor(budget*.20)
    mesh.name=leaves?'aether-forest-leaf-fronds':'aether-forest-branches-roots'
    mesh.computeBoundingSphere()
    return mesh
  }
  const meshLeafCount=Math.floor(budget*.20)
  const microCount=budget-meshLeafCount
  const microPositions=new Float32Array(microCount*3)
  const microSizes=new Float32Array(microCount)
  for(let i=0;i<microCount;i++) {
    const start=(meshLeafCount+i)*16
    microPositions.set(assets.leafMatrices.subarray(start+12,start+15),i*3)
    microSizes[i]=Math.hypot(assets.leafMatrices[start+4],assets.leafMatrices[start+5],assets.leafMatrices[start+6])*.38
  }
  const microGeometry=new THREE.BufferGeometry()
  microGeometry.setAttribute('position',new THREE.BufferAttribute(microPositions,3))
  microGeometry.setAttribute('aSize',new THREE.BufferAttribute(microSizes,1))
  microGeometry.setAttribute('aSeed',new THREE.BufferAttribute(assets.leafColors.slice(meshLeafCount*3),3))
  microGeometry.computeBoundingSphere()
  const microMaterial=new THREE.ShaderMaterial({
    uniforms:shared,vertexShader:microVertex,fragmentShader:microFragment,depthWrite:true,depthTest:true,
    defines:{AETHER_LIGHT_FILM:1},
  })
  materials.push(microMaterial)
  const renderViewport=new THREE.Vector4()
  const groves=[0,1].map(index=>{
    const grove=new THREE.Group()
    grove.name=index?'aether-forest-lower':'aether-forest-upper'
    // Fixed anchors span the two forest clearings. They never copy camera
    // orientation or follow its orbit; scrolling travels through these trees.
    grove.position.y=sampleJourney(index?1:0).height
    grove.rotation.y=index?.83:0
    const micro=new THREE.Points(microGeometry,microMaterial)
    micro.name='aether-forest-microfoliage'
    micro.onBeforeRender=renderer=>{
      // Point diameters use the actual target viewport, including the lower
      // resolution glow pass, rather than accidentally enlarging its sprites.
      renderer.getCurrentViewport(renderViewport)
      shared.uViewportHeight.value=renderViewport.w
      shared.uPixelRatio.value=renderViewport.w/(typeof window==='undefined'?900:Math.max(1,window.innerHeight))
    }
    grove.add(makeMesh(false),makeMesh(true),micro)
    group.add(grove)
    return grove
  })
  group.userData.particleBudget=budget
  group.userData.worldSpace=true
  group.userData.treeCount=assets.treeCount
  group.userData.foliageClusterCount=assets.foliageClusterCount
  group.userData.drawCalls=3
  let disposed=false
  return {
    update(time:number,progress:number,camera:THREE.Camera,pointer?:ForestPointer,pixelRatio?:number) {
      if(disposed)return
      const p=Number.isFinite(progress)?THREE.MathUtils.clamp(progress,0,1):0
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
      materials.forEach(material=>material.dispose())
      fallback?.dispose()
      neutralFlow.dispose()
      group.clear()
    },
  }
}
