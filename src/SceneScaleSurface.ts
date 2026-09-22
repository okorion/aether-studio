import * as THREE from 'three'
import { lightChoreographyGLSL, type LightFilmUniforms } from './SceneLighting'

/** Seeded metal wear, packed as oxidation / roughness / relief. No image fetch. */
function createScaleFinish() {
  const size = 256
  const pixels = new Uint8Array(size * size * 4)
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const noise = (x: number, y: number, period: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
    const h = (dx: number, dy: number) => hash((ix + dx) % period, (iy + dy) % period)
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(0, 0), h(1, 0), u),
      THREE.MathUtils.lerp(h(0, 1), h(1, 1), u), v)
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const broad = noise(x / 32, y / 32, 8)
    const pits = noise(x / 4, y / 4, 64)
    const grain = hash(x, y)
    const scratch = Math.pow(noise(x / 2, y / 32, 128), 5)
    const offset = (y * size + x) * 4
    pixels[offset] = Math.round((broad * .55 + pits * .30 + grain * .15) * 255)
    pixels[offset + 1] = Math.round((pits * .65 + grain * .35) * 255)
    pixels[offset + 2] = Math.round(Math.max(0, pits * .63 + grain * .27 - scratch * .2) * 255)
    pixels[offset + 3] = 255
  }
  const texture = new THREE.DataTexture(pixels, size, size)
  texture.name = 'aether-scale-metal-wear'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export type ScaleSurfaceUniforms = {
  pointerNdc: { value: THREE.Vector2 }
  pointerStrength: { value: number }
  pointerAspect: { value: number }
  pointerFlow: { value: THREE.Texture }
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
  const finish = createScaleFinish()
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xb4b5bb,
    metalness: software ? .45 : .86,
    roughness: software ? .46 : .27,
    envMapIntensity: 1.10,
    clearcoat: software ? 0 : .12,
    clearcoatRoughness: .31,
    iridescence: software ? 0 : .62,
    iridescenceIOR: 1.36,
    iridescenceThicknessRange: [145, 475],
    transparent: true,
  })
  if (filmEnabled) material.defines = { AETHER_LIGHT_FILM: 1 }
  material.addEventListener('dispose', () => finish.dispose())

  material.onBeforeCompile = shader => {
    shader.uniforms.uSurfacePointer = uniforms.pointerNdc
    shader.uniforms.uSurfaceStrength = uniforms.pointerStrength
    shader.uniforms.uSurfaceAspect = uniforms.pointerAspect
    shader.uniforms.uSurfaceFlow = uniforms.pointerFlow
    shader.uniforms.uSurfaceTime = uniforms.surfaceTime
    shader.uniforms.uScaleFinish = { value: finish }
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
      uniform sampler2D uSurfaceFlow;
      varying float vSurfaceHeat;
      varying vec3 vTilePoint;
      varying vec3 vTileFinish;
      varying vec2 vSheetPoint;
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
      vec2 tileScreen = tileClip.xy / max(tileClip.w, .001) * .5 + .5;
      vec2 tileFlow = (texture2D(uSurfaceFlow, clamp(tileScreen, 0., 1.)).rg
        - vec2(128. / 255.)) * (255. / 127.);
      float trail = clamp(length(tileFlow) * 4.5, 0., 1.);
      vSurfaceHeat = max(exp(-dot(tileDelta, tileDelta) * 20.0) * uSurfaceStrength, trail)
        * step(.001, tileClip.w);
      // Ring waves roll individual facets through their edge and back face.
      // The shared input field retains the wake after the cursor has moved on.
      float tileRadius = length(tileCentre.xy);
      float tilePhase = tileRadius * 2.9 - uSurfaceTime * .72;
      float tileAngle = (sin(tilePhase) * .5 + .5) * 6.283185;
      tileAngle += vSurfaceHeat * 1.8 + (tileFlow.x - tileFlow.y) * .65;
      vec2 radial = tileCentre.xy / max(tileRadius, .001);
      vec3 tileAxis = tileRadius > .001 ? vec3(radial.y, -radial.x, 0.) : vec3(0., 1., 0.);
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
      vSheetPoint = tileCentre.xy + aArmour.xy * tileUnit;
      float tileRipple = (.28 + sin(tilePhase) * .48) * (1. - smoothstep(.4, 6., tileRadius));
      transformed.z += (tileRipple + vSurfaceHeat * .28) / tileUnit;
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
      varying vec2 vSheetPoint;
      uniform sampler2D uScaleFinish;
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
      // A weathered continuous finish crosses tile boundaries; the small grain
      // stays attached to the metal instead of crawling with the animation.
      vec3 scaleWear = texture2D(uScaleFinish, vSheetPoint * .31).rgb;
      diffuseColor.rgb *= scaleFinishTint * mix(.48, 1.38, scaleWear.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.19, .86, .68),
        smoothstep(.55, .82, scaleWear.r) * .45);
      diffuseColor.rgb *= 1. + vSurfaceHeat * .12;
    `)
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */ `
      #include <roughnessmap_fragment>
      // Adjacent satin and polished tiles catch different widths of reflection.
      float scaleSatin = smoothstep(.24, .86, vTileFinish.y);
      roughnessFactor = clamp(roughnessFactor + scaleSatin * .12 + (scaleWear.g - .5) * .23
        - (1. - scaleSatin) * .065 - vSurfaceHeat * .055, .17, .52);
    `)
    if (!software) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', /* glsl */ `
        #include <normal_fragment_maps>
        float scaleFootprint = max(length(dFdx(vTilePoint)), length(dFdy(vTilePoint)));
        float scaleDetailFade = 1. - smoothstep(.025, .09, scaleFootprint);
        float scaleHammer = sin(vTilePoint.x * 63. + sin(vTilePoint.y * 43.) * 1.4)
          * sin(vTilePoint.y * 67. + cos(vTilePoint.x * 29.));
        float scaleBrush = sin(vTilePoint.x * 153. + vTilePoint.y * 13.);
        float scaleRelief = (scaleWear.b * .006 + scaleHammer * .00035 + scaleBrush * .00012) * scaleDetailFade;
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
      // Pointer response changes the metal's angle and reflected light. Adding
      // a colored emissive wash here would flatten its facets into pastel tiles.
      ${filmEnabled ? /* glsl */ `
        vec3 scaleFilm = aetherFilmRadiance(vTileWorld);
        totalEmissiveRadiance += scaleFilm * .10 * (1. - clamp(uScaleDepth, 0., 1.) * .25);
      ` : ''}
    `)
  }
  material.customProgramCacheKey = () =>
    `aether-scale-radial-${software ? 'lite' : 'detailed'}-${filmEnabled ? 'film' : 'static'}-v3`
  return material
}
