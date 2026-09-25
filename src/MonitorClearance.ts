import * as THREE from 'three'

// At most eight cards occupy the visible 7.2-step passage, regardless of catalog size.
export const MAX_MONITOR_OBSTACLES = 8
export type MonitorObstacle = { inverse: THREE.Matrix4; normal: THREE.Vector3; half: THREE.Vector3 }

export function createMonitorObstacle(): MonitorObstacle {
  return { inverse: new THREE.Matrix4(), normal: new THREE.Vector3(), half: new THREE.Vector3() }
}

export const monitorClearanceGLSL = /* glsl */ `
  uniform int uMonitorCount;
  uniform mat4 uMonitorInverse[${MAX_MONITOR_OBSTACLES}];
  uniform vec3 uMonitorNormal[${MAX_MONITOR_OBSTACLES}];
  uniform vec3 uMonitorHalf[${MAX_MONITOR_OBSTACLES}];
  vec3 clearMonitors(vec3 world) {
    for (int i = 0; i < ${MAX_MONITOR_OBSTACLES}; i++) {
      if (i >= uMonitorCount) break;
      vec3 q = (uMonitorInverse[i] * vec4(world, 1.)).xyz;
      vec3 halfSize = uMonitorHalf[i];
      vec2 edge = 1. - smoothstep(halfSize.xy, halfSize.xy + .22, abs(q.xy));
      // Deflect inward before the curved glass, with a soft approach outside
      // its edges. Behind the glass, the flower keeps its original silhouette.
      // A smooth minimum keeps every approaching seed behind the clearance
      // plane. A depth fade could interpolate a seed back through the glass.
      float gap = -halfSize.z - q.z;
      float push = .5 * (gap - sqrt(gap * gap + .016)) * edge.x * edge.y;
      world += uMonitorNormal[i] * push;
    }
    return world;
  }
`
