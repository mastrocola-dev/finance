import type { Client } from 'pg'
import type { Queryable } from '../db/connection.ts'
import { type Actor, write } from '../db/write.ts'
import { type CandidateKind, payloads } from '../import/candidate.ts'
import { resolver, rowOf } from '../import/commit.ts'
import { RuleError } from './rule.ts'

export const setupKinds = ['category', 'account', 'reserve', 'income', 'recurring_expense', 'debt', 'goal'] as const satisfies CandidateKind[]

export type SetupKind = (typeof setupKinds)[number]

export type SetupRecord = { kind: SetupKind; id: string; name: string; detail: string | null; amount: bigint | null; day: number | null; member: string | null; category: string | null; account: string | null }

const uniqueViolation = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'

const nameOf = (kind: SetupKind, payload: Record<string, unknown>) => String(payload[kind === 'debt' ? 'creditor' : kind === 'income' || kind === 'recurring_expense' ? 'description' : kind === 'account' ? 'nickname' : 'name'])

export const registerRecord = (client: Client, actor: Actor, kind: SetupKind, input: unknown) =>
  write(client, actor, async (ledger) => {
    const parsed = payloads[kind].safeParse(input)
    if (!parsed.success) throw new RuleError(`invalid ${kind} payload: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || kind}: ${issue.message}`).join('; ')}`)
    const payload = parsed.data as Record<string, unknown>
    if (kind === 'account') {
      const taken = await client.query('select 1 from account where closed_at is null and lower(nickname) = lower($1)', [nameOf(kind, payload).trim()])
      if (taken.rowCount) throw new RuleError(`account ${nameOf(kind, payload)} already exists`)
    }
    try {
      await client.query('savepoint register')
      const row = await ledger.create(kind, await rowOf(resolver(client), kind, payload))
      return row.id as bigint
    } catch (error) {
      if (!uniqueViolation(error)) throw error
      await client.query('rollback to savepoint register')
      throw new RuleError(`${kind.replace('_', ' ')} ${nameOf(kind, payload)} already exists`)
    }
  })

export const closeRecord = (client: Client, actor: Actor, kind: SetupKind, id: bigint) =>
  write(client, actor, async (ledger) => {
    await ledger.close(kind, id)
    return id
  })

const records = `
  select 'category' as kind, c.id::text, c.name, c.kind as detail, null::bigint as amount, null::int as day, null as member, null as category, null as account, c.id as sort
  from category c where c.closed_at is null
  union all
  select 'account', a.id::text, a.nickname, a.institution || ' · ' || a.kind || ' · ' || a.last_four, null, null, m.name, null, null, a.id
  from account a left join member m on m.id = a.member_id where a.closed_at is null
  union all
  select 'reserve', r.id::text, r.name, null, r.balance_cents, null, null, null, a.nickname, r.id
  from reserve r left join account a on a.id = r.account_id where r.closed_at is null
  union all
  select 'income', i.id::text, i.description, null, i.amount_cents, i.day_of_month, m.name, c.name, a.nickname, i.id
  from income i join member m on m.id = i.member_id left join category c on c.id = i.category_id left join account a on a.id = i.account_id where i.closed_at is null
  union all
  select 'recurring_expense', r.id::text, r.description, case when r.installments_total is null then null else r.installments_total::text end, r.amount_cents, r.day_of_month, m.name, c.name, a.nickname, r.id
  from recurring_expense r join category c on c.id = r.category_id left join member m on m.id = r.member_id left join account a on a.id = r.account_id where r.closed_at is null
  union all
  select 'debt', d.id::text, d.creditor, d.description, d.balance_cents, null, m.name, null, a.nickname, d.id
  from debt d left join member m on m.id = d.member_id left join account a on a.id = d.account_id where d.closed_at is null
  union all
  select 'goal', g.id::text, g.name, r.name, g.target_cents, null, null, null, null, g.id
  from goal g left join reserve r on r.id = g.reserve_id where g.closed_at is null
`

export const listSetup = async (client: Queryable) => {
  const { rows } = await client.query<SetupRecord & { sort: bigint }>(`select * from (${records}) s order by kind, lower(name), sort`)
  return rows.map(({ sort, ...record }) => record)
}
