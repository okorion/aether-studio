import * as THREE from 'three'
import { resolveMonitorModel, type MonitorModel } from './MonitorCatalog'

function roundedPath(path: THREE.Path, w: number, h: number, r: number) {
  const x = -w / 2, y = -h / 2
  path.moveTo(x + r, y)
  path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r)
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r)
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y)
}

/** The lens and its bevel use the same curvature, including their outside edge. */
export function createMonitorGeometry(model: Partial<MonitorModel> | undefined, lowDetail: boolean) {
  const resolved = resolveMonitorModel(model)
  const { width, height, cornerRadius, depth, curvature } = resolved
  const lens = new THREE.PlaneGeometry(width, height, lowDetail ? 16 : 32, lowDetail ? 10 : 20)
  const shape = new THREE.Shape(), hole = new THREE.Path()
  roundedPath(shape, width, height, cornerRadius)
  roundedPath(hole, width - .064, height - .064, cornerRadius - .032)
  shape.holes.push(hole)
  const rim = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: .008,
    bevelSize: .007, bevelSegments: 2, steps: 1, curveSegments: lowDetail ? 6 : 10 })
  rim.translate(0, 0, -depth + .012)
  for (const geometry of [lens, rim]) {
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) / (width / 2), y = positions.getY(i) / (height / 2)
      positions.setZ(i, positions.getZ(i) + curvature * (1 - x * x) + curvature * .2 * (1 - y * y))
    }
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  }
  return { lens, rim, model: resolved, bounds: lens.boundingBox!.clone().union(rim.boundingBox!),
    dispose() { lens.dispose(); rim.dispose() } }
}
