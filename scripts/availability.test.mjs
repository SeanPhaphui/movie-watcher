// node --test scripts/availability.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeState,
  composeMessage,
  deriveStatus,
  hasPendingWatcher,
  sameStatus,
  shouldCheck,
} from './lib/availability.mjs'

const TODAY = '2026-08-06'
const provider = (id, name) => ({ provider_id: id, provider_name: name, logo_path: `/${id}.jpg` })
const movie = ({ us = {}, dates = [] } = {}) => ({
  title: 'Test Movie',
  release_dates: { results: [{ iso_3166_1: 'US', release_dates: dates }] },
  'watch/providers': { results: { US: us } },
})

test('in theaters only: no providers, no digital date → nothing fires', () => {
  const s = computeState(movie({ dates: [{ type: 3, release_date: '2026-07-01T00:00:00.000Z' }] }), TODAY)
  assert.equal(s.digitalReleased, false)
  assert.equal(s.rentBuy, false)
  assert.equal(s.freeWithSub, false)
})

test('future digital date does not count as released', () => {
  const s = computeState(movie({ dates: [{ type: 4, release_date: '2026-09-15T00:00:00.000Z' }] }), TODAY)
  assert.equal(s.digitalReleased, false)
})

test('past digital date counts as released even with no providers listed', () => {
  const s = computeState(movie({ dates: [{ type: 4, release_date: '2026-07-15T00:00:00.000Z' }] }), TODAY)
  assert.equal(s.digitalReleased, true)
  assert.equal(s.rentBuy, false)
})

test('rent/buy only → rentBuy and digital fire, free does not', () => {
  const s = computeState(movie({ us: { rent: [provider(2, 'Apple TV')], buy: [provider(2, 'Apple TV')] } }), TODAY)
  assert.equal(s.rentBuy, true)
  assert.equal(s.digitalReleased, true)
  assert.equal(s.freeWithSub, false)
  assert.equal(s.providers.rent.length, 1)
})

test('subscription streaming → free fires and names the service', () => {
  const s = computeState(movie({ us: { flatrate: [provider(1899, 'Max')] } }), TODAY)
  assert.equal(s.freeWithSub, true)
  assert.equal(s.digitalReleased, true)
  assert.match(composeMessage('free', 'Dune: Part Two', s).body, /Max/)
})

test('ad-supported tier counts as free', () => {
  const s = computeState(movie({ us: { ads: [provider(613, 'Freevee')] } }), TODAY)
  assert.equal(s.freeWithSub, true)
})

test('provider appearing in several buckets is deduped', () => {
  const s = computeState(
    movie({ us: { rent: [provider(2, 'Apple TV'), provider(2, 'Apple TV')], buy: [provider(2, 'Apple TV')] } }),
    TODAY,
  )
  assert.equal(s.providers.rent.length, 1)
})

test('non-US providers are ignored', () => {
  const m = movie({ us: {} })
  m['watch/providers'].results.GB = { flatrate: [provider(8, 'Netflix')] }
  const s = computeState(m, TODAY)
  assert.equal(s.freeWithSub, false)
})

test('missing TMDB sections do not throw', () => {
  const s = computeState({ title: 'Bare' }, TODAY)
  assert.equal(s.digitalReleased, false)
  assert.deepEqual(s.providers.flatrate, [])
})

test('rentBuy message names a rent provider', () => {
  const s = computeState(movie({ us: { buy: [provider(10, 'Amazon Video')] } }), TODAY)
  assert.match(composeMessage('rentBuy', 'Nosferatu', s).body, /Amazon Video/)
})

test('digital message falls back gracefully with no providers', () => {
  const s = computeState(movie({ dates: [{ type: 4, release_date: '2026-07-01T00:00:00.000Z' }] }), TODAY)
  const msg = composeMessage('digital', 'Wicked', s)
  assert.match(msg.title, /Wicked/)
  assert.match(msg.body, /digital release/)
})

// ── denormalized badge status ──

test('subscription streaming outranks rent/buy in the badge', () => {
  const s = computeState(
    movie({ us: { flatrate: [provider(8, 'Netflix')], rent: [provider(2, 'Apple TV')] } }),
    TODAY,
  )
  assert.deepEqual(deriveStatus(s), { kind: 'streaming', service: 'Netflix' })
})

