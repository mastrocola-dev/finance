import type { Queryable } from '../db/connection.ts'

export type Goal = {
  id: bigint
  name: string
  reserve: string | null
  target: bigint
  saved: bigint
  missing: bigint
  progressPercent: string
  dueOn: string | null
}

const query = `
  select g.id, g.name, r.name as reserve, g.target_cents as target, g.saved_cents as saved,
    greatest(g.target_cents - g.saved_cents, 0) as missing,
    round(100.0 * g.saved_cents / g.target_cents, 1)::text as "progressPercent", g.due_on::text as "dueOn"
  from goal g
  left join reserve r on r.id = g.reserve_id
  where g.closed_at is null
  order by g.due_on nulls last, g.name, g.id`

export const listGoals = async (client: Queryable) => (await client.query<Goal>(query)).rows
