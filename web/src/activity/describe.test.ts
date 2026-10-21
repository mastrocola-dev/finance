import { expect, test } from 'vitest'
import { type AuditItem, authorLabel, describeAudit, formatWhen } from './describe.ts'

const item = (changes: Partial<AuditItem>): AuditItem => ({ id: '1', at: '2026-10-20T12:14:00.000Z', author: 'member', member: 'Gabriela', entity: 'entry', entityId: '9', action: 'create', before: null, after: null, ...changes })

test('describes entries, payments, decisions and other changes in Portuguese', () => {
  expect(describeAudit(item({ after: { description: 'Mercado', amount_cents: 38620 } }))).toBe('Lançou Mercado · R$ 386,20')
  expect(describeAudit(item({ action: 'update', before: { description: 'Energia', status: 'planned' }, after: { description: 'Energia', status: 'paid' } }))).toBe('Marcou Energia como paga')
  expect(describeAudit(item({ action: 'close', before: { description: 'Energia' } }))).toBe('Encerrou Energia')
  expect(describeAudit(item({ entity: 'decision', after: { title: 'Trocar plano de internet' } }))).toBe('Propôs Trocar plano de internet')
  expect(describeAudit(item({ entity: 'decision_confirmation' }))).toBe('Confirmou uma decisão')
  expect(describeAudit(item({ entity: 'reserve', action: 'update' }))).toBe('Alterou reserva')
})

test('labels Claude acting for a member, members, imports and the system', () => {
  expect(authorLabel(item({ author: 'claude', member: 'Marcio' }))).toBe('Claude, a pedido de Marcio')
  expect(authorLabel(item({}))).toBe('Gabriela')
  expect(authorLabel(item({ author: 'import', member: null }))).toBe('Importação')
  expect(authorLabel(item({ author: 'system', member: null }))).toBe('Sistema')
})

test('shows the time in America/Sao_Paulo', () => {
  expect(formatWhen('2026-10-20T12:14:00.000Z')).toBe('20/10, 09:14')
})
