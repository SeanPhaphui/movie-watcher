// Timezone-aware quiet hours. The checker runs on a UTC cron, so without this
// a user in Los Angeles gets woken at 3am by the 11:00 UTC run.

export const DEFAULT_QUIET = { enabled: false, start: 22, end: 8 }

/** Hour 0-23 in the given IANA zone. Falls back to UTC on a bad zone. */
export function localHour(timezone, now = new Date()) {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(now),
    )
  } catch {
    return now.getUTCHours()
  }
}

/**
 * Should we hold this notification back right now?
 *
 * Deferring must never mark the alert as sent — the caller skips the whole
 * send-and-record step so a later run delivers it. With the checker running
 * every 6 hours, any window under ~18 hours is guaranteed a delivery slot.
 */
export function isQuietNow(quiet, timezone, now = new Date()) {
  if (!quiet?.enabled) return false

  const start = Number(quiet.start)
  const end = Number(quiet.end)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start === end) return false

  const hour = localHour(timezone, now)
  // A window like 22 -> 8 wraps past midnight; 1 -> 6 does not.
  return start > end ? hour >= start || hour < end : hour >= start && hour < end
}
