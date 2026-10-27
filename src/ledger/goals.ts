import type { Client } from 'pg'
import type { Queryable } from '../db/connection.ts'
import type { Actor } from '../db/write.ts'
import { registerRecord } from './setup.ts'

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
  where g.closed_at is null and ($1::bigint is null or g.id = $1)
  order by g.due_on nulls last, g.name, g.id`

export type NewGoal = { name: string; target: bigint; saved?: bigint; dueOn?: string; reserve?: string }

export const listGoals = async (client: Queryable) => (await client.query<Goal>(query, [null])).rows

export const findGoal = async (client: Queryable, id: bigint) => (await client.query<Goal>(query, [id])).rows[0]

export const createGoal = (client: Client, actor: Actor, goal: NewGoal) => registerRecord(client, actor, 'goal', { name: goal.name, targetCents: Number(goal.target), savedCents: Number(goal.saved ?? 0n), dueOn: goal.dueOn, reserve: goal.reserve })
