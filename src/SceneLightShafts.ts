import * as THREE from 'three'
import { smooth, windowWeight } from './Journey'
import { sampleLayers } from './SceneLayers'
import { lightChoreographyGLSL, type LightFilmUniforms } from './SceneLighting'

// Close to the upper grove's floor and the inverted lower grove's ceiling.
export const FOREST_FILM_HEIGHTS = [-6.5, -52.8] as const

const boundaryGLSL = /* glsl */ `
  uniform vec4 uWeights;
  uniform float uForestExit;
  uniform float uForestEntry;
  uniform float uDeviceEntry;
  uniform float uTime;
  uniform vec2 uBoundaryMist;
  varying vec4 vClip;
  varying float vZone;
  float sceneWeight() {
    vec2 screen = vClip.xy / vClip.w * .5 + .5;
    float edge = screen.y - (screen.x - .5) * .20;
    if (vZone < .5) return uWeights.x * smoothstep(uForestExit - .006, uForestExit + .006, edge);
    if (vZone < 1.5) return uWeights.y * (1. - smoothstep(uForestEntry - .006, uForestEntry + .006, edge));
    // Ceiling light crosses the mechanical layer transition independently.
    return vZone < 2.5 ? uWeights.z * (1. - smoothstep(uDeviceEntry - .025, uDeviceEntry + .025, edge)) : uWeights.w;
  }
`

