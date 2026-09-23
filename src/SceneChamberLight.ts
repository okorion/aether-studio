import * as THREE from 'three'
import { REACTOR } from './Reactor'

/** Authored aperture haze; no texture, shadow map or extra scene capture. */
export function createChamberLight(space: THREE.Group, scene: THREE.Scene) {
  const exit = REACTOR.apertureY - REACTOR.capThickness * .5
  const bottom = -3.62
  const length = exit - bottom
  const geometry = new THREE.CylinderGeometry(REACTOR.apertureRadius * .86, 2.45, length, 48, 1, true)
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float ends=smoothstep(0.,.18,vUv.y)*(1.-smoothstep(.92,1.,vUv.y));
        float strands=.65+.35*pow(.5+.5*sin(vUv.x*75.398),4.);
        gl_FragColor=vec4(vec3(.36,.53,.49),ends*strands*uOpacity*pow(abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),1.6));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const beam = new THREE.Mesh(geometry, material)
  beam.name = 'aether-aperture-light-shaft'
  beam.position.y = (exit + bottom) * .5
  space.add(beam)
  // The light stays in the scene even at zero intensity: shader light counts
  // must not change when crossing a curtain or preparing a hidden chamber.
  const light = new THREE.SpotLight(0xc6e4d5, 0, length, Math.atan(2.45 / length), .8, 1.4)
  light.name = 'aether-aperture-light'
  light.position.set(0, REACTOR.worldY + exit, 0)
  light.target.position.set(0, REACTOR.worldY + bottom, 0)
  scene.add(light, light.target)
  let disposed = false
  return {
    update(weight: number) {
      if (disposed) return
      material.uniforms.uOpacity.value = weight * .055
      light.intensity = weight * 24
      beam.visible = weight > .001
    },
    dispose() {
      if (disposed) return
      disposed = true
      beam.removeFromParent(); light.removeFromParent(); light.target.removeFromParent()
      geometry.dispose(); material.dispose()
    },
  }
}
