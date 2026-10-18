import type { Queryable } from '../db/connection.ts'

export type Reserve = {
  id: bigint
  name: string
  account: string | null
  balance: bigint
  target: bigint | null
}

const query = `
  select r.id, r.name, a.nickname as account, r.balance_cents as balance, r.target_cents as target
  from reserve r
  left join account a on a.id = r.account_id
  where r.closed_at is null and lower(r.name) = lower($1)`

export const findReserve = async (client: Queryable, name: string): Promise<Reserve | undefined> => (await client.query<Reserve>(query, [name.trim()])).rows[0]
