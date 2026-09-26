import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { createSceneLightShafts } from '../src/SceneLightShafts'
import { createSceneForest } from '../src/SceneForest'
import { createLightFilmUniforms } from '../src/SceneLighting'
import { sampleJourney } from '../src/Journey'
import { sampleLayers } from '../src/SceneLayers'
import { curtainHasCoverage } from '../src/SceneVisibility'
import { REACTOR } from '../src/Reactor'

test('@interaction upright curved films clear the actual forest floor and ceiling by a small world-space gap', () => {
  const scene=new THREE.Scene(),texture=new THREE.Texture()
  const forest=createSceneForest(scene,true,false)
  const shafts=createSceneLightShafts(scene,false,false,createLightFilmUniforms(texture))
  try {
    scene.updateMatrixWorld(true)
    const film=scene.getObjectByName('aether-curved-light-film') as THREE.InstancedMesh
    const matrix=new THREE.Matrix4()
    for(const [index,name] of [[0,'upper'],[1,'lower']] as const) {
      const grove=scene.getObjectByName(`aether-forest-${name}`)!
      const boundary=grove.getObjectByName('aether-forest-boundary-plants-motes-mist')!.getWorldPosition(new THREE.Vector3()).y
      film.getMatrixAt(index,matrix)
      const top=new THREE.Vector3(0,.5,0).applyMatrix4(matrix).y
      const bottom=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix).y
      expect(top).toBeGreaterThan(bottom)
      expect(index===0?bottom-boundary:boundary-top).toBeCloseTo(.45,4)
      const vertices=film.geometry.getAttribute('position')
      for(let i=0;i<vertices.count;i++) {
        const y=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(matrix).y
        if(index===0)expect(y).toBeGreaterThan(boundary+.44)
        else expect(y).toBeLessThan(boundary-.44)
      }
    }
  } finally {forest.dispose();shafts.dispose();texture.dispose()}
})

test('@interaction the water is fully masked before its camera crossing without stopping the chamber descent', () => {
  const surfaceY=REACTOR.worldY-3.635*REACTOR.heightScale
  for(let i=0;i<=800;i++) {
    const p=.70+i*.0001,j=sampleJourney(p),layers=sampleLayers(p)
    if(!curtainHasCoverage(layers.monitorExit,layers.deviceExit))continue
    for(const mobile of [false,true]) {
      const cameraY=j.height+Math.sin(j.elevation)*(j.radius+(mobile?4.8:0))
      if(cameraY-surfaceY<=.30) {
        // A level camera projects all water below the horizon; include the
        // full screen width so the slanted edge and its conservative margin
        // must clear every water pixel before its near-eye fade starts.
        expect(j.elevation).toBe(0)
        expect(curtainHasCoverage(layers.monitorExit,layers.deviceExit,0,1,0,.5),`water crossing at ${p}`).toBe(false)
      }
    }
  }
})
