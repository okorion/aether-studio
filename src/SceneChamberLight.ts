import * as THREE from 'three'
import { REACTOR } from './Reactor'
import { lightChoreographyGLSL, type LightFilmUniforms } from './SceneLighting'

/** Authored aperture haze; no texture, shadow map or extra scene capture. */
export function createChamberLight(space: THREE.Group, scene: THREE.Scene, film?: LightFilmUniforms) {
  const exit = REACTOR.apertureY - REACTOR.capThickness * .5
  const bottom = -3.62
  const length = exit - bottom
  const geometry = new THREE.CylinderGeometry(REACTOR.apertureRadius * .86, 2.45, length, 48, 1, true)
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 },
      ...(film ? { uLightFilm: film.map, uLightFilmReady: film.ready } : {}) },
    defines: film ? { AETHER_LIGHT_FILM: 1 } : {},
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
      uniform float uTime;
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
      ${lightChoreographyGLSL}
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float ends=smoothstep(0.,.18,vUv.y)*(1.-smoothstep(.92,1.,vUv.y));
        float strands=.3+.7*pow(.5+.5*sin(vUv.x*75.398+sin(vUv.y*7.-uTime*.19)*1.4),4.);
        vec3 projected=aetherLightCloud(vWorld,vec3(0.,1.,0.),uTime,0.);
        #ifdef AETHER_LIGHT_FILM
          if(uLightFilmReady>.5) projected=aetherApertureFilm(vWorld)*3.;
        #endif
        float luminance=dot(projected,vec3(.2126,.7152,.0722));
        gl_FragColor=vec4(projected,ends*strands*uOpacity*(.25+luminance)*pow(abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),1.6));
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
  const light = new THREE.SpotLight(0xc6d5e4, 0, Math.hypot(length * REACTOR.heightScale, 2.45) * 1.5, Math.atan(2.45 / (length * REACTOR.heightScale)), .8, 1.4)
  light.name = 'aether-aperture-light'
  light.position.set(0, REACTOR.worldY + exit * REACTOR.heightScale, 0)
  light.target.position.set(0, REACTOR.worldY + bottom * REACTOR.heightScale, 0)
  scene.add(light, light.target)
  let disposed = false
  return {
    update(weight: number, time = 0) {
      if (disposed) return
      material.uniforms.uOpacity.value = weight * .018
      material.uniforms.uTime.value = time
      light.intensity = weight * 60 * (.72 + .28 * Math.sin(time * .37) ** 2)
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

/** The lower room keeps its point/directional lights behind the opaque floor. */
export function excludeChamberSpotlight(material: THREE.MeshStandardMaterial) {
  const previous = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    // The aperture light is the scene's only spotlight. Keep its stable light
    // count, but remove its direct contribution on the other side of the floor.
    const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
      'getSpotLightInfo( spotLight, geometryPosition, directLight );',
      'getSpotLightInfo( spotLight, geometryPosition, directLight ); directLight.color = vec3(0.);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lights)
  }
  material.customProgramCacheKey = () => `${previousKey}-below-chamber-floor-v1`
}
