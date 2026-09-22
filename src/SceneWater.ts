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

    vec2 waterSlope(vec2 p, float t) {
      vec2 drift = vec2(
        sin(dot(p, vec2(.73, 1.31)) + t * .47),
        cos(dot(p, vec2(1.19, -.61)) - t * .31)
      );
      vec2 detail = vec2(
        sin(dot(p, vec2(5.2, 3.1)) - t * .61),
        cos(dot(p, vec2(2.8, -6.7)) + t * .53)
      );
      // Restrained expanding wavelets, rather than conspicuous circular decals.
      vec2 drop = p - vec2(-2.4, 3.7);
      float radius = length(drop);
      vec2 ripple = drop / max(radius, .2)
        * sin(radius * 8.3 - t * 1.1) * exp(-radius * .48)
        * (.5 + .5 * sin(t * .29));
      return drift * .035 + detail * .008 + ripple * .019;
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vWaterWorld.xz;
      vec2 slope = waterSlope(p, uTime);
      vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
      vec3 eye = normalize(cameraPosition - vWaterWorld);
      float facing = clamp(dot(normal, eye), 0., 1.);
      float fresnel = .035 + .965 * pow(1. - facing, 5.);
      float puddle = .62 + .20 * sin(p.x * .38 + sin(p.y * .46))
        + .12 * cos(p.y * .81 - p.x * .24);
      float shore = smoothstep(.24, .72, puddle);
      float edge = 1. - smoothstep(.465, .5, max(abs(vWaterUv.x - .5), abs(vWaterUv.y - .5)));
      vec3 water = vec3(.018, .036, .040);
      vec3 cloud = aetherLightCloud(vWaterWorld, normal, uTime, uLightDepth);
      // Transmission is alpha over the visible stone bed; there is no second
      // scene capture or screen-space refraction buffer on any profile.
      water += cloud * (.055 + shore * .035);
      vec3 halfVector = normalize(eye + normalize(vec3(-.35, .8, -.25)));
      float glint = pow(max(0., dot(normal, halfVector)), 150.);
      water += vec3(.20, .32, .29) * glint * .32;
      if (uHasReflection > .5) {
        vec2 reflectionUv = vReflection.xy / max(vReflection.w, .0001);
        vec2 warped = clamp(reflectionUv + slope * (.023 + fresnel * .020), .002, .998);
        vec3 reflected = texture2D(tDiffuse, warped).rgb;
        reflected = mix(reflected, texture2D(tDiffuse,
          clamp(warped + slope * .032, .002, .998)).rgb, .24);
        reflected *= vec3(.80, .91, .90);
        water = mix(water, reflected, .30 + fresnel * .63);
      } else {
        // Mobile/software use the same moving normals and world-space light,
        // without allocating a reflection target or pretending to mirror objects.
        water += cloud * fresnel * .12;
      }
      float alpha = (.18 + fresnel * .61) * mix(.38, 1., shore) * edge * uOpacity;
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
