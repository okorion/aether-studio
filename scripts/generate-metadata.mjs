/**
 * Generates the icon family from the vector master. The existing OG card is
 * untouched by default; pass --share-card only to explicitly rebuild that card.
 * npm install --no-save --package-lock=false sharp
 * node scripts/generate-metadata.mjs
 * Alternatively: --sharp-module /absolute/path/to/sharp
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const moduleArgument = process.argv.indexOf('--sharp-module')
const sharp = require(moduleArgument === -1 ? 'sharp' : resolve(process.argv[moduleArgument + 1]))
const read = (path) => readFile(resolve(root, path))
const save = (path, data) => writeFile(resolve(root, path), data)

const icon = await read('public/favicon.svg')
const sizes = [16, 32, 48, 180, 192, 512]
const pngs = new Map()
for (const size of sizes) {
  pngs.set(size, await sharp(icon).resize(size, size).png().toBuffer())
}
await save('public/favicon-16x16.png', pngs.get(16))
await save('public/favicon-32x32.png', pngs.get(32))
await save('public/apple-touch-icon.png', pngs.get(180))
await save('public/icon-192.png', pngs.get(192))
await save('public/icon-512.png', pngs.get(512))

// Keep the O in the mask-safe centre with a full-bleed field, not an inset tile.
const mark = icon.toString().replace(/<svg[^>]*>|<\/svg>|<rect\b[^>]*\/>/g, '')
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a1114"/><svg x="6" y="6" width="52" height="52" viewBox="0 0 64 64" fill="none">${mark}</svg></svg>`
await save('public/icon-maskable-512.png', await sharp(Buffer.from(maskable)).png().toBuffer())

// ICO stores the same lossless PNG artwork at three real directory-entry sizes.
const icoSizes = [16, 32, 48]
const header = Buffer.alloc(6 + icoSizes.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoSizes.length, 4)
let offset = header.length
icoSizes.forEach((size, index) => {
  const entry = 6 + index * 16
  const png = pngs.get(size)
  header[entry] = size
  header[entry + 1] = size
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(png.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += png.length
})
await save('public/favicon.ico', Buffer.concat([header, ...icoSizes.map(size => pngs.get(size))]))

if (process.argv.includes('--share-card')) {
const photo = (await read('docs/screenshots/living/after-000.jpg')).toString('base64')
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="veil"><stop stop-color="#070d10"/><stop offset=".43" stop-color="#070d10" stop-opacity=".94"/><stop offset=".72" stop-color="#070d10" stop-opacity="0"/></linearGradient>
    <linearGradient id="edge"><stop stop-color="#92d9c5"/><stop offset="1" stop-color="#92d9c5" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#070d10"/>
  <image x="192" width="1008" height="630" href="data:image/jpeg;base64,${photo}"/>
  <rect width="1200" height="630" fill="url(#veil)"/>
  <rect x="48" y="48" width="1104" height="534" rx="2" fill="none" stroke="#a4ddcd" stroke-opacity=".20"/>
  <g transform="translate(76 77) scale(.66)" fill="none">${icon.toString().replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
  <text x="132" y="102" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3.7" fill="#d5e9e3">AETHER STUDIO</text>
  <text x="77" y="248" font-family="Arial, sans-serif" font-size="63" font-weight="700" letter-spacing="-2.5" fill="#edf5ef">Digital worlds.</text>
  <text x="77" y="318" font-family="Arial, sans-serif" font-size="63" font-weight="700" letter-spacing="-2.5" fill="#a9cac1">Human wonder.</text>
  <rect x="80" y="356" width="228" height="1" fill="url(#edge)"/>
  <text x="80" y="401" font-family="Arial, sans-serif" font-size="18" fill="#9cb2b0">An interactive journey through</text>
  <text x="80" y="429" font-family="Arial, sans-serif" font-size="18" fill="#9cb2b0">light, form and motion.</text>
  <text x="80" y="543" font-family="Arial, sans-serif" font-size="11" letter-spacing="2.6" fill="#a6c6ba">REAL-TIME CREATIVE TECHNOLOGY</text>
  <text x="1120" y="543" text-anchor="end" font-family="Arial, sans-serif" font-size="11" letter-spacing="2" fill="#c4d4c6">EXPLORE THE UNKNOWN</text>
</svg>`
await save('public/og-image.jpg', await sharp(Buffer.from(card)).jpeg({ quality: 88, mozjpeg: true }).toBuffer())
}
process.stdout.write(`Generated O icon assets. Share card ${process.argv.includes('--share-card') ? 'rebuilt' : 'preserved'}.\n`)
