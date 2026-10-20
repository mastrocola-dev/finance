import type { Queryable } from '../db/connection.ts'

export const statuses = ['proposed', 'confirmed', 'rejected', 'withdrawn'] as const

export type Status = (typeof statuses)[number]

export type Decision = {
  id: bigint
  title: string
  description: string
  amount: bigint | null
  status: Status
  proposedBy: string
  origin: 'manual' | 'claude'
  confirmedBy: string[]
  awaiting: string[]
  createdAt: Date
  closedAt: Date | null
}

const select = `
  select d.id, d.title, d.description, d.amount_cents as amount, d.status, p.name as "proposedBy", d.origin,
    array(select m.name from decision_confirmation c join member m on m.id = c.member_id where c.decision_id = d.id order by c.confirmed_at, m.id) as "confirmedBy",
    case when d.status = 'proposed' then array(
      select m.name from member m
      where m.closed_at is null and not exists (select 1 from decision_confirmation c where c.decision_id = d.id and c.member_id = m.id)
      order by m.id
    ) else '{}' end as awaiting,
    d.created_at as "createdAt", d.closed_at as "closedAt"
  from decision d
  join member p on p.id = d.proposed_by`

export const findDecision = async (client: Queryable, id: bigint): Promise<Decision | undefined> => (await client.query<Decision>(`${select} where d.id = $1`, [id])).rows[0]

export const listDecisions = async (client: Queryable, status: Status | 'all' = 'proposed', limit = 20) => (await client.query<Decision>(`${select} where $1 = 'all' or d.status = $1 order by d.created_at desc, d.id desc limit $2`, [status, limit])).rows
