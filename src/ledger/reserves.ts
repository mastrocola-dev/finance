import type { Queryable } from '../db/connection.ts'

export type Reserve = {
  id: bigint
  name: string
  account: string | null
  balance: bigint
  target: bigint | null
  missing: bigint | null
  progressPercent: string | null
}

const select = `
  select r.id, r.name, a.nickname as account, r.balance_cents as balance, r.target_cents as target,
    case when r.target_cents is not null then greatest(r.target_cents - r.balance_cents, 0) end as missing,
    round(100.0 * r.balance_cents / r.target_cents, 1)::text as "progressPercent"
  from reserve r
  left join account a on a.id = r.account_id
  where r.closed_at is null`

export const findReserve = async (client: Queryable, name: string): Promise<Reserve | undefined> => (await client.query<Reserve>(`${select} and lower(r.name) = lower($1)`, [name.trim()])).rows[0]

export const listReserves = async (client: Queryable) => (await client.query<Reserve>(`${select} order by r.name, r.id`)).rows
