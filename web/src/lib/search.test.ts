import { expect, test } from 'vitest'
import { firstDay, monthOf, parseSearch, shiftMonth } from './search.ts'

test('keeps only a valid month and a non-empty member', () => {
  expect(parseSearch({ month: '2026-10', member: ' Marcio ' })).toEqual({ month: '2026-10', member: 'Marcio' })
  expect(parseSearch({ month: '2026-13', member: '  ' })).toEqual({})
  expect(parseSearch({ month: 202610, member: 1 })).toEqual({})
})

test('defaults to the current month in America/Sao_Paulo', () => {
  expect(monthOf({}, new Date('2026-11-01T02:00:00Z'))).toBe('2026-10')
  expect(monthOf({ month: '2025-01' })).toBe('2025-01')
})

test('moves across years', () => {
  expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  expect(firstDay('2026-10')).toBe('2026-10-01')
})
