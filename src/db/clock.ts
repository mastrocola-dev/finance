const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/

export const fixedClock = (value = process.env.FINANCE_CLOCK) => {
  if (!value) return undefined
  if (!instant.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`FINANCE_CLOCK must be a time like 2026-10-18T12:00:00-03:00, got ${value}`)
  return value
}

export const clockNow = (clock = fixedClock()) => (clock ? new Date(clock) : new Date())
