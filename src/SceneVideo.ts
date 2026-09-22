import * as THREE from 'three'

export interface SceneVideoSource {
  src: string
  optimizedSrc?: string
  /** Optional metadata only; offscreen decoders use the procedural fallback. */
  poster?: string
}

export type SceneVideoState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'blocked' | 'error' | 'disposed'

export interface SceneVideoStatus {
  active: boolean
  disposed: boolean
  ready: [boolean, boolean]
  playing: [boolean, boolean]
  state: [SceneVideoState, SceneVideoState]
  errors: [string | null, string | null]
}

const defaultSources: readonly [SceneVideoSource, SceneVideoSource] = [
  { src: '/media/chrome-current.mp4', optimizedSrc: '/media/chrome-current.webm' },
  { src: '/media/aurora-bloom.mp4', optimizedSrc: '/media/aurora-bloom.webm' },
]

/** Two shared decoders; callers use ready=false to retain their shader fallback. */
export function createSceneVideo(sources: readonly [SceneVideoSource, SceneVideoSource] = defaultSources) {
  let requestedActive = false
  let reduced = false
  let active = false
  let disposed = false

  const createSlot = (source: SceneVideoSource, index: number) => {
    const video = document.createElement('video')
    video.muted = video.defaultMuted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'none'
    video.crossOrigin = 'anonymous'
    const texture = new THREE.VideoTexture(video)
    texture.name = `aether-monitor-video-${index}`
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = false

    let attached = false
    let hasData = false
    let attempt = 0
    let state: SceneVideoState = 'idle'
    let error: string | null = null

    const failed = () => state === 'blocked' || state === 'error'
    const fail = (reason: string, blocked = false) => {
      if (disposed || failed()) return
      attempt++
      error = reason
      hasData = false
      state = blocked ? 'blocked' : 'error'
      video.pause()
    }
    const loaded = () => {
      if (disposed || failed()) return
      hasData = video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0
      if (hasData) {
        texture.needsUpdate = true
        state = active ? (video.paused ? 'ready' : 'playing') : 'paused'
      }
    }
    const playing = () => {
      if (disposed || !active || failed()) {
        video.pause()
        return
      }
      loaded()
    }
    const paused = () => {
      if (!disposed && attached && !failed()) state = hasData ? 'paused' : 'loading'
    }
    const mediaError = () => fail(`MediaError:${video.error?.code ?? 'unknown'}`)
    video.addEventListener('loadeddata', loaded)
    video.addEventListener('playing', playing)
    video.addEventListener('pause', paused)
    video.addEventListener('error', mediaError)

    return {
      texture,
      resume() {
        if (disposed || failed()) return
        const currentAttempt = ++attempt
        try {
          if (!attached) {
            // Capability probing and resource selection happen only at first
            // entry. Pauses keep this source, decoder and current playback time.
            let selectedSource = source.src
            if (source.optimizedSrc) {
              try {
                const support = video.canPlayType('video/webm; codecs="vp8"')
                if (support === 'probably' || support === 'maybe') selectedSource = source.optimizedSrc
              } catch { /* A failed capability probe retains the original source. */ }
            }
            attached = true
            // The shader fallback is procedural, so an offscreen DOM poster
            // would only add an unused network request.
            video.src = selectedSource
            video.load()
          }
          state = hasData ? 'ready' : 'loading'
          void video.play().then(() => {
            // A late completion must not restart a hidden/disposed decoder, or
            // pause a newer valid play attempt after a quick leave/re-entry.
            if (disposed || !active) {
              video.pause()
              return
            }
            if (currentAttempt !== attempt || failed()) return
            loaded()
          }).catch((reason: unknown) => {
            if (disposed || !active || currentAttempt !== attempt) return
            const name = reason instanceof Error ? reason.name : 'PlaybackError'
            // An autoplay rejection is terminal for this module. Repeated
            // frames, visibility changes, and scroll re-entry cannot retry it.
            fail(name, name === 'NotAllowedError')
          })
        } catch (reason) {
          const name = reason instanceof Error ? reason.name : 'PlaybackError'
          fail(name, name === 'NotAllowedError')
        }
      },
      pause() {
        attempt++
        video.pause()
        if (attached && !failed()) state = hasData ? 'paused' : 'loading'
      },
      status() {
        return {
          ready: !disposed && hasData && !failed(),
          playing: !disposed && active && hasData && !failed() && !video.paused,
          state,
          error,
        }
      },
      dispose() {
        attempt++
        video.removeEventListener('loadeddata', loaded)
        video.removeEventListener('playing', playing)
        video.removeEventListener('pause', paused)
        video.removeEventListener('error', mediaError)
        video.pause()
        texture.dispose()
        video.removeAttribute('src')
        video.removeAttribute('poster')
        // Reset the media resource selection algorithm and release the decoder.
        if (attached) video.load()
        hasData = false
        state = 'disposed'
      },
    }
  }

  const slots = [createSlot(sources[0], 0), createSlot(sources[1], 1)] as const
  const reconcile = () => {
    const next = !disposed && requestedActive && !reduced && !document.hidden
    if (next === active) return
    active = next
    for (const slot of slots) {
      if (active) slot.resume()
      else slot.pause()
    }
  }
  document.addEventListener('visibilitychange', reconcile)

  return {
    textures: [slots[0].texture, slots[1].texture] as [THREE.VideoTexture, THREE.VideoTexture],
    update(nextActive: boolean, reducedMotion: boolean) {
      if (disposed) return
      requestedActive = nextActive
      reduced = reducedMotion
      reconcile()
    },
    status(): SceneVideoStatus {
      const first = slots[0].status()
      const second = slots[1].status()
      return {
        active,
        disposed,
        ready: [first.ready, second.ready],
        playing: [first.playing, second.playing],
        state: [first.state, second.state],
        errors: [first.error, second.error],
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      requestedActive = false
      document.removeEventListener('visibilitychange', reconcile)
      for (const slot of slots) slot.dispose()
    },
  }
}
