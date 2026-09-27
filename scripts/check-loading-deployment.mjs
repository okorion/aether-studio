/* global process, console, URL, fetch, Buffer */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const origin = new URL(process.argv[2])
const output = process.argv[3]
if (!output) throw new Error('usage: node scripts/check-loading-deployment.mjs URL output.json')
const hash = body => createHash('sha256').update(body).digest('hex')
const keep = new Set(['cache-control', 'content-encoding', 'content-type', 'age', 'etag', 'x-vercel-cache', 'x-vercel-id'])
const records = []
for (const path of ['index.html', ...(await readdir('dist/assets')).map(file => `assets/${file}`)]) {
  const url = new URL(path === 'index.html' ? '/' : path, origin)
  const response = await fetch(url, { redirect: 'manual' })
  const remote = Buffer.from(await response.arrayBuffer())
  const local = await readFile(`dist/${path}`)
  records.push({ path, status: response.status, headers: Object.fromEntries([...response.headers].filter(([name]) => keep.has(name))),
    decodedBytes: remote.length, remoteSHA256: hash(remote), localSHA256: hash(local), equal: hash(local) === hash(remote) })
}
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), origin: origin.origin, records }, null, 2) + '\n')
console.log(JSON.stringify(records.map(({ path, equal, status }) => ({ path, equal, status }))))
if (records.some(r => !r.equal || r.status !== 200)) process.exitCode = 1
