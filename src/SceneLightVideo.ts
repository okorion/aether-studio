import * as THREE from 'three'

type LightVideoState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'blocked' | 'error' | 'disposed'

/** One lazy decoder shared by lighting surfaces; no media request before activation. */
export function createSceneLightVideo({ source = '/media/light-projection.mp4', role = 'light-projection' } = {}) {
  const video = document.createElement('video')
  video.dataset.mediaRole = role
  video.muted = video.defaultMuted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'none'
  video.crossOrigin = 'anonymous'

  const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  fallback.name = `aether-${role}-fallback`
  fallback.needsUpdate = true
  const film = new THREE.VideoTexture(video)
  film.name = `aether-${role}-video`
  film.colorSpace = THREE.SRGBColorSpace
  film.generateMipmaps = false

  let requested = false
  let reduced = false
  let active = false
  let attached = false
  let hasFrame = false
  let disposed = false
  let filmDisposed = false
  let playAttempt = 0
  let state: LightVideoState = 'idle'
  let error: string | null = null
  const failed = () => state === 'blocked' || state === 'error'
  const ready = () => !disposed && !failed() && hasFrame
  const disposeFilm = () => {
    if (filmDisposed) return
    filmDisposed = true
    film.dispose()
  }
  const detach = () => {
    video.pause()
    if (!attached) return
    attached = false
    video.removeAttribute('src')
    video.load()
  }
  const fail = (reason: unknown) => {
    if (disposed || failed()) return
    const name = reason instanceof Error ? reason.name : 'PlaybackError'
    error = name
    state = name === 'NotAllowedError' ? 'blocked' : 'error'
    active = false
    hasFrame = false
    playAttempt++
    disposeFilm()
    detach()
  }
  const loaded = () => {
    if (disposed || failed()) return
    hasFrame = video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0
    if (!hasFrame) return
    film.needsUpdate = true
    state = active ? (video.paused ? 'ready' : 'playing') : 'paused'
  }
  const playing = () => {
    if (disposed || failed() || !active) { video.pause(); return }
    loaded()
  }
  const paused = () => {
    if (!disposed && !failed() && attached) state = 'paused'
  }
  const mediaError = () => {
    const reason = new Error('Unable to decode the light projection')
    reason.name = `MediaError:${video.error?.code ?? 'unknown'}`
    fail(reason)
  }
  video.addEventListener('loadeddata', loaded)
  video.addEventListener('playing', playing)
  video.addEventListener('pause', paused)
  video.addEventListener('error', mediaError)

  const reconcile = () => {
    const next = !disposed && !failed() && requested && !reduced && !document.hidden
    if (next === active) return
    active = next
    if (!active) {
      video.pause()
      if (attached && !failed()) state = 'paused'
      return
    }
    const attempt = ++playAttempt
    try {
      if (!attached) {
        attached = true
        video.src = source
        video.load()
      }
      if (failed()) return
      state = hasFrame ? 'ready' : 'loading'
      void video.play().then(() => {
        // A stale completion cannot pause a newer, valid activation. A hidden
        // or destroyed owner must never be restarted by a delayed promise.
        if (disposed || !active) { video.pause(); return }
        if (attempt !== playAttempt || failed()) return
        loaded()
      }).catch((reason: unknown) => {
        if (disposed || failed() || attempt !== playAttempt) return
        // pause()/load() may abort an in-flight play. An actual autoplay denial
        // remains terminal even if the user left before its promise rejected.
        if (!active && reason instanceof Error && reason.name === 'AbortError') return
        fail(reason)
      })
    } catch (reason) { fail(reason) }
  }
  document.addEventListener('visibilitychange', reconcile)

  return {
    /** Re-read when ready changes; uniforms initially receive the black fallback. */
    get texture(): THREE.Texture { return ready() ? film : fallback },
    getReady: ready,
    getStatus() {
      return { active, ready: ready(), playing: active && ready() && !video.paused,
        attached, state, error }
    },
    setActive(nextActive: boolean, reducedMotion = false) {
      if (disposed) return
      requested = nextActive
      reduced = reducedMotion
      reconcile()
    },
    dispose() {
      if (disposed) return
      disposed = true
      requested = active = hasFrame = false
      state = 'disposed'
      playAttempt++
      document.removeEventListener('visibilitychange', reconcile)
      video.removeEventListener('loadeddata', loaded)
      video.removeEventListener('playing', playing)
      video.removeEventListener('pause', paused)
      video.removeEventListener('error', mediaError)
      detach()
      disposeFilm()
      fallback.dispose()
    },
  }
}
