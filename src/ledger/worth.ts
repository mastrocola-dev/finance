import type { Queryable } from '../db/connection.ts'

export type NetWorth = { reserves: bigint; goals: bigint; debts: bigint; netWorth: bigint }

const query = `
  select
    (select coalesce(sum(balance_cents), 0)::bigint from reserve where closed_at is null) as reserves,
    (select coalesce(sum(saved_cents), 0)::bigint from goal where closed_at is null and reserve_id is null) as goals,
    (select coalesce(sum(balance_cents), 0)::bigint from debt where closed_at is null) as debts`

export const netWorth = async (client: Queryable): Promise<NetWorth> => {
  const [totals] = (await client.query<Omit<NetWorth, 'netWorth'>>(query)).rows
  if (!totals) throw new Error('net worth query returned no row')
  return { ...totals, netWorth: totals.reserves + totals.goals - totals.debts }
}
