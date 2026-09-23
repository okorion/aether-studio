export const loadingStages = {
  module: { percent: 10, label: 'Building the scene' },
  resources: { percent: 25, label: 'Preparing textures' },
  textures: { percent: 40, label: 'Compiling light' },
  linear: { percent: 65, label: 'Warming geometry' },
  geometry: { percent: 80, label: 'Preparing the display' },
  shaders: { percent: 95, label: 'Drawing the first frame' },
  frame: { percent: 100, label: 'Ready to explore' },
} as const
export type LoadingStage = keyof typeof loadingStages
export type LoadingState = { status: 'loading' | 'ready' | 'unavailable'; percent: number; label: string }
export const initialLoading: LoadingState = { status: 'loading', percent: 0, label: 'Loading the scene' }
export function loadingState(stage: LoadingStage): LoadingState {
  return { status: stage === 'frame' ? 'ready' : 'loading', ...loadingStages[stage] }
}
