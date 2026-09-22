import * as THREE from 'three'
import { lightChoreographyGLSL, type LightFilmUniforms } from './SceneLighting'

export type ScaleSurfaceUniforms = {
  pointerNdc: { value: THREE.Vector2 }
  pointerStrength: { value: number }
  pointerAspect: { value: number }
  surfaceTime: { value: number }
  lightDepth: { value: number }
}

/** One material for the existing instanced hexagons; the caller owns disposal. */
export function createScaleSurface(
  software: boolean,
  uniforms: ScaleSurfaceUniforms,
  lightFilm?: LightFilmUniforms,
) {
  const filmEnabled = !software && Boolean(lightFilm)
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x93969e,
    metalness: software ? .45 : .96,
    roughness: software ? .46 : .30,
    envMapIntensity: .72,
    clearcoat: software ? 0 : .065,
    clearcoatRoughness: .31,
    iridescence: software ? 0 : .62,
    iridescenceIOR: 1.36,
    iridescenceThicknessRange: [145, 475],
    transparent: true,
  })
  if (filmEnabled) material.defines = { AETHER_LIGHT_FILM: 1 }

  material.onBeforeCompile = shader => {
    shader.uniforms.uSurfacePointer = uniforms.pointerNdc
    shader.uniforms.uSurfaceStrength = uniforms.pointerStrength
    shader.uniforms.uSurfaceAspect = uniforms.pointerAspect
    shader.uniforms.uSurfaceTime = uniforms.surfaceTime
    if (lightFilm && filmEnabled) {
      shader.uniforms.uLightFilm = lightFilm.map
      shader.uniforms.uLightFilmReady = lightFilm.ready
      shader.uniforms.uScaleDepth = uniforms.lightDepth
    }
    shader.vertexShader = /* glsl */ `
      attribute vec3 aArmour;
      attribute vec3 aArmourNormal;
      uniform vec2 uSurfacePointer;
      uniform float uSurfaceStrength;
      uniform float uSurfaceAspect;
      uniform float uSurfaceTime;
      varying float vSurfaceHeat;
      varying vec3 vTilePoint;
      varying vec3 vTileFinish;
      ${filmEnabled ? 'varying vec3 vTileWorld;' : ''}
    ` + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', /* glsl */ `
      #include <beginnormal_vertex>
      vec4 tileCentre = vec4(0.0, 0.0, 0.0, 1.0);
      float tileUnit = 1.0;
      #ifdef USE_INSTANCING
        tileCentre = instanceMatrix * tileCentre;
        tileUnit = max(length(instanceMatrix[0].xyz), .001);
      #endif
      vec4 tileClip = projectionMatrix * modelViewMatrix * tileCentre;
      vec2 tileDelta = (tileClip.xy / max(tileClip.w, .001) - uSurfacePointer)
        * vec2(uSurfaceAspect, 1.0);
      vSurfaceHeat = exp(-dot(tileDelta, tileDelta) * 20.0) * uSurfaceStrength
        * step(.001, tileClip.w);
      // Broad asymmetric folds vary reflected normals; preserve pointer lift.
      float tilePhase = tileCentre.x * .48 + tileCentre.y * .31 - uSurfaceTime * .13;
      float tileAngle = cos(tilePhase) * .42
        + sin(tileCentre.y * .63 + uSurfaceTime * .09) * .17;
      vec3 tileAxis = normalize(vec3(-.31, .48, 0.0));
      float tileCos = cos(tileAngle);
      float tileSin = sin(tileAngle);
      objectNormal = aArmourNormal * tileCos + cross(tileAxis, aArmourNormal) * tileSin
        + tileAxis * dot(tileAxis, aArmourNormal) * (1.0 - tileCos);
      objectNormal = normalize(objectNormal + vec3(tileDelta * vSurfaceHeat * .20, 0.0));
      // The finish belongs to each tile; it does not drift with the light/time.
      // Broad diagonal domains avoid the previous concentric pattern.
      vTileFinish = vec3(
        .5 + .5 * sin(tileCentre.x * .61 + tileCentre.y * .29),
        fract(sin(dot(tileCentre.xy, vec2(12.9898, 78.233))) * 43758.5453),
        .5 + .5 * sin(tileCentre.x * .37 - tileCentre.y * .53 + 1.7)
      );
    `)
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
      vec3 transformed = aArmour * tileCos + cross(tileAxis, aArmour) * tileSin
        + tileAxis * dot(tileAxis, aArmour) * (1.0 - tileCos);
      vTilePoint = aArmour;
      float tileRipple = sin(tilePhase) * .42
        + sin(tileCentre.y * .63 + uSurfaceTime * .09) * .17;
      transformed.z += (tileRipple + vSurfaceHeat * .36) / tileUnit;
      transformed.y += sin(uSurfaceTime * 1.4 + tileCentre.x * 2.0) * vSurfaceHeat * .045;
      ${filmEnabled ? /* glsl */ `
        vec4 scalePoint = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          scalePoint = instanceMatrix * scalePoint;
        #endif
        vTileWorld = (modelMatrix * scalePoint).xyz;
      ` : ''}
    `)
    shader.fragmentShader = /* glsl */ `
      varying float vSurfaceHeat;
      varying vec3 vTilePoint;
      varying vec3 vTileFinish;
      ${filmEnabled ? /* glsl */ `
        varying vec3 vTileWorld;
        uniform float uScaleDepth;
        ${lightChoreographyGLSL}
      ` : ''}
    ` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      // Keep most of the base neutral so actual reflections remain legible.
      // The existing instance colors still supply the large silver/gold fields.
      vec3 scaleFinishTint = mix(vec3(.88, .94, 1.), vec3(1., .93, .78),
        smoothstep(.38, .91, vTileFinish.x) * .46);
      scaleFinishTint = mix(scaleFinishTint, vec3(.83, .78, 1.),
        smoothstep(.54, .92, vTileFinish.z) * .24);
      diffuseColor.rgb *= scaleFinishTint;
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */ `
      #include <roughnessmap_fragment>
      // Adjacent satin and polished tiles catch different widths of reflection.
      float scaleSatin = smoothstep(.24, .86, vTileFinish.y);
      roughnessFactor = clamp(roughnessFactor + scaleSatin * .16
        - (1. - scaleSatin) * .085 - vSurfaceHeat * .065, .19, .60);
    `)
    if (!software) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', /* glsl */ `
        #include <normal_fragment_maps>
        float scaleFootprint = max(length(dFdx(vTilePoint)), length(dFdy(vTilePoint)));
        float scaleDetailFade = 1. - smoothstep(.008, .035, scaleFootprint);
        float scaleHammer = sin(vTilePoint.x * 63. + sin(vTilePoint.y * 43.) * 1.4)
          * sin(vTilePoint.y * 67. + cos(vTilePoint.x * 29.));
        float scaleBrush = sin(vTilePoint.x * 153. + vTilePoint.y * 13.);
        float scaleRelief = (scaleHammer * .00052 + scaleBrush * .00012) * scaleDetailFade;
        vec3 scaleDx = dFdx(-vViewPosition), scaleDy = dFdy(-vViewPosition);
        vec3 scaleRx = cross(scaleDy, normal), scaleRy = cross(normal, scaleDx);
        float scaleDet = dot(scaleDx, scaleRx);
        vec3 scaleGradient = dFdx(scaleRelief) * scaleRx + dFdy(scaleRelief) * scaleRy;
        normal = normalize(max(abs(scaleDet), .0000001) * normal
          - sign(scaleDet) * scaleGradient);
        roughnessFactor = clamp(roughnessFactor + scaleHammer * scaleDetailFade * .022, .19, .60);
      `)
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', /* glsl */ `
        #include <lights_physical_fragment>
        #ifdef USE_IRIDESCENCE
          material.iridescenceThickness = mix(iridescenceThicknessMinimum,
            iridescenceThicknessMaximum, clamp(vTileFinish.z * .76 + vTileFinish.y * .24, 0., 1.));
          material.iridescence *= .45 + vTileFinish.y * .55;
        #endif
      `)
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */ `
      #include <emissivemap_fragment>
      // Pointer light follows the same heat/lift; no extra interactive layer.
      totalEmissiveRadiance += mix(vec3(.035, .15, .18), vec3(.13, .065, .17),
        vTileFinish.z) * vSurfaceHeat;
      ${filmEnabled ? /* glsl */ `
        vec3 scaleFilm = aetherFilmRadiance(vTileWorld);
        totalEmissiveRadiance += scaleFilm * .075 * (1. - clamp(uScaleDepth, 0., 1.) * .25);
      ` : ''}
    `)
  }
  material.customProgramCacheKey = () =>
    `aether-scale-satin-${software ? 'lite' : 'detailed'}-${filmEnabled ? 'film' : 'static'}-v2`
  return material
}
