import type { Client } from 'pg'
import { type Actor, write } from '../db/write.ts'
import { findMember } from './members.ts'
import { assertDate, competenceOf, localToday } from './summary.ts'

export type NewEntry = {
  month: string
  dueOn: string
  description: string
  direction: 'income' | 'expense'
  amount: bigint
  category: string
  account?: string
  member: string
  paidOn?: string
}

const origins = { member: 'manual', claude: 'claude', import: 'import', system: 'manual' } as const

const single = async (client: Client, sql: string, values: unknown[], missing: string) => {
  const [row] = (await client.query<{ id: bigint }>(sql, values)).rows
  if (!row) throw new Error(missing)
  return row.id
}

const categoryId = (client: Client, name: string, kind: string) => single(client, 'select id from category where closed_at is null and lower(name) = lower($1) and kind = $2', [name.trim(), kind], `unknown ${kind} category ${name}`)

const accountId = (client: Client, nickname: string) => single(client, 'select id from account where closed_at is null and lower(nickname) = lower($1)', [nickname.trim()], `unknown account ${nickname}`)

const memberId = async (client: Client, name: string) => {
  if (name.trim().toLowerCase() === 'joint') return null
  const member = await findMember(client, name)
  if (!member) throw new Error(`unknown member ${name}`)
  return member.id
}

export const createEntry = (client: Client, actor: Actor, entry: NewEntry) =>
  write(client, actor, async (ledger) => {
    if (entry.amount <= 0n) throw new Error('amount must be positive')
    const row = await ledger.create('entry', {
      competence: competenceOf(entry.month),
      due_on: assertDate(entry.dueOn),
      description: entry.description,
      direction: entry.direction,
      amount_cents: entry.amount,
      category_id: await categoryId(client, entry.category, entry.direction),
      account_id: entry.account ? await accountId(client, entry.account) : null,
      member_id: await memberId(client, entry.member),
      status: entry.paidOn ? 'paid' : 'planned',
      paid_on: entry.paidOn ? assertDate(entry.paidOn) : null,
      origin: origins[actor.author],
    })
    return row.id as bigint
  })

export const markPaid = (client: Client, actor: Actor, id: bigint, paidOn = localToday()) =>
  write(client, actor, async (ledger) => {
    const [current] = (await client.query<{ status: string }>('select status from entry where id = $1 and closed_at is null for update', [id])).rows
    if (!current) throw new Error(`entry ${id} not found or closed`)
    if (current.status === 'paid') throw new Error(`entry ${id} is already paid`)
    await ledger.update('entry', id, { status: 'paid', paid_on: assertDate(paidOn) })
    return id
  })

export type ReserveChanges = { balance?: bigint; target?: bigint }

export const updateReserve = (client: Client, actor: Actor, name: string, changes: ReserveChanges) =>
  write(client, actor, async (ledger) => {
    if (changes.balance === undefined && changes.target === undefined) throw new Error('give a new balance or target')
    if (changes.balance !== undefined && changes.balance < 0n) throw new Error('balance cannot be below zero')
    if (changes.target !== undefined && changes.target <= 0n) throw new Error('target must be positive')
    const id = await single(client, 'select id from reserve where closed_at is null and lower(name) = lower($1) for update', [name.trim()], `unknown reserve ${name}`)
    await ledger.update('reserve', id, {
      ...(changes.balance === undefined ? {} : { balance_cents: changes.balance }),
      ...(changes.target === undefined ? {} : { target_cents: changes.target }),
    })
    return id
  })

export type NewDecision = { title: string; description?: string; amount?: bigint }

const actingMember = (actor: Actor) => {
  if (actor.memberId === undefined) throw new Error('decisions need a member')
  return actor.memberId
}

const origin = (actor: Actor) => (actor.author === 'claude' ? 'claude' : 'manual')

export const proposeDecision = (client: Client, actor: Actor, decision: NewDecision) =>
  write(client, actor, async (ledger) => {
    if (decision.amount !== undefined && decision.amount <= 0n) throw new Error('amount must be positive')
    const row = await ledger.create('decision', {
      title: decision.title,
      description: decision.description ?? '',
      amount_cents: decision.amount ?? null,
      proposed_by: actingMember(actor),
      origin: origin(actor),
    })
    return row.id as bigint
  })

const openDecision = async (client: Client, id: bigint) => {
  const [row] = (await client.query<{ proposed_by: bigint }>("select proposed_by from decision where id = $1 and status = 'proposed' for update", [id])).rows
  if (!row) throw new Error(`decision ${id} not found or no longer proposed`)
  return row
}

export const confirmDecision = (client: Client, actor: Actor, id: bigint) =>
  write(client, actor, async (ledger) => {
    const member = actingMember(actor)
    await openDecision(client, id)
    const confirmed = await client.query('select 1 from decision_confirmation where decision_id = $1 and member_id = $2', [id, member])
    if (confirmed.rowCount) throw new Error(`decision ${id} is already confirmed by this member`)
    await ledger.create('decision_confirmation', { decision_id: id, member_id: member })
    const { rows } = await client.query<{ awaiting: number }>('select count(*)::int as awaiting from member m where m.closed_at is null and not exists (select 1 from decision_confirmation c where c.decision_id = $1 and c.member_id = m.id)', [id])
    if (rows[0]?.awaiting === 0) await ledger.close('decision', id, { status: 'confirmed' })
    return id
  })

export const rejectDecision = (client: Client, actor: Actor, id: bigint) =>
  write(client, actor, async (ledger) => {
    const { proposed_by } = await openDecision(client, id)
    if (proposed_by === actingMember(actor)) throw new Error(`decision ${id} was proposed by this member; withdraw it instead`)
    await ledger.close('decision', id, { status: 'rejected' })
    return id
  })

export const withdrawDecision = (client: Client, actor: Actor, id: bigint) =>
  write(client, actor, async (ledger) => {
    const { proposed_by } = await openDecision(client, id)
    if (proposed_by !== actingMember(actor)) throw new Error(`only the proposer can withdraw decision ${id}`)
    await ledger.close('decision', id, { status: 'withdrawn' })
    return id
  })
