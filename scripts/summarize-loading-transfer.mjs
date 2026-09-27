/* global process, console */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'

const directory = process.argv[2]
if (!directory) throw new Error('evidence directory required')
const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const stats = values => {
  if (!values.length) return null
  const med = median(values)
  return { n: values.length, median: med, mad: median(values.map(x => Math.abs(x - med))), min: Math.min(...values), max: Math.max(...values) }
}
const output = {}
for (const file of await readdir(directory)) {
  if (!file.endsWith('.json') || file === 'summary.json') continue
  const data = JSON.parse(await readFile(join(directory, file), 'utf8'))
  if (!Array.isArray(data.results)) continue
  const sameTarget = Boolean(data.targets?.baseline && data.targets.baseline === data.targets.candidate)
  const groups = {}
  const metrics = {
    firstFrame: r => r.loading.firstFrame, visibleReady: r => r.loading.visibleReady,
    overlayHidden: r => r.loading.overlayHidden,
    fadeDuration: r => typeof r.loading.overlayHidden === 'number' ? r.loading.overlayHidden - r.loading.visibleReady : NaN,
    scrollP95: r => r.scroll.p95, scrollMax: r => r.scroll.max, scrollOver33: r => r.scroll.over33ms,
    jsWireBytes: r => r.loading.network.filter(x => x.type === 'Script').reduce((s, x) => s + (x.wireBytes ?? 0), 0),
    jsResourceTransferBytes: r => r.loading.resources.filter(x => x.path.endsWith('.js')).reduce((s, x) => s + x.transferBytes, 0),
    revalidations: r => r.loading.network.filter(x => x.networkStatus === 304).length,
  }
  for (const label of ['baseline', 'candidate', ...(sameTarget ? ['pooled'] : [])]) for (const visit of ['fresh', 'reload']) {
    const rows = data.results.filter(r => (label === 'pooled' || r.label === label) && r.visit === visit)
    groups[`${label}-${visit}`] = Object.fromEntries(Object.entries(metrics).map(([key, fn]) => [key, stats(rows.map(fn).filter(Number.isFinite))]))
    groups[`${label}-${visit}`].phases = Object.fromEntries([...new Set(rows.flatMap(r => r.loading.measures.map(x => x.name)))].map(name => [name, stats(rows.flatMap(r => r.loading.measures.filter(x => x.name === name).map(x => x.duration)))]))
  }
  const paired = {}
  for (const visit of sameTarget ? [] : ['fresh', 'reload']) for (const [metric, fn] of Object.entries(metrics)) {
    const deltas = data.results.filter(r => r.label === 'baseline' && r.visit === visit).flatMap(before => {
      const after = data.results.find(r => r.label === 'candidate' && r.visit === visit && r.pair === before.pair)
      return after && Number.isFinite(fn(before)) && Number.isFinite(fn(after)) ? [fn(before) - fn(after)] : []
    })
    paired[`${visit}-${metric}`] = { ...stats(deltas), positivePairs: deltas.filter(x => x > 0).length, values: deltas }
  }
  const traces = []
  for (const r of data.results) {
    const path = `${file}.${r.pair}-${r.label}-${r.visit}.trace.json.gz`
    let events
    try { events = JSON.parse(gunzipSync(await readFile(join(directory, path)))).traceEvents } catch (e) { if (e.code === 'ENOENT') continue; throw e }
    const firstModule = events.find(e => e.name === 'v8.evaluateModule' && e.dur)
    if (!firstModule) continue
    const nav = r.loading.network.find(n => n.type === 'Document')
    const start = nav.start * 1e6
    const end = start + r.loading.firstFrame * 1000
    const selected = events.filter(e => e.dur && e.ts >= start && e.ts < end && e.pid === firstModule.pid)
    const names = ['V8.ParseProgram', 'V8.ParseFunction', 'V8.PreParse', 'v8.parseOnBackground', 'V8.CompileCode', 'V8.CompileCodeBackground', 'v8.compileModule', 'v8.evaluateModule']
    traces.push({ path, mainThread: firstModule.tid, window: { start, end },
      note: 'Named event inclusive durations; nested categories overlap. Do not sum categories or threads as wall-clock parse time. Includes measurement scripts unless public URL is present.',
      events: Object.fromEntries(names.map(name => [name, {
        main: stats(selected.filter(e => e.name === name && e.tid === firstModule.tid).map(e => e.dur / 1000)),
        mainInclusiveMs: selected.filter(e => e.name === name && e.tid === firstModule.tid).reduce((s, e) => s + e.dur / 1000, 0),
        backgroundInclusiveMs: selected.filter(e => e.name === name && e.tid !== firstModule.tid).reduce((s, e) => s + e.dur / 1000, 0),
      }])),
      longTasks: selected.filter(e => e.name === 'RunTask' && e.tid === firstModule.tid && e.dur > 50000).map(e => ({ startMs: (e.ts - start) / 1000, durationMs: e.dur / 1000 })),
    })
  }
  output[file] = { comparison: sameTarget ? 'A/A: same target, no optimization delta' : 'A/B: see experiment conditions', groups, paired, traces, errors: data.results.flatMap(r => r.errors) }
}
await writeFile(join(directory, 'summary.json'), JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(Object.fromEntries(Object.entries(output).map(([key, value]) => [key, { groups: Object.fromEntries(Object.entries(value.groups).map(([group, stats]) => [group, { firstFrame: stats.firstFrame, visibleReady: stats.visibleReady, revalidations: stats.revalidations }])), paired: value.paired['reload-firstFrame'] }])), null, 2))
