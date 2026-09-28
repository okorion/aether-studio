export function clipTraceWindow(events, start, end, pid) {
  return events.flatMap(event => {
    if (event.pid !== pid || !(event.dur > 0)) return []
    const clippedStart = Math.max(event.ts, start)
    const clippedEnd = Math.min(event.ts + event.dur, end)
    return clippedEnd > clippedStart
      ? [{ ...event, ts: clippedStart, dur: clippedEnd - clippedStart }]
      : []
  })
}
