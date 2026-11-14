import type { Queryable } from '../db/connection.ts'
import { competenceOf } from './summary.ts'

export type VariableSpend = { id: bigint; description: string; category: string; member: string | null; estimate: bigint; spent: bigint }

export type VariablePlan = { month: string; estimate: bigint; spent: bigint; unspent: bigint; items: VariableSpend[] }

const spending = `
  select v.id, v.description, c.name as category, m.name as member, v.amount_cents as estimate,
    coalesce((
      select sum(e.amount_cents) from entry e
      where e.closed_at is null and e.direction = 'expense' and e.competence = $1 and e.category_id = v.category_id
        and e.member_id is not distinct from v.member_id and e.recurring_expense_id is null and e.debt_id is null
    ), 0)::bigint as spent
  from variable_expense v
  join category c on c.id = v.category_id
  left join member m on m.id = v.member_id
  where v.closed_at is null and v.starts_on <= $1
    and ($2::text is null or (lower($2) = 'joint' and v.member_id is null) or lower(m.name) = lower($2))
  order by c.name, v.description`

const larger = (a: bigint, b: bigint) => (a > b ? a : b)

export const variablePlan = async (client: Queryable, month: string, member?: string): Promise<VariablePlan> => {
  const competence = competenceOf(month)
  const { rows: items } = await client.query<VariableSpend>(spending, [competence, member ?? null])
  const total = (pick: (item: VariableSpend) => bigint) => items.reduce((sum, item) => sum + pick(item), 0n)
  return {
    month: competence,
    estimate: total((item) => item.estimate),
    spent: total((item) => item.spent),
    unspent: total((item) => larger(item.estimate - item.spent, 0n)),
    items,
  }
}
