import * as z from 'zod'
import type { components } from '../api/schema.ts'
import { parseBrl } from '../entries/quick-add.ts'

export type Decision = components['schemas']['Decision']

export type Answer = 'confirm' | 'reject' | 'withdraw'

export type Person = { name: string; confirmed: boolean }

const stamp = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

export const peopleOf = (decision: Decision, members: string[]): Person[] => {
  const people = [...decision.confirmedBy.map((name) => ({ name, confirmed: true })), ...decision.awaiting.map((name) => ({ name, confirmed: false }))]
  const rank = (name: string) => (members.includes(name) ? members.indexOf(name) : members.length)
  return people.toSorted((left, right) => rank(left.name) - rank(right.name))
}

export const answersFor = (decision: Decision, member: string | undefined): Answer[] => {
  if (!member || decision.status !== 'proposed') return []
  return [...(decision.awaiting.includes(member) ? (['confirm'] as const) : []), decision.proposedBy === member ? 'withdraw' : 'reject']
}

export const proposalMeta = (decision: Decision) => `Proposta por ${decision.proposedBy}${decision.origin === 'claude' ? ' via Claude' : ''} · ${stamp.format(new Date(decision.createdAt))}`

export const closedDay = (decision: Decision) => day.format(new Date(decision.closedAt ?? decision.createdAt))

export const statusLabels: Record<Decision['status'], string> = { proposed: 'Proposta', confirmed: 'Confirmada', rejected: 'Rejeitada', withdrawn: 'Retirada' }

export const proposal = z.object({
  title: z.string().trim().min(1, 'Informe o que vocês vão decidir.'),
  amount: z.string().refine((text) => text.trim() === '' || (parseBrl(text) ?? 0n) > 0n, 'Informe um valor maior que zero, como 40,00, ou deixe em branco.'),
  description: z.string(),
})

export type Proposal = z.input<typeof proposal>

export const toNewDecision = (values: Proposal) => {
  const amount = parseBrl(values.amount)
  return { title: values.title.trim(), description: values.description.trim() || undefined, amount_cents: amount === undefined ? undefined : Number(amount) }
}