test('rent/buy only yields a rentBuy badge naming the store', () => {
  const s = computeState(movie({ us: { rent: [provider(2, 'Apple TV')] } }), TODAY)
  assert.deepEqual(deriveStatus(s), { kind: 'rentBuy', service: 'Apple TV' })
})

test('digital date passed with no providers yields a bare digital badge', () => {
  const s = computeState(movie({ dates: [{ type: 4, release_date: '2026-07-01T00:00:00.000Z' }] }), TODAY)
  assert.deepEqual(deriveStatus(s), { kind: 'digital', service: null })
})

test('nothing available yields null so the client falls back to release date', () => {
  assert.equal(deriveStatus(computeState(movie(), TODAY)), null)
})

test('sameStatus treats null and unset alike, and detects a service change', () => {
  assert.equal(sameStatus(null, undefined), true)
  assert.equal(sameStatus({ kind: 'streaming', service: 'Max' }, { kind: 'streaming', service: 'Max' }), true)
  assert.equal(sameStatus({ kind: 'streaming', service: 'Max' }, { kind: 'streaming', service: 'Hulu' }), false)
  assert.equal(sameStatus(null, { kind: 'digital', service: null }), false)
})

// ── skip logic: a false negative here silently drops a notification ──

const NOW = Date.parse('2026-08-06T00:00:00Z')
const days = (n) => NOW - n * 86_400_000
const watcher = (notify, notified = {}) => ({ notify, notified })

test('watcher subscribed but not yet notified is pending', () => {
  assert.equal(hasPendingWatcher([watcher({ digital: true, rentBuy: false, free: false })]), true)
})

test('watcher already notified for their only subscription is not pending', () => {
  assert.equal(
    hasPendingWatcher([watcher({ digital: true, rentBuy: false, free: false }, { digital: 1 })]),
    false,
  )
})

test('watcher with all toggles off is not pending', () => {
  assert.equal(hasPendingWatcher([watcher({ digital: false, rentBuy: false, free: false })]), false)
})

test('one pending watcher among many settled ones keeps the movie live', () => {
  const watchers = [
    watcher({ digital: true, free: true }, { digital: 1, free: 1 }),
    watcher({ digital: true, free: true }, { digital: 1, free: 1 }),
    watcher({ digital: true, free: true }, { digital: 1 }), // free still pending
  ]
  assert.equal(hasPendingWatcher(watchers), true)
})

test('re-enabling a toggle brings a settled movie back into scope', () => {
  const settled = [watcher({ digital: true, free: false }, { digital: 1 })]
  assert.equal(shouldCheck(settled, days(1), NOW), false)
  const reEnabled = [watcher({ digital: true, free: true }, { digital: 1 })]
  assert.equal(shouldCheck(reEnabled, days(1), NOW), true)
})

test('pending movie is checked even if just checked a moment ago', () => {
  assert.equal(shouldCheck([watcher({ digital: true })], days(0), NOW), true)
})

test('settled movie is skipped while fresh, rechecked once stale', () => {
  const settled = [watcher({ digital: true }, { digital: 1 })]
  assert.equal(shouldCheck(settled, days(3), NOW, 14), false)
  assert.equal(shouldCheck(settled, days(20), NOW, 14), true)
})

test('never-checked movie is always checked', () => {
  assert.equal(shouldCheck([watcher({ digital: true }, { digital: 1 })], undefined, NOW), true)
})

test('movie with no watchers left is not pending but still refreshed when stale', () => {
  assert.equal(shouldCheck([], days(1), NOW, 14), false)
  assert.equal(shouldCheck([], days(30), NOW, 14), true)
})

test('earliest of multiple digital dates wins', () => {
  const s = computeState(
    movie({
      dates: [
        { type: 4, release_date: '2026-12-01T00:00:00.000Z' },
        { type: 4, release_date: '2026-06-01T00:00:00.000Z' },
      ],
    }),
    TODAY,
  )
  assert.equal(s.digitalReleased, true)
})
