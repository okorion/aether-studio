import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { createWaterSurface } from '../../src/SceneWater'
import { createSceneWorlds } from '../../src/SceneWorlds'
import { REACTOR } from '../../src/Reactor'
import { createChamberLight, excludeChamberSpotlight } from '../../src/SceneChamberLight'

export function probeChamber(mobile: boolean) {
  const scene = new THREE.Scene()
  const worlds = createSceneWorlds(scene, true, mobile)
  worlds.update(12, .72)
  scene.updateMatrixWorld(true)
  const roof = scene.getObjectByName('aether-chamber-aperture-roof') as THREE.Mesh
  const aperture = scene.getObjectByName('aether-machine-aperture') as THREE.Mesh
  const beam = scene.getObjectByName('aether-aperture-light-shaft') as THREE.Mesh
  const light = scene.getObjectByName('aether-aperture-light') as THREE.SpotLight
  const ray = new THREE.Raycaster(new THREE.Vector3(0, -39, 0), new THREE.Vector3(0, 1, 0))
  const centreHits = ray.intersectObjects([roof, aperture]).length
  ray.ray.origin.x = REACTOR.apertureRadius * 1.3
  const rimHits = ray.intersectObjects([roof, aperture]).length
  ray.ray.origin.x = 10
  const ceilingHits = ray.intersectObject(roof).length
  const lightPosition = light.getWorldPosition(new THREE.Vector3()).toArray()
  const beamBounds = new THREE.Box3().setFromObject(beam)
  const floorEdgeDistance = Math.hypot(light.position.y - (REACTOR.worldY - 3.635), 2.45)
  const reachesFloorEdge = light.distance > floorEdgeDistance
  const matrices = [beam, roof].map(o=>o.matrixWorld.toArray())
  worlds.update(18,.83); worlds.update(22,.66); worlds.update(12,.72);scene.updateMatrixWorld(true)
  const reverse = [beam, roof].map(o=>o.matrixWorld.toArray())
  let disposed = 0
  beam.geometry.addEventListener('dispose',()=>disposed++)
  ;(beam.material as THREE.Material).addEventListener('dispose',()=>disposed++)
  worlds.dispose()
  return { centreHits, rimHits, ceilingHits, lightPosition, beamTop: beamBounds.max.y, reachesFloorEdge, matrices, reverse, disposed,
    lightRemoved: !light.parent && !light.target.parent, sceneChildren: scene.children.length }
}

export function probeWater(reflection: boolean) {
  const renderer = new THREE.WebGLRenderer({antialias:false})
  renderer.setSize(192,128)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020608)
  const mirror = reflection ? new Reflector(new THREE.PlaneGeometry(14,14), {textureWidth:128,textureHeight:128,multisample:0}) : null
  const water = createWaterSurface(mirror,14,14)
  water.surface.rotation.x=-Math.PI/2
  scene.add(water.surface)
  const cubeGeo = new THREE.BoxGeometry(1.3,2,1.3)
  const cubeMat = new THREE.MeshBasicMaterial({color:0xc1e7d8})
  for(const x of [-3,0,3]){const cube=new THREE.Mesh(cubeGeo,cubeMat);cube.position.set(x,1,-2);scene.add(cube)}
  const camera = new THREE.PerspectiveCamera(48,1.5,.1,60)
  camera.position.set(0,4,8);camera.lookAt(0,0,0);camera.updateMatrixWorld()
  const target = new THREE.WebGLRenderTarget(192,128)
  const render=(time:number)=>{
    water.update(time,.72,1,true,camera)
    renderer.setRenderTarget(target);renderer.render(scene,camera)
    const pixels=new Uint8Array(192*128*4);renderer.readRenderTargetPixels(target,0,0,192,128,pixels)
    return pixels
  }
  const a=render(10), stopped=render(10), b=render(12), restored=render(10)
  const delta=(x:Uint8Array,y:Uint8Array)=>x.reduce((sum,v,i)=>sum+Math.abs(v-y[i]),0)
  const result={moving:delta(a,b),stopped:delta(a,stopped),restored:delta(a,restored),reflection}
  water.dispose();mirror?.dispose();cubeGeo.dispose();cubeMat.dispose();target.dispose();renderer.dispose();renderer.forceContextLoss()
  return result
}

export function probeSpotlightFloor() {
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setSize(128, 128)
  const target = new THREE.WebGLRenderTarget(128, 128)
  const scene = new THREE.Scene()
  const space = new THREE.Group()
  space.position.y = REACTOR.worldY
  scene.add(space)
  const chamberLight = createChamberLight(space, scene)
  scene.getObjectByName('aether-aperture-light-shaft')!.visible = false
  const ambient = new THREE.AmbientLight(0xffffff, .1)
  scene.add(ambient)
  const geometry = new THREE.PlaneGeometry(6, 6)
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: .7 })
  const belowMaterial = floorMaterial.clone()
  excludeChamberSpotlight(belowMaterial)
  const plane = new THREE.Mesh(geometry, floorMaterial)
  plane.rotation.x = -Math.PI / 2
  scene.add(plane)
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 50)
  const pixels = (height: number, lit: boolean, below: boolean) => {
    plane.position.y = height
    plane.material = below ? belowMaterial : floorMaterial
    camera.position.set(0, height + 5, 2)
    camera.lookAt(0, height, 0)
    chamberLight.update(lit ? 1 : 0)
    scene.getObjectByName('aether-aperture-light-shaft')!.visible = false
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    const bytes = new Uint8Array(128 * 128 * 4)
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, bytes)
    return bytes
  }
  const delta = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0)
  const floor = delta(pixels(-44.1, true, false), pixels(-44.1, false, false))
  const belowControl = delta(pixels(-45.3, true, false), pixels(-45.3, false, false))
  const below = delta(pixels(-45.3, true, true), pixels(-45.3, false, true))
  chamberLight.dispose(); geometry.dispose(); floorMaterial.dispose(); belowMaterial.dispose()
  target.dispose(); renderer.dispose(); renderer.forceContextLoss()
  return { floor, belowControl, below }
}
