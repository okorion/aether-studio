/* global URL */
// CDP diagnostics only. Never persist cookies, authorization, or response bodies.
import { writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const headerNames = new Set(['content-type', 'content-encoding', 'content-length', 'cache-control', 'age', 'etag', 'vary', 'x-vercel-cache', 'x-vercel-id', 'content-range', 'accept-ranges'])
const headers = values => Object.fromEntries(Object.entries(values).filter(([key]) => headerNames.has(key.toLowerCase())))
const safeURL = value => {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}` : '' } catch { return '' }
}

export async function createNetworkProbe(page, { cpu = 1, constrained = false, timeline = false } = {}) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  if (constrained) await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750,
    connectionType: 'cellular4g',
  })
  let requests = new Map()
  cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId, {
    id: e.requestId, url: safeURL(e.request.url), start: e.timestamp, type: e.type,
    priority: e.request.initialPriority, range: e.request.headers.Range ?? e.request.headers.range,
    initiator: { type: e.initiator.type, url: safeURL(e.initiator.url ?? e.initiator.stack?.callFrames?.[0]?.url), line: e.initiator.lineNumber ?? e.initiator.stack?.callFrames?.[0]?.lineNumber },
  }))
  cdp.on('Network.responseReceived', e => {
    const record = requests.get(e.requestId)
    if (record) Object.assign(record, { response: e.timestamp, status: e.response.status, headers: headers(e.response.headers), protocol: e.response.protocol,
      diskCache: e.response.fromDiskCache ?? false, serviceWorker: e.response.fromServiceWorker ?? false, timing: e.response.timing })
  })
  cdp.on('Network.responseReceivedExtraInfo', e => {
    const record = requests.get(e.requestId)
    if (record) Object.assign(record, { networkStatus: e.statusCode, networkHeaders: headers(e.headers) })
  })
  cdp.on('Network.requestServedFromCache', e => { const r = requests.get(e.requestId); if (r) r.servedFromCache = true })
  cdp.on('Network.loadingFinished', e => { const r = requests.get(e.requestId); if (r) Object.assign(r, { end: e.timestamp, wireBytes: e.encodedDataLength }) })
  cdp.on('Network.loadingFailed', e => { const r = requests.get(e.requestId); if (r) Object.assign(r, { end: e.timestamp, error: e.errorText, cancelled: e.canceled }) })
  let events = []
  cdp.on('Tracing.dataCollected', ({ value }) => {
    // Keep timing events and explicitly selected public script metadata only.
    for (const e of value) {
      const data = e.args?.data ?? {}
      events.push({ name: e.name, cat: e.cat, ph: e.ph, pid: e.pid, tid: e.tid, ts: e.ts, dur: e.dur,
        args: { data: { url: safeURL(data.url), functionName: data.functionName, scriptId: data.scriptId }, name: e.name === 'thread_name' ? e.args?.name : undefined } })
    }
  })
  return {
    async start() {
      requests = new Map(); events = []
      if (timeline) await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,disabled-by-default-v8.compile,blink.user_timing,disabled-by-default-devtools.timeline', options: 'record-as-much-as-possible' })
    },
    snapshot() { return [...requests.values()] },
    async stop(path) {
      if (!timeline) return
      const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
      await cdp.send('Tracing.end'); await done
      await writeFile(path, gzipSync(JSON.stringify({ traceEvents: events })))
    },
  }
}
