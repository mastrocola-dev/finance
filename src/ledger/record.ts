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
