import assert from 'node:assert/strict'
import test from 'node:test'
import { clipTraceWindow } from './clip-trace-window.mjs'

test('trace window clips both boundaries and preserves the source events', () => {
  const events = [
    { name: 'left', ts: 50, dur: 80, pid: 1 },
    { name: 'right', ts: 180, dur: 80, pid: 1 },
    { name: 'spanning', ts: 50, dur: 200, pid: 1 },
    { name: 'inside', ts: 120, dur: 10, pid: 1 },
    { name: 'before', ts: 50, dur: 50, pid: 1 },
    { name: 'after', ts: 200, dur: 10, pid: 1 },
    { name: 'other-process', ts: 120, dur: 10, pid: 2 },
    { name: 'instant', ts: 120, pid: 1 },
  ]
  const original = JSON.stringify(events)
  assert.deepEqual(clipTraceWindow(events, 100, 200, 1), [
    { name: 'left', ts: 100, dur: 30, pid: 1 },
    { name: 'right', ts: 180, dur: 20, pid: 1 },
    { name: 'spanning', ts: 100, dur: 100, pid: 1 },
    { name: 'inside', ts: 120, dur: 10, pid: 1 },
  ])
  assert.equal(JSON.stringify(events), original)
})
