// Opt-in, local User Timing entries. No telemetry or scene/quality changes.
const enabled = () => typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('profileLoading') === '1'
let sequence = 0
let spanSequence = 0
const idleTrace: { step: (name: string) => void } = { step: () => {} }

/** Nested timings do not move the existing loading-stage boundaries. */
export function beginLoadingSpan(name: string) {
  if (!enabled()) return () => {}
  const start = `aether:detail:${name}:${++spanSequence}`
  performance.mark(start)
  return () => performance.measure(`aether:detail:${name}`, start)
}

export function markSceneModule(phase: 'request' | 'ready') {
  if (enabled()) performance.mark(`aether:module:${phase}`)
}

export function createLoadingTrace() {
  if (!enabled()) return idleTrace
  const prefix = `aether:scene-${++sequence}`
  let previous = `${prefix}:begin`
  performance.mark(previous)
  return {
    step(name: string) {
      const end = `${prefix}:${name}`
      performance.mark(end)
      performance.measure(end, previous, end)
      previous = end
    },
  }
}
