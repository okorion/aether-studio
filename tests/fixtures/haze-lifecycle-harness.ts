import * as THREE from 'three'
import { createSceneInteraction } from '../../src/SceneInteraction'

export function probeHazeLifecycle(software = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42,1.6,.1,90)
  camera.position.z = 10; camera.updateMatrixWorld()
  const canvas = document.createElement('canvas'), link = document.createElement('a')
  link.href = '#work'; document.body.append(canvas,link)
  const input = createSceneInteraction(scene,camera,canvas,false,software)
  let elapsed = 0
  const state = (delta = 0, frameDelta = delta) => {
    const field = input.update(delta,elapsed+=delta,1,.4,frameDelta).field
    const bytes = field.hazeTexture?.image.data as Float32Array | undefined
    if (!bytes) return 0
    let mass = 0
    for(let i=2;i<bytes.length;i+=4)mass+=bytes[i]*255
    return mass
  }
  const move = (target: Element,x: number) => target.dispatchEvent(new PointerEvent('pointermove',{
    bubbles:true,pointerType:'mouse',clientX:x,clientY:innerHeight*.75,
  }))
  try {
    state()
    for(let i=0;i<12;i++){move(canvas,30+i*8);state(1/60)}
    const before = state()
    move(link,140)
    const hover = state()
    move(canvas,400)
    const reentry = state()
    const stalled = state(.016,.35)
    canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:100,clientY:100}))
    const touchStart = state()
    input.setActive(false)
    const inactive = state(.016)
    input.setActive(true)
    move(canvas,400)
    const resumed = state(.016)
    return {before,hover,reentry,stalled,touchStart,inactive,resumed}
  } finally {input.dispose();canvas.remove();link.remove()}
}
