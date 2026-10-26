import type { components } from '../api/schema.ts'
import { formatBrl, today } from '../lib/format.ts'
import { type AuditItem, entities } from './describe.ts'

export type AuditPage = components['schemas']['AuditPage']

export type AuditFilter = { key: string; label: string; count: number; query: { author?: AuditItem['author']; member?: string } }

export type DiffRow = { field: string; before: string; after: string }

export type Day = { key: string; label: string; items: AuditItem[] }

const zone = 'America/Sao_Paulo'

const longDay = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' })

const longDayYear = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: zone })

const stamp = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zone })

export const allFilter: AuditFilter = { key: 'all', label: 'Todos', count: 0, query: {} }

export const authorFilters = ({ counts, memberCounts }: Pick<AuditPage, 'counts' | 'memberCounts'>, members: string[]): AuditFilter[] => [
  { ...allFilter, count: counts.member + counts.claude + counts.import + counts.system },
  { key: 'claude', label: 'Claude', count: counts.claude, query: { author: 'claude' } },
  ...members.map((name) => ({ key: `member:${name}`, label: name, count: memberCounts.find((row) => row.name === name)?.total ?? 0, query: { author: 'member' as const, member: name } })),
  { key: 'import', label: 'Importação', count: counts.import, query: { author: 'import' } },
  ...(counts.system > 0 ? [{ key: 'system', label: 'Sistema', count: counts.system, query: { author: 'system' as const } }] : []),
]

const utcDay = (key: string) => new Date(`${key}T12:00:00Z`)

const shiftDay = (key: string, by: number) => new Date(utcDay(key).getTime() + by * 86_400_000).toISOString().slice(0, 10)

export const dayLabel = (key: string, now = new Date()) => {
  const current = today(now)
  const text = (key.slice(0, 4) === current.slice(0, 4) ? longDay : longDayYear).format(utcDay(key))
  if (key === current) return `Hoje · ${text}`
  if (key === shiftDay(current, -1)) return `Ontem · ${text}`
  return text
}

export const groupByDay = (items: AuditItem[], now = new Date()) =>
  items.reduce<Day[]>((days, item) => {
    const key = today(new Date(item.at))
    const last = days.at(-1)
    if (last?.key === key) last.items.push(item)
    else days.push({ key, label: dayLabel(key, now), items: [item] })
    return days
  }, [])

export const timeOf = (at: string) => clock.format(new Date(at))

const actions = { create: 'criou', update: 'alterou', close: 'encerrou' }

export const actionLabel = ({ action }: AuditItem) => actions[action]

export const entityLabel = ({ entity, entityId }: AuditItem) => [entities[entity] ?? entity, entityId && `#${entityId}`].filter(Boolean).join(' ')

export const onBehalfOf = ({ author, member }: AuditItem) => (author === 'claude' ? member : null)

export const whoLabel = ({ author, member }: AuditItem) => (author === 'claude' ? 'Claude' : author === 'member' ? (member ?? 'Membro') : author === 'import' ? 'Importação' : 'Sistema')

const fields: Record<string, string> = {
  status: 'situação',
  paid_on: 'pago em',
  due_on: 'vencimento',
  amount_cents: 'valor',
  balance_cents: 'saldo',
  target_cents: 'meta',
  description: 'descrição',
  title: 'título',
  name: 'nome',
  nickname: 'apelido',
  competence: 'competência',
  category_id: 'categoria',
  account_id: 'conta',
  member_id: 'membro',
  share_percent: 'divisão',
  replaced_by: 'substituído por',
  closed_at: 'encerrado em',
}

const statuses: Record<string, string> = { planned: 'pendente', paid: 'paga', late: 'atrasada', proposed: 'proposta', confirmed: 'confirmada', rejected: 'rejeitada', withdrawn: 'retirada' }

const hidden = new Set(['id', 'created_at'])

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export const formatField = (key: string, value: unknown) => {
  if (value === null || value === undefined) return '—'
  if (key.endsWith('_cents') && (typeof value === 'number' || typeof value === 'string')) return formatBrl(BigInt(value))
  if (key === 'status' && typeof value === 'string') return statuses[value] ?? value
  if (typeof value === 'string') return timestamp.test(value) ? stamp.format(new Date(value)).replace(',', '') : value
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export const diffOf = ({ before, after }: AuditItem): DiffRow[] => {
  if (!before || !after) return []
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !hidden.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
  return keys.map((key) => ({ field: fields[key] ?? key.replaceAll('_', ' '), before: formatField(key, before[key]), after: formatField(key, after[key]) }))
}

type Target = { to: '/lancamentos' | '/decisoes' | '/patrimonio'; hash?: string; month?: string }

const pages: Record<string, Target['to']> = { entry: '/lancamentos', decision: '/decisoes', decision_confirmation: '/decisoes', reserve: '/patrimonio', goal: '/patrimonio', debt: '/patrimonio' }

const recordOf = ({ entity, entityId, after }: AuditItem) => {
  const confirmation = entity === 'decision_confirmation'
  const id = confirmation ? after?.decision_id : entityId
  return typeof id === 'string' || typeof id === 'number' ? `${confirmation ? 'decision' : entity}-${id}` : undefined
}

export const targetOf = (item: AuditItem): Target | undefined => {
  const to = pages[item.entity]
  if (!to) return undefined
  const hash = recordOf(item)
  const competence = (item.after ?? item.before)?.competence
  return { to, ...(hash && { hash }), ...(to === '/lancamentos' && typeof competence === 'string' && { month: competence.slice(0, 7) }) }
}
