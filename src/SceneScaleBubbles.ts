import * as THREE from 'three'

/** Sparse points in front of the scale panel; the owning room disposes both resources. */
export function createScaleBubbles(software: boolean, mobile: boolean) {
  const count = software ? 52 : mobile ? 76 : 104
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  let state = 0x7319a1
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - .5) * 15.2
    positions[i * 3 + 1] = (random() - .5) * 8.2
    positions[i * 3 + 2] = .1 + random() * 3.3
    seeds[i] = random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aBubbleSeed', new THREE.BufferAttribute(seeds, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uViewportHeight: { value: 900 }, uPointPixelRatio: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */ `
      attribute float aBubbleSeed;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uViewportHeight;
      uniform float uPointPixelRatio;
      varying float vBubbleOpacity;
      varying float vBubbleSeed;
      void main() {
        float phase = aBubbleSeed * 6.2831853;
        vec3 drift = vec3(sin(uTime * .31 + phase) * .13,
          sin(uTime * (.22 + aBubbleSeed * .12) + phase) * .21,
          cos(uTime * .27 + phase) * .10);
        vec4 view = modelViewMatrix * vec4(position + drift, 1.);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp((.035 + pow(aBubbleSeed, 4.) * .32) * uViewportHeight
          * projectionMatrix[1][1] * .5 / max(3., -view.z), 2. * uPointPixelRatio, 42. * uPointPixelRatio);
        vBubbleOpacity = uOpacity * (.28 + aBubbleSeed * .24);
        vBubbleSeed = aBubbleSeed;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vBubbleOpacity;
      varying float vBubbleSeed;
      void main() {
        vec2 point = gl_PointCoord * 2. - 1.;
        float radius = length(point);
        if (radius > 1.) discard;
        float rim = smoothstep(.80, .94, radius) * (1. - smoothstep(.96, 1., radius));
        float glint = exp(-dot(point - vec2(-.42, -.62), point - vec2(-.42, -.62)) * 170.);
        float sheen = pow(max(0.,-point.y),4.)*rim;
        vec3 film = .55 + .25*cos(vec3(0.,2.1,4.2)+radius*18.+atan(point.y,point.x)*1.4+vBubbleSeed*4.);
        vec3 color = mix(vec3(.44,.61,.64),film,.48)+vec3(glint*.8+sheen*.35);
        float alpha = (rim * .32 + glint * .7 + sheen*.3 + .003) * vBubbleOpacity;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'aether-scale-bubbles'
  points.frustumCulled = false
  const viewport = new THREE.Vector4()
  const logicalSize = new THREE.Vector2()
  points.onBeforeRender = renderer => {
    renderer.getCurrentViewport(viewport)
    renderer.getSize(logicalSize)
    material.uniforms.uViewportHeight.value = viewport.w
    // Include both display DPR and reduced-resolution glow/reflection passes.
    material.uniforms.uPointPixelRatio.value = viewport.w / Math.max(1, logicalSize.y)
  }
  return { points, geometry, material }
}
