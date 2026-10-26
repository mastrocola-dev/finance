import { expect, test } from 'vitest'
import { type AuditItem, authorLabel, describeAudit, formatWhen } from './describe.ts'

const item = (changes: Partial<AuditItem>): AuditItem => ({ id: '1', at: '2026-10-20T12:14:00.000Z', author: 'member', member: 'Gabriela', entity: 'entry', entityId: '9', action: 'create', subject: null, before: null, after: null, ...changes })

test('describes entries, payments, decisions and other changes in Portuguese', () => {
  expect(describeAudit(item({ subject: 'Mercado', after: { description: 'Mercado', amount_cents: 38620 } }))).toBe('Lançou Mercado · R$ 386,20')
  expect(describeAudit(item({ subject: 'Energia', action: 'update', before: { status: 'planned' }, after: { status: 'paid' } }))).toBe('Marcou Energia como paga')
  expect(describeAudit(item({ subject: 'Salário', action: 'update', before: { status: 'planned' }, after: { status: 'paid', direction: 'income' } }))).toBe('Marcou Salário como recebida')
  expect(describeAudit(item({ subject: 'Energia', action: 'close' }))).toBe('Encerrou Energia')
  expect(describeAudit(item({ subject: 'Fundo de emergência', entity: 'reserve', action: 'update' }))).toBe('Alterou reserva Fundo de emergência')
  expect(describeAudit(item({ subject: 'Banco Horizonte', entity: 'debt' }))).toBe('Criou dívida Banco Horizonte')
})

test('names the decision in every decision event', () => {
  const decision = (changes: Partial<AuditItem>) => item({ entity: 'decision', subject: 'Trocar plano de internet', ...changes })
  expect(describeAudit(decision({}))).toBe('Propôs Trocar plano de internet')
  expect(describeAudit(decision({ entity: 'decision_confirmation' }))).toBe('Confirmou Trocar plano de internet')
  expect(describeAudit(decision({ action: 'close', after: { status: 'confirmed' } }))).toBe('Decisão aprovada: Trocar plano de internet')
  expect(describeAudit(decision({ action: 'close', after: { status: 'rejected' } }))).toBe('Recusou Trocar plano de internet')
  expect(describeAudit(decision({ action: 'close', after: { status: 'withdrawn' } }))).toBe('Retirou Trocar plano de internet')
  expect(describeAudit(decision({ action: 'update' }))).toBe('Alterou decisão Trocar plano de internet')
})

test('falls back to the kind of record when the subject is unknown', () => {
  expect(describeAudit(item({ entity: 'reserve', action: 'update' }))).toBe('Alterou reserva')
  expect(describeAudit(item({ entity: 'decision_confirmation' }))).toBe('Confirmou uma decisão')
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
