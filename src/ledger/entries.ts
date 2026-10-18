import type { ClientBase } from 'pg'
import { assertDate, competenceOf, localToday } from './summary.ts'

export const states = ['paid', 'pending', 'late'] as const
export type State = (typeof states)[number]

export type EntryFilters = {
  month: string
  direction?: 'income' | 'expense'
  category?: string
  account?: string
  member?: string
  state?: State
}

export type Entry = {
  id: bigint
  competence: string
  dueOn: string
  description: string
  direction: 'income' | 'expense'
  amount: bigint
  category: string
  account: string | null
  member: string | null
  status: 'planned' | 'paid' | 'late'
  state: State
  paidOn: string | null
  installmentNumber: number | null
}

const query = `
  select * from (
    select e.id, e.competence::text as competence, e.due_on::text as "dueOn", e.description, e.direction, e.amount_cents as amount,
      c.name as category, a.nickname as account, m.name as member, e.status,
      case when e.status = 'paid' then 'paid' when e.status = 'late' or e.due_on < $2 then 'late' else 'pending' end as state,
      e.paid_on::text as "paidOn", e.installment_number as "installmentNumber"
    from entry e
    join category c on c.id = e.category_id
    left join account a on a.id = e.account_id
    left join member m on m.id = e.member_id
    where e.closed_at is null and e.competence = $1
      and ($3::text is null or e.direction = $3)
      and ($4::text is null or lower(c.name) = lower($4))
      and ($5::text is null or lower(a.nickname) = lower($5))
      and ($6::text is null or (lower($6) = 'joint' and e.member_id is null) or lower(m.name) = lower($6))
  ) listed
  where $7::text is null or state = $7
  order by "dueOn", id`

export const listEntries = async (client: ClientBase, filters: EntryFilters, today = localToday()) => {
  const { month, direction, category, account, member, state } = filters
  const { rows } = await client.query<Entry>(query, [competenceOf(month), assertDate(today), direction ?? null, category ?? null, account ?? null, member ?? null, state ?? null])
  return rows
}
