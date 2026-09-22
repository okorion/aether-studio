import * as THREE from 'three'

// Wider than the shared 0.009 grain, 0.006 feather and glass distortion.
// False positives cost a pass; false negatives would remove visible imagery.
const margin = .04

/** A closed screen band is empty for every camera, including reflections. */
export function curtainHasCoverage(upper: number, lower: number,
  left = 0, right = 1, bottom = 0, top = 1) {
  if (![upper, lower, left, right, bottom, top].every(Number.isFinite)) return true
  const minimum = bottom - (right - .5) * .20
  const maximum = top - (left - .5) * .20
  return upper >= minimum - margin && lower <= maximum + margin && upper >= lower - margin * 2
}

/** Conservative bounds for capture eligibility; never hides reflected objects. */
export function createCurtainVisibility() {
  const projectionView = new THREE.Matrix4()
  const frustum = new THREE.Frustum()
  const sphere = new THREE.Sphere()
  const clip = new THREE.Vector4()
  return {
    begin(camera: THREE.Camera) {
      camera.updateWorldMatrix(true, false)
      projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(projectionView, camera.coordinateSystem)
    },
    intersects(mesh: THREE.Mesh, upper: number, lower: number, bounds?: THREE.Box3) {
      if (!curtainHasCoverage(upper, lower)) return false
      if (!bounds) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        bounds = mesh.geometry.boundingBox ?? undefined
      }
      if (!bounds || bounds.isEmpty()) return true
      mesh.updateWorldMatrix(true, false)
      bounds.getBoundingSphere(sphere).applyMatrix4(mesh.matrixWorld)
      // Include thin rims and edge pixels before the more precise UV test.
      sphere.radius += .12 * mesh.matrixWorld.getMaxScaleOnAxis()
      if (!frustum.intersectsSphere(sphere)) return false
      let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity
      for (let corner = 0; corner < 8; corner++) {
        clip.set(corner & 1 ? bounds.max.x : bounds.min.x,
          corner & 2 ? bounds.max.y : bounds.min.y,
          corner & 4 ? bounds.max.z : bounds.min.z, 1)
          .applyMatrix4(mesh.matrixWorld).applyMatrix4(projectionView)
        // Near-plane crossings require clipping, not division of negative W.
        // Keep that pass rather than risk a false cull at the camera crossing.
        if (clip.w <= .0001 || !Number.isFinite(clip.w)) return true
        const x = clip.x / clip.w * .5 + .5, y = clip.y / clip.w * .5 + .5
        left = Math.min(left, x); right = Math.max(right, x)
        bottom = Math.min(bottom, y); top = Math.max(top, y)
      }
      if (right < -margin || left > 1 + margin || top < -margin || bottom > 1 + margin) return false
      return curtainHasCoverage(upper, lower, Math.max(-margin, left), Math.min(1 + margin, right),
        Math.max(-margin, bottom), Math.min(1 + margin, top))
    },
  }
}
