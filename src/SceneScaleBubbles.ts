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
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    transparent: true, depthWrite: false, depthTest: true,
    vertexShader: /* glsl */ `
      attribute float aBubbleSeed;
      uniform float uTime;
      uniform float uOpacity;
      varying float vBubbleOpacity;
      void main() {
        float phase = aBubbleSeed * 6.2831853;
        vec3 drift = vec3(sin(uTime * .31 + phase) * .13,
          sin(uTime * (.22 + aBubbleSeed * .12) + phase) * .21,
          cos(uTime * .27 + phase) * .10);
        vec4 view = modelViewMatrix * vec4(position + drift, 1.);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp((2.0 + aBubbleSeed * 2.7) * 14. / max(3., -view.z), 1.2, 5.2);
        vBubbleOpacity = uOpacity * (.22 + aBubbleSeed * .23);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vBubbleOpacity;
      void main() {
        vec2 point = gl_PointCoord * 2. - 1.;
        float radius = length(point);
        if (radius > 1.) discard;
        float rim = smoothstep(.48, .91, radius) * (1. - smoothstep(.91, 1., radius));
        float glint = exp(-dot(point - vec2(-.35, .34), point - vec2(-.35, .34)) * 22.);
        float alpha = (rim * .72 + glint * .22 + .08) * vBubbleOpacity;
        gl_FragColor = vec4(vec3(.66, .80, .91), alpha);
      }
    `,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'aether-scale-bubbles'
  points.frustumCulled = false
  return { points, geometry, material }
}
