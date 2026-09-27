import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createForestGeometry } from '../src/ForestGeometry'
import { createForestParticles } from '../src/ForestAssembly'
import fixture from './fixtures/forest-attributes.json' with { type: 'json' }

const hash = (array: ArrayBufferView) => createHash('sha256')
  .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex')

// Captured from bdfda29 before the optimization. Check the complete arrays,
// including random call order, Float32 rounding and the final particle upload.
for (const [profile, software, mobile, count] of [
  ['desktop', false, false, 180000], ['mobile', false, true, 48000], ['software', true, false, 7000],
] as const) {
  test(`@interaction ${profile} forest generation preserves every matrix and particle attribute byte`, () => {
    const assets = createForestGeometry(count, software, mobile)
    const particles = createForestParticles(assets, count)
    try {
      const arrays = Object.fromEntries((['barkMatrices', 'barkColors', 'leafMatrices', 'leafColors'] as const)
        .map(name => [name, hash(assets[name])]))
      const attributes = Object.fromEntries(Object.entries(particles.geometry.attributes)
        .map(([name, attribute]) => [name, hash(attribute.array)]))
      expect({ arrays, attributes, leafCount: particles.leafCount, barkCount: particles.barkCount, total: particles.total })
        .toEqual(fixture.profiles[profile])
    } finally {
      particles.geometry.dispose()
      assets.barkGeometry.dispose()
      assets.leafGeometry.dispose()
    }
  })
}
