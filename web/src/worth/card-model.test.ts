import { expect, test } from 'vitest'
import { type Card, cardView, releaseBars } from './card-model.ts'

const money = (cents: number) => ({ cents: String(cents), brl: '' })

const card = (overrides: Partial<Card> = {}): Card => ({
  id: '3',
  nickname: 'Cartão Marcio',
  institution: 'Banco Exemplo',
  lastFour: '4242',
  member: null,
  limit: money(800000),
  committed: money(800000),
  available: money(0),
  installments: [],
  releases: [
    { month: '2026-12-01', amount: money(40000) },
    { month: '2027-12-01', amount: money(10000) },
  ],
  ...overrides,
})

test('fills twelve months from the month and leaves later releases out', () => {
  const bars = releaseBars(card(), '2026-11')
  expect(bars).toHaveLength(12)
  expect(bars[0]).toEqual({ month: '2026-11-01', label: 'nov', cents: 0 })
  expect(bars[1]?.cents).toBe(40000)
  expect(bars.at(-1)?.month).toBe('2027-10-01')
})

test('a full limit is not over it, a joint card says so and the first release names its month', () => {
  const view = cardView(card(), '2026-11')
  expect(view.meta).toBe('Banco Exemplo · final 4242 · Conjunto')
  expect(view.limit).toEqual({ percent: 100, over: false, label: 'R$ 8.000,00 de R$ 8.000,00 do limite em uso', available: 'R$ 0,00' })
  expect(view.release).toBe('Libera R$ 400,00 em dezembro')
  expect(view.chartLabel).toBe('Liberações nos próximos 12 meses: R$ 400,00 em dezembro')
})

test('caps the bar at the full track and names the year of a release in another year', () => {
  const view = cardView(card({ limit: money(100000), available: money(-700000), releases: [{ month: '2027-01-01', amount: money(800000) }] }), '2026-11')
  expect(view.limit?.percent).toBe(100)
  expect(view.limit?.over).toBe(true)
  expect(view.release).toBe('Libera R$ 8.000,00 em janeiro de 2027')
})

test('a card without limit or installments has neither bar nor release', () => {
  const view = cardView(card({ limit: null, available: null, committed: money(0), releases: [] }), '2026-11')
  expect(view.limit).toBeNull()
  expect(view.release).toBeNull()
  expect(view.chartLabel).toBe('Nenhuma liberação nos próximos 12 meses')
})
