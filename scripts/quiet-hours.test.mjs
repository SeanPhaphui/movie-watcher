// node --test scripts/quiet-hours.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isQuietNow, localHour } from './lib/quiet-hours.mjs'

const at = (iso) => new Date(iso)
const NIGHT = { enabled: true, start: 22, end: 8 } // wraps midnight
const DAY = { enabled: true, start: 1, end: 6 } // does not wrap

test('disabled quiet hours never defer', () => {
  assert.equal(isQuietNow({ enabled: false, start: 22, end: 8 }, 'America/Los_Angeles', at('2026-08-07T11:00:00Z')), false)
  assert.equal(isQuietNow(undefined, 'America/Los_Angeles', at('2026-08-07T11:00:00Z')), false)
})

test('11:00 UTC is 4am in Los Angeles — deferred', () => {
  assert.equal(localHour('America/Los_Angeles', at('2026-08-07T11:00:00Z')), 4)
  assert.equal(isQuietNow(NIGHT, 'America/Los_Angeles', at('2026-08-07T11:00:00Z')), true)
})

test('the same instant is 7am in New York — also deferred', () => {
  assert.equal(localHour('America/New_York', at('2026-08-07T11:00:00Z')), 7)
  assert.equal(isQuietNow(NIGHT, 'America/New_York', at('2026-08-07T11:00:00Z')), true)
})

test('the same instant is noon in London — delivered', () => {
  assert.equal(localHour('Europe/London', at('2026-08-07T11:00:00Z')), 12)
  assert.equal(isQuietNow(NIGHT, 'Europe/London', at('2026-08-07T11:00:00Z')), false)
})

test('the 17:00 UTC run is 10am in Los Angeles — delivered', () => {
  assert.equal(isQuietNow(NIGHT, 'America/Los_Angeles', at('2026-08-07T17:00:00Z')), false)
})

test('boundaries: start is quiet, end is not', () => {
  // 22:00 and 08:00 local in Los Angeles = 05:00Z and 15:00Z
  assert.equal(isQuietNow(NIGHT, 'America/Los_Angeles', at('2026-08-08T05:00:00Z')), true)
  assert.equal(isQuietNow(NIGHT, 'America/Los_Angeles', at('2026-08-07T15:00:00Z')), false)
})

test('a window that does not wrap midnight works too', () => {
  assert.equal(isQuietNow(DAY, 'Europe/London', at('2026-08-07T03:00:00Z')), true)
  assert.equal(isQuietNow(DAY, 'Europe/London', at('2026-08-07T11:00:00Z')), false)
})

test('start === end is treated as no window rather than always-quiet', () => {
  assert.equal(isQuietNow({ enabled: true, start: 9, end: 9 }, 'Europe/London', at('2026-08-07T09:30:00Z')), false)
})

test('an unknown timezone falls back to UTC instead of throwing', () => {
  assert.equal(localHour('Not/AZone', at('2026-08-07T11:00:00Z')), 11)
  assert.equal(isQuietNow(NIGHT, 'Not/AZone', at('2026-08-07T02:00:00Z')), true)
})

test('every 6-hourly run is never all-quiet for a 10-hour window', () => {
  const runs = ['05:00', '11:00', '17:00', '23:00']
  const delivered = runs.filter(
    (t) => !isQuietNow(NIGHT, 'America/Los_Angeles', at(`2026-08-07T${t}:00Z`)),
  )
  assert.ok(delivered.length >= 1, 'at least one run must be able to deliver')
})
