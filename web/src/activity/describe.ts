import type { components } from '../api/schema.ts'
import { formatBrl } from '../lib/format.ts'

export type AuditItem = components['schemas']['AuditItem']

const zone = 'America/Sao_Paulo'

const clock = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: zone })

const text = (record: Record<string, unknown> | null, key: string) => {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

const cents = (record: Record<string, unknown> | null, key: string) => {
  const value = record?.[key]
  return typeof value === 'number' || typeof value === 'string' ? formatBrl(BigInt(value)) : undefined
}

export const entities: Record<string, string> = {
  entry: 'lançamento',
  decision: 'decisão',
  decision_confirmation: 'confirmação',
  reserve: 'reserva',
  goal: 'meta',
  debt: 'dívida',
  member: 'membro',
  account: 'conta',
  category: 'categoria',
  income: 'receita',
  recurring_expense: 'despesa recorrente',
}

const verbs = { create: 'Criou', update: 'Alterou', close: 'Encerrou' }

const describeEntry = ({ action, before, after }: AuditItem) => {
  const name = text(after, 'description') ?? text(before, 'description') ?? 'lançamento'
  if (action === 'create') return [`Lançou ${name}`, cents(after, 'amount_cents')].filter(Boolean).join(' · ')
  if (action === 'update' && text(after, 'status') === 'paid' && text(before, 'status') !== 'paid') return `Marcou ${name} como paga`
  return `${verbs[action]} ${name}`
}

export const describeAudit = (item: AuditItem) => {
  if (item.entity === 'entry') return describeEntry(item)
  if (item.entity === 'decision' && item.action === 'create') return `Propôs ${text(item.after, 'title') ?? 'uma decisão'}`
  if (item.entity === 'decision_confirmation') return 'Confirmou uma decisão'
  return `${verbs[item.action]} ${entities[item.entity] ?? item.entity}`
}

export const authorLabel = ({ author, member }: AuditItem) => {
  if (author === 'claude') return member ? `Claude, a pedido de ${member}` : 'Claude'
  if (author === 'member') return member ?? 'Membro'
  return author === 'import' ? 'Importação' : 'Sistema'
}

export const formatWhen = (at: string) => clock.format(new Date(at))
