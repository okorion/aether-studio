import * as THREE from 'three'
import type { Reflector } from 'three/addons/objects/Reflector.js'
import { lightChoreographyGLSL, sampleLightChoreography, type LightFilmUniforms } from './SceneLighting'
import { REACTOR } from './Reactor'
import { createCurtainVisibility, curtainHasCoverage } from './SceneVisibility'

/** A shallow water skin. Desktop reuses the existing planar reflection pass. */
export function createWaterSurface(
  reflector: Reflector | null,
  width: number,
  depth: number,
  film?: LightFilmUniforms,
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
  const reflectionTarget = reflector?.getRenderTarget()
  const reflectionTexel = { value: new THREE.Vector2(
    1 / (reflectionTarget?.width ?? 1), 1 / (reflectionTarget?.height ?? 1),
  ) }
  Object.assign(material.uniforms, {
    uTime: time,
    uLightDepth: lightDepth,
    uOpacity: opacity,
    uHasReflection: { value: reflector ? 1 : 0 },
    uReflectionTexel: reflectionTexel,
    ...(film ? { uLightFilm: film.map, uLightFilmReady: film.ready } : {}),
  })
  if (film) material.defines = { ...material.defines, AETHER_LIGHT_FILM: 1 }
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
    varying vec4 vReflectionWorldX;
    varying vec4 vReflectionWorldZ;
    varying vec3 vWaterWorld;
    varying vec2 vWaterUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vReflection = textureMatrix * vec4(position, 1.);
      // Project world-space displacements through the same mirror camera as
      // the base point, before perspective division. The surface is a plane;
      // these two tangent vectors also account for its rotation and scale.
      vec3 tangent = modelMatrix[0].xyz;
      vec3 bitangent = modelMatrix[1].xyz;
      float tangentLength2 = max(dot(tangent, tangent), .000001);
      float bitangentLength2 = max(dot(bitangent, bitangent), .000001);
      vReflectionWorldX = textureMatrix * vec4(
        tangent.x / tangentLength2, bitangent.x / bitangentLength2, 0., 0.);
      vReflectionWorldZ = textureMatrix * vec4(
        tangent.z / tangentLength2, bitangent.z / bitangentLength2, 0., 0.);
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
    uniform vec2 uReflectionTexel;
    varying vec4 vReflection;
    varying vec4 vReflectionWorldX;
    varying vec4 vReflectionWorldZ;
    varying vec3 vWaterWorld;
    varying vec2 vWaterUv;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    ${lightChoreographyGLSL}

    float waterHash(vec2 p) {
      return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
    }
    vec2 waterGradient(vec2 p) {
      vec2 cell = floor(p), f = fract(p);
      vec2 blend = f*f*f*(f*(f*6.-15.)+10.);
      vec2 derivative = 30.*f*f*(f*(f-2.)+1.);
      float a = waterHash(cell), b = waterHash(cell+vec2(1.,0.));
      float c = waterHash(cell+vec2(0.,1.)), d = waterHash(cell+1.);
      return derivative * vec2(mix(b-a,d-c,blend.y), mix(c-a,d-b,blend.x));
    }
    vec2 waterSlope(vec2 p, float t, float footprint) {
      vec2 slope = vec2(0.);
      // Independent directions and drift speeds prevent the normal field from
      // reading as one sliding texture. Broad folds carry smaller, flatter
      // capillary ridges. Suppress subpixel octaves at the far edge of the pool.
      for (int i=0; i<4; i++) {
        float octave = float(i), angle = .37 + octave*2.31;
        vec2 along = vec2(cos(angle), sin(angle));
        vec2 across = vec2(-along.y, along.x);
        float frequency = .82 * pow(2.8, octave);
        vec2 stretch = vec2(1., mix(.72, .38, octave/3.));
        vec2 q = vec2(dot(p,along), dot(p,across))*frequency*stretch;
        q += vec2(.071+octave*.029, -.039+octave*.021)*t;
        q += vec2(octave*13.7, octave*7.3);
        vec2 gradient = waterGradient(q) * stretch;
        float resolved = 1.-smoothstep(.28, .85, footprint*frequency);
        slope += (along*gradient.x + across*gradient.y)
          * (.22 / (1.+octave*.85)) * resolved;
      }
      return slope;
    }
    vec3 waterReflection(vec4 projected, vec3 fallback) {
      // Clamping an out-of-frame UV repeats the last texel into a long bright
      // stripe. Missing mirror coverage fades to a valid base sample instead.
      if (projected.w <= .0001) return fallback;
      vec2 uv = projected.xy / projected.w;
      vec2 inset = min(uv, 1.-uv);
      float coverage = smoothstep(0., 2., min(
        inset.x / uReflectionTexel.x, inset.y / uReflectionTexel.y));
      if (coverage <= 0.) return fallback;
      return mix(fallback, texture2D(tDiffuse, uv).rgb, coverage);
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vWaterWorld.xz;
      float footprint = max(length(dFdx(p)), length(dFdy(p)));
      vec2 slope = waterSlope(p, uTime, footprint);
      vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
      vec3 eye = normalize(cameraPosition - vWaterWorld);
      float facing = clamp(dot(normal, eye), 0., 1.);
      float fresnel = .035 + .965 * pow(1. - facing, 5.);
      float edge = 1. - smoothstep(.465, .5, max(abs(vWaterUv.x - .5), abs(vWaterUv.y - .5)));
      vec3 water = vec3(.0008, .0015, .002);
      // Advected broken highlights make the flow readable without reflection
      // targets on mobile/software. The aperture's pool stays world anchored.
      float crests = pow(max(0.,1.-abs(slope.x+slope.y)*3.),14.);
      float pool = exp(-dot(p, p) * .16);
      vec3 cloud = aetherLightCloud(vWaterWorld, normal, uTime, uLightDepth);
      #ifdef AETHER_LIGHT_FILM
        if(uLightFilmReady>.5) cloud = aetherApertureFilm(vWaterWorld + vec3(slope.x,0.,slope.y)*.7)*4.;
      #endif
      water += cloud * pool * (.025 + crests * .07);
      vec3 aperture = vec3(0., ${REACTOR.worldY + REACTOR.apertureY * REACTOR.heightScale}, 0.);
      vec3 halfVector = normalize(eye + normalize(aperture - vWaterWorld));
      float glint = pow(max(0., dot(normal, halfVector)), 95.);
      water += (vec3(.22,.28,.31)+cloud)*glint*pool*1.2;
      if (uHasReflection > .5) {
        vec3 baseReflection = waterReflection(vReflection, water);
        float distanceToEye = length(cameraPosition-vWaterWorld);
        vec2 displacement = slope * (.20 + min(distanceToEye, 35.)*.022);
        vec4 distorted = vReflection + vReflectionWorldX*displacement.x
          + vReflectionWorldZ*displacement.y;
        vec3 reflected = waterReflection(distorted, baseReflection);
        // Preserve each reflected object's hue. Local reactor light belongs
        // in the captured scene; a global green tint would recolor the cables.
        water = mix(water, reflected, .86 + fresnel*.14);
      } else {
        // Mobile/software use the same moving normals and world-space light,
        // without allocating a reflection target or pretending to mirror objects.
        water += cloud * pool * fresnel * .18;
      }
      // Almost opaque, with only a small view-dependent glimpse of the bed.
      // This is alpha coverage, not a refraction or caustics approximation.
      float alpha = (.95 + fresnel*.045) * edge * uOpacity;
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
      time.value = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
      if (reflectionTarget) reflectionTexel.value.set(1 / reflectionTarget.width, 1 / reflectionTarget.height)
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
