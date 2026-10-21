import { expect, test } from 'vitest'
import { currentMonth, formatBrl, formatDay, formatMonth, formatMonthShort, formatMonthTitle, formatNetShort, formatThousandsBrl, today } from './format.ts'

test('formats cents as BRL with thousands and a comma', () => {
  expect(formatBrl('123456')).toBe('R$ 1.234,56')
  expect(formatBrl(5900n)).toBe('R$ 59,00')
  expect(formatBrl('7')).toBe('R$ 0,07')
  expect(formatBrl('-100000000')).toBe('-R$ 1.000.000,00')
  expect(formatBrl('900719925474099312')).toBe('R$ 9.007.199.254.740.993,12')
})

test('formats a date as day and month', () => {
  expect(formatDay('2026-10-20')).toBe('20/10')
  expect(formatDay('2026-01-01')).toBe('01/01')
})

test('formats a month in long Portuguese', () => {
  expect(formatMonth('2026-10-01')).toBe('outubro de 2026')
  expect(formatMonth('2026-03')).toBe('março de 2026')
  expect(formatMonthTitle('2026-10-01')).toBe('Outubro de 2026')
})

test('takes today and the current month in America/Sao_Paulo', () => {
  const lateNightUtc = new Date('2026-11-01T02:30:00Z')
  expect(today(lateNightUtc)).toBe('2026-10-31')
  expect(currentMonth(lateNightUtc)).toBe('2026-10-01')
  expect(currentMonth(new Date('2026-11-01T03:30:00Z'))).toBe('2026-11-01')
})

test('formats amounts in thousands for the flow chart', () => {
  expect(formatThousandsBrl(2_140_000n)).toBe('R$ 21,4 mil')
  expect(formatThousandsBrl(-125_000n)).toBe('-R$ 1,3 mil')
  expect(formatNetShort(530_000n)).toBe('+5,3k')
  expect(formatNetShort(-48_000n)).toBe('−0,5k')
  expect(formatNetShort(0n)).toBe('+0,0k')
  expect(formatMonthShort('2026-05-01')).toBe('mai')
})
