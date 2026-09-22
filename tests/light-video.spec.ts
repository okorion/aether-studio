import { expect, test } from '@playwright/test'
import { createSceneLightVideo } from '../src/SceneLightVideo'

class LightVideoMock extends EventTarget {
  dataset: Record<string, string> = {}
  muted = false
  defaultMuted = false
  loop = false
  playsInline = false
  preload = ''
  crossOrigin = ''
  paused = true
  readyState = 0
  HAVE_CURRENT_DATA = 2
  videoWidth = 0
  videoHeight = 0
  currentTime = 0
  error: { code: number } | null = null
  loads = 0
  attributes = new Map<string, string>()
  callbacks = new Set<number>()
  attempts: { time: number; resolve(): void; reject(reason: unknown): void }[] = []
  get src() { return this.attributes.get('src') ?? '' }
  set src(value: string) { this.attributes.set('src', value) }
  removeAttribute(name: string) { this.attributes.delete(name) }
  requestVideoFrameCallback() { this.callbacks.add(1); return 1 }
  cancelVideoFrameCallback(id: number) { this.callbacks.delete(id) }
  load() {
    this.loads++
    if (!this.src) { this.readyState = 0; this.currentTime = 0 }
  }
  play() {
    return new Promise<void>((resolve, reject) => {
      this.attempts.push({ time: this.currentTime, reject, resolve: () => {
        this.paused = false
        this.dispatchEvent(new Event('playing'))
        resolve()
      } })
    })
  }
  pause() {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  frame() {
    this.readyState = 2
    this.videoWidth = 256
    this.videoHeight = 160
    this.dispatchEvent(new Event('loadeddata'))
  }
}

class LightDocumentMock extends EventTarget {
  hidden = false
  videos: LightVideoMock[] = []
  createElement(tag: string) {
    if (tag !== 'video') throw new Error(`Unexpected element: ${tag}`)
    const video = new LightVideoMock()
    this.videos.push(video)
    return video
  }
  visibility(hidden: boolean) {
    this.hidden = hidden
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

async function withMediaDocument(run: (document: LightDocumentMock) => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const document = new LightDocumentMock()
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  try { await run(document) } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
}

async function flushPlayback() { await Promise.resolve(); await Promise.resolve() }

// These tests run in the Playwright worker's Node process. No page, browser,
// WebGL renderer, network media request, or real decoder is created.
test('@interaction light projection lazily owns one decoder and preserves playback across pause and visibility', async () => {
  await withMediaDocument(async document => {
    const owner = createSceneLightVideo()
    const video = document.videos[0]
    const fallback = owner.texture
    let fallbackDisposals = 0
    fallback.addEventListener('dispose', () => fallbackDisposals++)
    try {
      expect(document.videos).toHaveLength(1)
      expect(video.dataset.mediaRole).toBe('light-projection')
      expect([video.muted, video.defaultMuted, video.loop, video.playsInline]).toEqual([true, true, true, true])
      expect([video.preload, video.crossOrigin]).toEqual(['none', 'anonymous'])
      for (let i = 0; i < 10; i++) owner.setActive(true, true)
      owner.setActive(false)
      document.visibility(true)
      owner.setActive(true)
      expect([video.src, video.loads, video.attempts.length]).toEqual(['', 0, 0])
      expect(owner.getReady()).toBe(false)
      document.visibility(false)
      expect(video.src).toBe('/media/light-projection.mp4')
      expect(video.loads).toBe(1)
      expect(video.attempts).toHaveLength(1)
      for (let i = 0; i < 10; i++) owner.setActive(true)
      expect(video.attempts).toHaveLength(1)
      expect(owner.texture === fallback).toBe(true)
      video.frame()
      video.attempts[0].resolve()
      await flushPlayback()
      const film = owner.texture
      expect(film === fallback).toBe(false)
      expect(owner.getStatus()).toMatchObject({ active: true, ready: true, playing: true, state: 'playing' })
      video.currentTime = 4.25
      owner.setActive(false)
      expect(video.paused).toBe(true)
      expect(owner.texture === film).toBe(true)
      expect(owner.getReady()).toBe(true)
      owner.setActive(true)
      expect(video.attempts[1].time).toBe(4.25)
      video.attempts[1].resolve()
      await flushPlayback()
      document.visibility(true)
      expect(video.paused).toBe(true)
      document.visibility(false)
      expect(video.attempts[2].time).toBe(4.25)
      video.attempts[2].resolve()
      await flushPlayback()
      owner.setActive(true, true)
      expect(video.paused).toBe(true)
      expect(video.loads).toBe(1)
      owner.setActive(true, false)
      const pending = video.attempts.at(-1)!
      owner.dispose()
      pending.resolve()
      await flushPlayback()
      expect(owner.getStatus()).toMatchObject({ active: false, ready: false, playing: false, attached: false, state: 'disposed' })
      expect(video.paused).toBe(true)
      expect(video.src).toBe('')
      expect(video.callbacks.size).toBe(0)
      const count = video.attempts.length
      document.visibility(true); document.visibility(false); owner.setActive(true)
      expect(video.attempts).toHaveLength(count)
      owner.dispose()
      expect(fallbackDisposals).toBe(1)
    } finally { owner.dispose() }
  })
})

test('@interaction light projection handles late play promises and terminal media failures without retries', async () => {
  await withMediaDocument(async document => {
    const owner = createSceneLightVideo()
    const video = document.videos[0]
    const fallback = owner.texture
    try {
      owner.setActive(true)
      owner.setActive(false)
      video.attempts[0].resolve()
      await flushPlayback()
      expect(video.paused).toBe(true)
      owner.setActive(true)
      owner.setActive(false)
      owner.setActive(true)
      video.frame()
      video.attempts[2].resolve()
      await flushPlayback()
      video.attempts[1].reject(new DOMException('Old activation', 'NotAllowedError'))
      await flushPlayback()
      expect(owner.getStatus()).toMatchObject({ active: true, ready: true, playing: true, error: null })
      video.error = { code: 4 }
      video.dispatchEvent(new Event('error'))
      expect(owner.getStatus()).toMatchObject({ active: false, ready: false, playing: false, attached: false, state: 'error', error: 'MediaError:4' })
      expect(owner.texture === fallback).toBe(true)
      expect(video.callbacks.size).toBe(0)
      const attempts = video.attempts.length
      for (let i = 0; i < 3; i++) {
        owner.setActive(false); owner.setActive(true)
        document.visibility(true); document.visibility(false)
      }
      expect(video.attempts).toHaveLength(attempts)
    } finally { owner.dispose() }

    const blocked = createSceneLightVideo()
    const deniedVideo = document.videos[1]
    try {
      blocked.setActive(true)
      blocked.setActive(false)
      deniedVideo.attempts[0].reject(new DOMException('Autoplay policy', 'NotAllowedError'))
      await flushPlayback()
      expect(blocked.getStatus()).toMatchObject({ state: 'blocked', error: 'NotAllowedError', ready: false, attached: false })
      blocked.setActive(true)
      document.visibility(true); document.visibility(false)
      expect(deniedVideo.attempts).toHaveLength(1)
    } finally { blocked.dispose() }
  })
})
