import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const origin = 'https://aether-studio-nu.vercel.app/'
const html = readFileSync(resolve('index.html'), 'utf8')
const readAsset = (path: string) => readFileSync(resolve('public', path.replace(/^\//, '')))
const meta = (name: string) => {
  const tags = html.match(/<meta\b[^>]*>/g) ?? []
  const tag = tags.find(tag => tag.includes(`name="${name}"`) || tag.includes(`property="${name}"`))
  return tag?.match(/content="([^"]*)"/)?.[1]
}
const pngSize = (data: Buffer) => {
  expect(data.subarray(1, 4).toString()).toBe('PNG')
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}
const jpegSize = (data: Buffer) => {
  expect(data.readUInt16BE(0)).toBe(0xffd8)
  let offset = 2
  while (offset < data.length) {
    const marker = data.readUInt16BE(offset)
    const length = data.readUInt16BE(offset + 2)
    if (marker === 0xffc0 || marker === 0xffc2) {
      return [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)]
    }
    offset += 2 + length
  }
  throw new Error('JPEG frame dimensions not found')
}

// These read deployable files directly. No page, WebGL or network fixture is used.
test('@interaction metadata is readable without JavaScript and has one production identity', () => {
  expect(html.match(/<link\b[^>]*rel="canonical"[^>]*>/g)).toEqual([
    `<link rel="canonical" href="${origin}" />`,
  ])
  expect(meta('og:url')).toBe(origin)
  expect(meta('og:type')).toBe('website')
  expect(meta('og:title')).toBe(html.match(/<title>(.*?)<\/title>/)?.[1])
  expect(meta('twitter:title')).toBe(meta('og:title'))
  expect(meta('og:description')).toBe(meta('description'))
  expect(meta('twitter:description')).toBe(meta('description'))
  expect(meta('twitter:card')).toBe('summary_large_image')
  expect(meta('og:image:alt')?.length).toBeGreaterThan(20)
  expect(meta('twitter:image:alt')).toBe(meta('og:image:alt'))
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}')
  expect(ld['@type']).toBe('WebSite')
  expect(ld.url).toBe(origin)
  expect(ld.image).toBe(meta('og:image'))
  expect(ld.inLanguage).toBe('en')
  expect(readAsset('/robots.txt').toString()).toContain(`Sitemap: ${origin}sitemap.xml`)
  expect([...readAsset('/sitemap.xml').toString().matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])).toEqual([origin])
})

test('@interaction shared images and icon declarations point to real files with matching dimensions', () => {
  expect(meta('og:image')).toBe(`${origin}og-image.jpg`)
  expect(meta('twitter:image')).toBe(meta('og:image'))
  const image = readAsset('/og-image.jpg')
  const dimensions = jpegSize(image)
  expect(dimensions).toEqual([Number(meta('og:image:width')), Number(meta('og:image:height'))])
  expect(dimensions).toEqual([1200, 630])
  expect(image.length).toBeLessThan(350_000)

  const manifest = JSON.parse(readAsset('/site.webmanifest').toString())
  expect(manifest.start_url).toBe('/')
  expect(manifest.scope).toBe('/')
  expect(manifest.display).toBe('browser')
  for (const icon of manifest.icons) {
    expect(pngSize(readAsset(icon.src)).join('x')).toBe(icon.sizes)
  }
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true)
  expect(pngSize(readAsset('/apple-touch-icon.png'))).toEqual([180, 180])
  expect(pngSize(readAsset('/favicon-16x16.png'))).toEqual([16, 16])
  expect(pngSize(readAsset('/favicon-32x32.png'))).toEqual([32, 32])
  const ico = readAsset('/favicon.ico')
  expect(ico.readUInt16LE(2)).toBe(1)
  expect(ico.readUInt16LE(4)).toBe(3)
  for (let i = 0; i < 3; i++) {
    const entry = 6 + i * 16
    const length = ico.readUInt32LE(entry + 8)
    const offset = ico.readUInt32LE(entry + 12)
    expect(pngSize(ico.subarray(offset, offset + length))).toEqual([ico[entry], ico[entry + 1]])
  }
})
