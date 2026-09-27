import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { createAtmosphere } from '../src/Atmosphere'
import fixture from './fixtures/atmosphere-attributes.json' with { type: 'json' }

// Captured from 9bfe92e before optimization, not regenerated from the new code.
// Covers all samples and skipped lanes, including the original seed order.
for (const [profile, software, mobile] of [
  ['desktop', false, false], ['mobile', false, true], ['software', true, false],
] as const) {
  test(`@interaction ${profile} atmosphere preserves every attribute byte`, () => {
    const scene = new THREE.Scene()
    const atmosphere = createAtmosphere(scene, software, mobile)
    try {
      const hashes: Record<string, string> = {}
      scene.traverse(object => {
        if (!(object instanceof THREE.Points) || !object.geometry.hasAttribute('aFlowerPosition')) return
        for (const [name, attribute] of Object.entries(object.geometry.attributes)) {
          const array = (attribute as THREE.BufferAttribute).array
          hashes[name] = createHash('sha256')
            .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex')
        }
      })
      expect(hashes).toEqual(fixture.profiles[profile])
    } finally {
      atmosphere.dispose()
    }
  })
}
