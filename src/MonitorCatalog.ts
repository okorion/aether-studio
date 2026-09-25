import { MathUtils } from 'three'
import type { SceneVideoSource } from './SceneVideo'

/** Shared sources are decoded once, even when several displays use the film. */
export const monitorMedia: readonly (SceneVideoSource & { id: string })[] = [
  { id: 'forest', src: '/media/forest-memory.mp4' },
  { id: 'aurora', src: '/media/aurora-bloom.mp4', optimizedSrc: '/media/aurora-bloom.webm' },
]

export interface MonitorModel {
  width: number
  height: number
  cornerRadius: number
  depth: number
  curvature: number
}

export interface MonitorDefinition {
  id: string
  title: readonly string[]
  projectIndex: number
  mediaId: string
  tint: number
  model?: Partial<MonitorModel>
  /** Normalized focal point for aspect-preserving video cover cropping. */
  focus?: readonly [number, number]
  exposure?: number
}

export const monitorCatalog: readonly MonitorDefinition[] = [
  { id: 'liminal', title: ['LIMINAL'], projectIndex: 0, mediaId: 'forest', tint: 0x80b9ca },
  { id: 'pulse', title: ['PULSE', 'ARCHIVE'], projectIndex: 1, mediaId: 'aurora', tint: 0xb697db },
  { id: 'orbital', title: ['ORBITAL'], projectIndex: 2, mediaId: 'forest', tint: 0x769cd4 },
  { id: 'solstice', title: ['SOLSTICE'], projectIndex: 3, mediaId: 'aurora', tint: 0xd8ad71 },
  { id: 'liminal-return', title: ['LIMINAL'], projectIndex: 0, mediaId: 'forest', tint: 0xa4c6ae },
  { id: 'pulse-return', title: ['PULSE', 'ARCHIVE'], projectIndex: 1, mediaId: 'aurora', tint: 0x69baaa },
]

const finite = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? MathUtils.clamp(value!, min, max) : fallback

export function resolveMonitorModel(model: Partial<MonitorModel> = {}): MonitorModel {
  const width = finite(model.width, 6.1, 2, 9)
  const height = finite(model.height, 3.8, 1.5, 6)
  return { width, height,
    cornerRadius: finite(model.cornerRadius, .25, .08, Math.min(width, height) * .3),
    depth: finite(model.depth, .075, .025, .3),
    curvature: finite(model.curvature, .10, 0, .35),
  }
}

/** Every catalogue fills the same passage; neighbouring cards retain room to turn. */
export function sampleMonitorLayout(progress: number, index: number, count: number, width = 6.1, height = 3.8) {
  const p = Number.isFinite(progress) ? MathUtils.clamp(progress, 0, 1) : 0
  const passage = Math.max(0, (p - .303) / .32) * Math.max(0, count - 1)
  const step = index - passage
  const turn = MathUtils.clamp(1.30 * width / 6.1, 1.05, 1.55)
  return { step, angle: step * turn, y: -step * 2.05 * height / 3.8,
    radiusX: 4.7 + Math.max(0, width - 6.1) * .45,
    radiusZ: 3.8 + Math.max(0, width - 6.1) * .22 }
}
