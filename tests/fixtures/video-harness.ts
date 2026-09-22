import { createSceneVideo } from '../../src/SceneVideo'

const media = createSceneVideo()
const originalTextures = [...media.textures]
const textureDisposals = [0, 0]
media.textures.forEach((texture, index) =>
  texture.addEventListener('dispose', () => textureDisposals[index]++),
)

declare global {
  interface Window {
    videoHarness: ReturnType<typeof createSceneVideo> & {
      textureDisposals: number[]
      retainsTextures: () => boolean
    }
  }
}

// A real media lifecycle without a second renderer or production-scene startup.
window.videoHarness = Object.assign(media, {
  textureDisposals,
  retainsTextures: () => media.textures.every((texture, index) => texture === originalTextures[index]),
})
