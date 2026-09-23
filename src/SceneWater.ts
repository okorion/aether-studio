import * as THREE from 'three'
import type { Reflector } from 'three/addons/objects/Reflector.js'
import { lightChoreographyGLSL, sampleLightChoreography } from './SceneLighting'
import { createCurtainVisibility, curtainHasCoverage } from './SceneVisibility'

/** A shallow water skin. Desktop reuses the existing planar reflection pass. */
export function createWaterSurface(
  reflector: Reflector | null,
  width: number,
  depth: number,
) {
  const geometry = reflector ? null : new THREE.PlaneGeometry(width, depth)
  const material = reflector
    ? reflector.material as THREE.ShaderMaterial
    : new THREE.ShaderMaterial()
  const surface = reflector ?? new THREE.Mesh(geometry!, material)
  surface.name = 'aether-shallow-water'
  material.name = 'aether-shallow-water-material'
  const time = { value: 0 }
  const lightDepth = { value: 0 }
  const opacity = { value: 0 }
  Object.assign(material.uniforms, {
    uTime: time,
    uLightDepth: lightDepth,
    uOpacity: opacity,
    uHasReflection: { value: reflector ? 1 : 0 },
  })
  if (!reflector) {
    material.uniforms.tDiffuse = { value: null }
    material.uniforms.textureMatrix = { value: new THREE.Matrix4() }
  }
  material.transparent = true
  material.depthWrite = false
  material.side = THREE.FrontSide
  material.vertexShader = /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflection;
    varying vec3 vWaterWorld;
    varying vec2 vWaterUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vReflection = textureMatrix * vec4(position, 1.);
      vWaterWorld = (modelMatrix * vec4(position, 1.)).xyz;
      vWaterUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      #include <logdepthbuf_vertex>
    }
  `
  material.fragmentShader = /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uHasReflection;
    uniform float uTime;
    uniform float uLightDepth;
    uniform float uOpacity;
    varying vec4 vReflection;
    varying vec3 vWaterWorld;
    varying vec2 vWaterUv;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    ${lightChoreographyGLSL}

    float waterHash(vec2 p) {
      return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
    }
    float waterNoise(vec2 p) {
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(waterHash(i),waterHash(i+vec2(1.,0.)),f.x),
        mix(waterHash(i+vec2(0.,1.)),waterHash(i+1.),f.x),f.y);
    }
    vec2 waterSlope(vec2 p, float t) {
      vec2 flow=p-vec2(.12,-.07)*t;
      float warp=waterNoise(flow*.7)*3.;
      // Crossing long swells and short capillary waves break reflected edges
      // into irregular moving facets instead of sliding a striped decal.
      vec2 slope=vec2(0.);
      for(int i=0;i<4;i++) {
        float octave=float(i),angle=.7+octave*2.17;
        vec2 direction=vec2(cos(angle),sin(angle));
        float frequency=1.3*pow(2.35,octave);
        float phase=dot(flow,direction)*frequency+warp-t*(.45+octave*.23);
        slope+=direction*cos(phase)*(.16/(1.+octave*.65));
      }
      slope+=vec2(waterNoise(flow*18.),waterNoise(flow.yx*21.+13.))*.065-.0325;
      return slope;
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vWaterWorld.xz;
      vec2 slope = waterSlope(p, uTime);
      vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
      vec3 eye = normalize(cameraPosition - vWaterWorld);
      float facing = clamp(dot(normal, eye), 0., 1.);
      float fresnel = .035 + .965 * pow(1. - facing, 5.);
      float shore = smoothstep(.10, .55, waterNoise(p*.24));
      float edge = 1. - smoothstep(.465, .5, max(abs(vWaterUv.x - .5), abs(vWaterUv.y - .5)));
      vec3 water = vec3(.008, .019, .018);
      // Advected broken highlights make the flow readable without reflection
      // targets on mobile/software. The aperture's pool stays world anchored.
      vec2 flow = p - vec2(.19, -.11) * uTime;
      float crests = pow(max(0.,1.-abs(slope.x+slope.y)*3.),14.);
      float pool = exp(-dot(p, p) * .045);
      float breakup = smoothstep(.3,.75,waterNoise(flow*4.));
      water += vec3(.15,.32,.25)*crests*breakup*(.14+pool*.55);
      vec3 cloud = aetherLightCloud(vWaterWorld, normal, uTime, uLightDepth);
      // Transmission is alpha over the visible stone bed; there is no second
      // scene capture or screen-space refraction buffer on any profile.
      water += cloud * (.055 + shore * .035);
      vec3 halfVector = normalize(eye + normalize(vec3(-.35, .8, -.25)));
      float glint = pow(max(0., dot(normal, halfVector)), 95.);
      water += vec3(.48,.65,.61)*glint*.75;
      if (uHasReflection > .5) {
        vec2 reflectionUv = vReflection.xy / max(vReflection.w, .0001);
        vec2 warped = clamp(reflectionUv + slope * (.025 + fresnel * .035), .002, .998);
        vec3 reflected = texture2D(tDiffuse, warped).rgb;
        reflected = mix(reflected, texture2D(tDiffuse,
          clamp(warped + slope * .009, .002, .998)).rgb, .12);
        reflected *= vec3(.72,.91,.83);
        water = mix(water, reflected, .58 + fresnel * .39);
      } else {
        // Mobile/software use the same moving normals and world-space light,
        // without allocating a reflection target or pretending to mirror objects.
        water += cloud * fresnel * .12;
      }
      float alpha = (.62 + fresnel * .35) * mix(.66, 1., shore) * edge * uOpacity;
      gl_FragColor = vec4(water, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
  material.needsUpdate = true
  const cameraWorld = new THREE.Vector3()
  const surfaceWorld = new THREE.Vector3()
  const visibility = createCurtainVisibility()
  surface.geometry.computeBoundingBox()
  let upper = 1.5, lower = -.5
  const reflect = surface.onBeforeRender
  if (reflector) surface.onBeforeRender = function (...args) {
    // Evaluate the camera of this actual render pass. The main camera must
    // not decide which geometry can contribute indirectly to a reflection.
    visibility.begin(args[2])
    if (!visibility.intersects(surface, upper, lower)) return
    reflect.apply(this, args)
  }

  return {
    surface,
    update(elapsed: number, progress: number, weight: number, aboveFloor: boolean, camera?: THREE.Camera,
      curtain?: { upper: number; lower: number }) {
      upper = curtain?.upper ?? 1.5
      lower = curtain?.lower ?? -.5
      time.value = elapsed
      lightDepth.value = sampleLightChoreography(elapsed, progress).depth
      let crossingFade = 1
      if (camera) {
        camera.getWorldPosition(cameraWorld)
        surface.getWorldPosition(surfaceWorld)
        crossingFade = THREE.MathUtils.smoothstep(cameraWorld.y - surfaceWorld.y, .035, .30)
      }
      opacity.value = weight * crossingFade
      surface.visible = aboveFloor && opacity.value > .015 && curtainHasCoverage(upper, lower)
    },
    dispose() {
      if (reflector) surface.onBeforeRender = reflect
      // Reflector's existing owner disposes its target, geometry and material.
      if (!reflector) {
        surface.removeFromParent()
        geometry?.dispose()
        material.dispose()
      }
    },
  }
}
