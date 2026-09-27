/* global process, console, URL, Buffer */
// Controlled local HTTP model, not a Vercel/CDN emulator. Both ports serve identical bytes.
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { brotliCompressSync } from 'node:zlib'

const root = resolve(process.argv[2] ?? 'dist')
const baselinePort = Number(process.argv[3] ?? 5194)
const candidatePort = Number(process.argv[4] ?? 5195)
const files = new Map()
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' }
async function load(path) {
  if (files.has(path)) return files.get(path)
  const body = await readFile(path)
  const type = types[extname(path)] ?? 'application/octet-stream'
  const br = /(?:text\/|javascript|json)/.test(type) ? brotliCompressSync(body) : null
  const record = { body, br, type, etag: `"${createHash('sha256').update(body).digest('hex')}"` }
  files.set(path, record)
  return record
}
// Compression and file reads finish before performance measurement begins.
async function preload(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) await preload(path)
    else await load(path)
  }
}
await preload(root)
for (const [port, immutable] of [[baselinePort, false], [candidatePort, true]]) {
  createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
      if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return }
      const file = await load(path)
      const hashed = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$/.test(pathname)
      const responseHeaders = { 'Content-Type': file.type, ETag: file.etag,
        'Cache-Control': immutable && hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
        Vary: 'Accept-Encoding', 'Accept-Ranges': 'bytes' }
      if (req.headers['if-none-match'] === file.etag) { res.writeHead(304, responseHeaders); res.end(); return }
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
      if (range) {
        const start = Number(range[1]); const end = Math.min(range[2] ? Number(range[2]) : file.body.length - 1, file.body.length - 1)
        if (start > end || start >= file.body.length) { res.writeHead(416, { 'Content-Range': `bytes */${file.body.length}` }); res.end(); return }
        const body = file.body.subarray(start, end + 1)
        res.writeHead(206, { ...responseHeaders, 'Content-Range': `bytes ${start}-${end}/${file.body.length}`, 'Content-Length': body.length }); res.end(body); return
      }
      const compressed = file.br && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')
      const body = compressed ? file.br : file.body
      res.writeHead(200, { ...responseHeaders, 'Content-Length': Buffer.byteLength(body), ...(compressed ? { 'Content-Encoding': 'br' } : {}) })
      res.end(body)
    } catch {
      res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('Not found')
    }
  }).listen(port, '127.0.0.1', () => console.log(`${port}: ${immutable ? 'hashed assets immutable' : 'all revalidate'}; ${root}`))
}