/** Fixed curved world-space film, behind the rotating foreground grove. */
export function createSceneLightShafts(
  scene: THREE.Scene, software: boolean, mobile: boolean, film: LightFilmUniforms,
  forestFilm: LightFilmUniforms = film,
) {
  const group = new THREE.Group()
  group.name = 'aether-film-backscatter'
  scene.add(group)
  const shared = {
    uLightFilm: film.map, uLightFilmReady: film.ready,
    uForestFilm: forestFilm.map, uForestFilmReady: forestFilm.ready,
    uTime: { value: 0 }, uWeights: { value: new THREE.Vector4() },
    uBoundaryMist: { value: new THREE.Vector2() },
    uForestExit: { value: -.35 }, uForestEntry: { value: -.35 },
    uDeviceEntry: { value: -.25 },
    uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
  }

  const backdropGeometry = new THREE.PlaneGeometry(1, 1, 48, 12)
  const vertices = backdropGeometry.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i)
    vertices.setZ(i, x * x * 32)
  }
  backdropGeometry.computeVertexNormals()
  const backdropMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, uLightFilm: forestFilm.map, uLightFilmReady: forestFilm.ready },
    defines: { AETHER_LIGHT_FILM: 1 },
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true,
    vertexShader: /* glsl */ `
      attribute float aZone;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vClip;
      varying float vZone;
      void main() {
        vUv = uv; vZone = aZone;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.);
        vWorld = world.xyz;
        vClip = projectionMatrix * viewMatrix * world;
        gl_Position = vClip;
      }
    `,
    fragmentShader: /* glsl */ `
      ${lightChoreographyGLSL}
      ${boundaryGLSL}
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        float weight = sceneWeight();
        if (weight < .001) discard;
        vec2 uv = vUv;
        // Keep the film's own shapes; geometric curvature supplies perspective.
        vec3 color = aetherFilmColor(uv);
        float luminance = dot(color, vec3(.2126, .7152, .0722));
        // Compress highlights without flattening the live-action silhouette.
        // Black film pixels remain black instead of becoming a uniform veil.
        color = color / (vec3(1.) + color * 1.9) * .72;
        float darkHold = smoothstep(.014, .13, luminance);
        float window = 1. - smoothstep(.24, .60, length((uv - .5) * vec2(1., 1.2)));
        float cloud = .60 + .40 * sin(vUv.x * 9.2 + sin(vUv.y * 4.7));
        float presence = smoothstep(.035, .32, luminance);
        float highlight = smoothstep(.22, .65, luminance);
        float edgeMist = vZone < .5 ? uBoundaryMist.x : uBoundaryMist.y;
        float alpha = weight * window * presence * (.30 + highlight * .32 + edgeMist * .08) * cloud * darkHold;
        if (uLightFilmReady < .5) {
          color = aetherLightCloud(vec3(vUv * 18., 0.), vec3(0., 1., 0.), uTime, vZone) * .22;
          alpha = weight * window * (.06 + edgeMist * .16) * cloud * .24;
        }
        gl_FragColor = vec4(color * 1.05, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const backdrop = new THREE.InstancedMesh(backdropGeometry, backdropMaterial, 2)
  backdrop.name = 'aether-curved-light-film'
  backdropGeometry.setAttribute('aZone', new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 1))
  const transform = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3(48, 27, 1)
  for (let i = 0; i < 2; i++) {
    rotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), i ? Math.PI : 0)
    transform.compose(new THREE.Vector3(0, FOREST_FILM_HEIGHTS[i], -14), rotation, scale)
    backdrop.setMatrixAt(i, transform)
  }
  backdrop.userData.worldSpace = true
  backdrop.frustumCulled = false
  backdrop.renderOrder = -4
  group.add(backdrop)

  const centers: number[] = [], sizes: number[] = [], seeds: number[] = [], zones: number[] = []
  const add = (x: number, top: number, z: number, width: number, height: number, zone: number, seed: number) => {
    centers.push(x, top - height * .5, z)
    sizes.push(width, height)
    zones.push(zone)
    seeds.push(seed)
  }
  const groveCount = mobile ? 4 : 7
  for (let zone = 0; zone < 2; zone++) for (let i = 0; i < groveCount; i++) {
    const angle = i * 2.39996 + zone * .83
    const radius = 6.1 + (i % 3) * 1.35
    add(Math.cos(angle) * radius, (zone ? -61.5 : 0) + 10.8 - (i % 3) * .75,
      Math.sin(angle) * radius, 4.0 + (i % 4) * .85, 15.0 + (i % 3) * 2.1, zone, i * .731 + zone * 4.7)
  }
  const chamberCount = mobile ? 3 : 5
  for (let i = 0; i < chamberCount; i++) {
    const x = -5.2 + i / Math.max(1, chamberCount - 1) * 10.4
    add(x, -37.14, -3.8 + (i % 3) * 1.6, 4.2 + (i % 3) * 1.0, 10.8, 2, 11 + i * .59)
    add(x * .84, -44.10, -3.4 + (i % 2) * 2.2, 5.5 + (i % 3) * .8, 9.5, 3, 17 + i * .83)
  }
  const fanGeometry = new THREE.InstancedBufferGeometry()
  const plane = new THREE.PlaneGeometry(1, 1, 1, 1)
  fanGeometry.setIndex(plane.index!.clone())
  fanGeometry.setAttribute('position', plane.getAttribute('position').clone())
  fanGeometry.setAttribute('uv', plane.getAttribute('uv').clone())
  plane.dispose()
  fanGeometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3))
  fanGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 2))
  fanGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
  fanGeometry.setAttribute('aZone', new THREE.InstancedBufferAttribute(new Float32Array(zones), 1))
  fanGeometry.instanceCount = zones.length
  const fanMaterial = new THREE.ShaderMaterial({
    uniforms: shared, defines: { AETHER_LIGHT_FILM: 1 },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: /* glsl */ `
      attribute vec3 aCenter;
      attribute vec2 aSize;
      attribute float aSeed;
      attribute float aZone;
      uniform vec3 uCameraRight;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vClip;
      varying float vZone;
      varying float vSeed;
      void main() {
        vUv = uv; vZone = aZone; vSeed = aSeed;
        float downward = 1. - uv.y;
        float lean = sin(aSeed * 3.7) * downward * downward * aSize.x * .27;
        vec3 world = aCenter + uCameraRight * (position.x * aSize.x + lean);
        world.y += position.y * aSize.y;
        vWorld = world;
        vClip = projectionMatrix * viewMatrix * vec4(world, 1.);
        gl_Position = vClip;
      }
    `,
    fragmentShader: /* glsl */ `
      ${lightChoreographyGLSL}
      ${boundaryGLSL}
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vSeed;
      uniform sampler2D uForestFilm;
      uniform float uForestFilmReady;
      vec3 forestFilmRadiance(vec3 worldPosition) {
        if (uForestFilmReady < .5) return vec3(0.);
        vec2 uv = .5 + .5 * sin(worldPosition.xz * vec2(.115, .13)
          + vec2(.8, 2.3) + worldPosition.y * .018);
        vec3 encoded = texture2D(uForestFilm, clamp(uv, vec2(.002), vec2(.998))).rgb;
        return mix(encoded / 12.92,
          pow((encoded + .055) / 1.055, vec3(2.4)), step(vec3(.04045), encoded));
      }
      void main() {
        float weight = sceneWeight();
        if (weight < .001) discard;
        bool forest = vZone < 1.5;
        float down = 1. - vUv.y;
        float spread = .30 + pow(down, .64) * .70;
        float side = (vUv.x - .5) / spread;
        float envelope = exp(-side * side * (forest ? 3.2 : 4.2))
          * smoothstep(0., .19, down) * (1. - smoothstep(forest ? .40 : .32, 1., down));
        if (forest) {
          // Keep scatter close to the same horizon as the film, rather than
          // lighting a continuous grey shaft from the top of the canopy.
          float horizonDistance = vWorld.y - (vZone < .5 ? ${FOREST_FILM_HEIGHTS[0]} : ${FOREST_FILM_HEIGHTS[1]});
          float horizon = horizonDistance / 4.8;
          envelope *= exp(-horizon * horizon);
        }
        float warp = sin(vWorld.y * .37 + vSeed) * .6 + sin(vWorld.z * .43 - vWorld.x * .21) * .5;
        float pockets = .5 + .5 * sin(side * 5. + warp * 1.5 + vSeed);
        pockets *= .5 + .5 * sin(side * 3.3 - down * 3.7 + vSeed * 1.9);
        float density = forest ? .05 + smoothstep(.25, .83, pockets) * .95
          : .35 + smoothstep(.12, .78, pockets) * .65;
        vec3 filmColor;
        if (forest) {
          filmColor = forestFilmRadiance(vWorld) * .5
            + forestFilmRadiance(vWorld + vec3(.8, 0., .6)) * .25
            + forestFilmRadiance(vWorld - vec3(.8, 0., .6)) * .25;
          filmColor *= .58;
        } else {
          filmColor = aetherFilmRadiance(vWorld) * .5
            + aetherFilmRadiance(vWorld + vec3(.8, 0., .6)) * .25
            + aetherFilmRadiance(vWorld - vec3(.8, 0., .6)) * .25;
          filmColor *= .6;
        }
        float luminance = dot(filmColor, vec3(.2126, .7152, .0722));
        float bright = smoothstep(forest ? .06 : .012, forest ? .34 : .42, luminance);
        vec3 color = filmColor * (.8 + bright * .9);
        float illumination = (forest ? 0. : .025) + bright;
        float ready = forest ? uForestFilmReady : uLightFilmReady;
        if (ready < .5) {
          // An unavailable forest decoder must not borrow the chamber film.
          color = forest ? vec3(.028, .085, .072) * (.7 + .3 * sin(vWorld.y * .19 + vSeed))
            : aetherLightCloud(vWorld, vec3(0., 1., 0.), uTime, step(.5, vZone)) * .32;
          illumination = forest ? .07 : .20;
        }
        float edgeMist = vZone < .5 ? uBoundaryMist.x : vZone < 1.5 ? uBoundaryMist.y : 0.;
        float alpha = envelope * density * illumination * weight
          * (forest ? .09 + edgeMist * .022 : .065);
        if (alpha < .0007) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const fans = new THREE.Mesh(fanGeometry, fanMaterial)
  fans.name = 'aether-film-light-fans'
  fans.frustumCulled = false
  fans.renderOrder = 2
  group.add(fans)
  group.userData.fanCount = zones.length
  group.userData.renderTargets = 0
  const right = new THREE.Vector3()
  let disposed = false
  return {
    group,
    update(elapsed: number, progress: number, camera: THREE.Camera) {
      if (disposed) return
      const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0
      const layers = sampleLayers(p)
      shared.uTime.value = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
      shared.uForestExit.value = layers.forestExit
      shared.uForestEntry.value = layers.forestEntry
      shared.uDeviceEntry.value = layers.monitorExit
      shared.uWeights.value.set(1 - smooth(.18, .235, p), smooth(.855, .925, p),
        0, 0)
      shared.uBoundaryMist.value.set(windowWeight(p,.055,.12,.175,.205),
        windowWeight(p,.845,.895,.955,.985))
      camera.updateMatrixWorld()
      right.setFromMatrixColumn(camera.matrixWorld, 0)
      right.y = 0
      if (right.lengthSq() < .001) right.set(1, 0, 0)
      shared.uCameraRight.value.copy(right.normalize())
      group.visible = !software && shared.uWeights.value.lengthSq() > .00001
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      backdrop.dispose()
      backdropGeometry.dispose(); backdropMaterial.dispose()
      fanGeometry.dispose(); fanMaterial.dispose()
    },
  }
}
