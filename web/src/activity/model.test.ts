import { expect, test } from 'vitest'
import type { AuditItem } from './describe.ts'
import { authorFilters, dayLabel, diffOf, entityLabel, formatField, groupByDay, onBehalfOf, targetOf, timeOf, whoLabel } from './model.ts'

const item = (changes: Partial<AuditItem>): AuditItem => ({ id: '1', at: '2026-10-20T12:14:00.000Z', author: 'member', member: 'Gabriela', entity: 'entry', entityId: '9', action: 'create', before: null, after: null, ...changes })

const now = new Date('2026-10-20T15:00:00.000Z')

test('builds author filters with totals, one chip per member and system only when present', () => {
  const counts = { member: 5, claude: 3, import: 2, system: 0 }
  const filters = authorFilters({ counts, memberCounts: [{ name: 'Marcio', total: 5 }] }, ['Marcio', 'Gabriela'])
  expect(filters.map(({ label, count }) => `${label} ${count}`)).toEqual(['Todos 10', 'Claude 3', 'Marcio 5', 'Gabriela 0', 'Importação 2'])
  expect(filters[2]?.query).toEqual({ author: 'member', member: 'Marcio' })
  expect(authorFilters({ counts: { ...counts, system: 4 }, memberCounts: [] }, []).map(({ key }) => key)).toEqual(['all', 'claude', 'import', 'system'])
})

test('labels days as today, yesterday or a date in America/Sao_Paulo', () => {
  expect(dayLabel('2026-10-20', now)).toBe('Hoje · 20 de outubro')
  expect(dayLabel('2026-10-19', now)).toBe('Ontem · 19 de outubro')
  expect(dayLabel('2026-09-30', now)).toBe('30 de setembro')
  expect(dayLabel('2025-12-31', now)).toBe('31 de dezembro de 2025')
  expect(dayLabel('2026-10-31', new Date('2026-11-01T02:00:00.000Z'))).toBe('Hoje · 31 de outubro')
})

test('groups items by local day keeping their order', () => {
  const days = groupByDay([item({ id: '3', at: '2026-10-20T12:00:00.000Z' }), item({ id: '2', at: '2026-10-20T02:00:00.000Z' }), item({ id: '1', at: '2026-10-19T20:00:00.000Z' })], now)
  expect(days.map(({ label, items }) => `${label}: ${items.map(({ id }) => id).join(',')}`)).toEqual(['Hoje · 20 de outubro: 3', 'Ontem · 19 de outubro: 2,1'])
  expect(timeOf('2026-10-20T02:00:00.000Z')).toBe('23:00')
})

test('names who acted, for whom and on which record', () => {
  expect(whoLabel(item({ author: 'claude', member: 'Marcio' }))).toBe('Claude')
  expect(onBehalfOf(item({ author: 'claude', member: 'Marcio' }))).toBe('Marcio')
  expect(onBehalfOf(item({}))).toBeNull()
  expect(whoLabel(item({}))).toBe('Gabriela')
  expect(whoLabel(item({ author: 'import', member: null }))).toBe('Importação')
  expect(entityLabel(item({}))).toBe('lançamento #9')
  expect(entityLabel(item({ entity: 'decision_confirmation', entityId: null }))).toBe('confirmação')
})

test('lists changed fields with readable values and hides ids and creation time', () => {
  const before = { id: 4, status: 'planned', paid_on: null, amount_cents: 39800, created_at: '2026-10-01T10:00:00-03:00', description: 'Energia' }
  const after = { ...before, status: 'paid', paid_on: '2026-10-20', amount_cents: 41230 }
  expect(diffOf(item({ action: 'update', before, after }))).toEqual([
    { field: 'situação', before: 'pendente', after: 'paga' },
    { field: 'pago em', before: '—', after: '2026-10-20' },
    { field: 'valor', before: 'R$ 398,00', after: 'R$ 412,30' },
  ])
  expect(diffOf(item({ after }))).toEqual([])
  expect(diffOf(item({ action: 'update', before: { proposed_by: 1 }, after: { proposed_by: 2 } }))).toEqual([{ field: 'proposed by', before: '1', after: '2' }])
})

test('formats timestamps and statuses of decisions', () => {
  expect(formatField('closed_at', '2026-10-21T03:20:39.483241-03:00')).toBe('21/10/2026 03:20')
  expect(formatField('status', 'rejected')).toBe('rejeitada')
  expect(formatField('tags', ['a'])).toBe('["a"]')
})

test('points each record to its screen and entries to their month', () => {
  expect(targetOf(item({ after: { competence: '2026-09-01' } }))).toEqual({ to: '/lancamentos', month: '2026-09' })
  expect(targetOf(item({ entity: 'decision_confirmation' }))).toEqual({ to: '/decisoes' })
  expect(targetOf(item({ entity: 'goal' }))).toEqual({ to: '/patrimonio' })
  expect(targetOf(item({ entity: 'category' }))).toBeUndefined()
})
