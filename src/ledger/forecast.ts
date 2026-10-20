import type { Client } from 'pg'
import { type Actor, write } from '../db/write.ts'
import { origins } from './record.ts'
import { competenceOf } from './summary.ts'

export type Forecast = { month: string; created: bigint[]; skipped: number }

type Source = {
  description: string
  direction: 'income' | 'expense'
  amount_cents: bigint
  category_id: bigint
  account_id: bigint | null
  member_id: bigint | null
  income_id: bigint | null
  recurring_expense_id: bigint | null
  installment_number: number | null
  due_on: string
  forecast: boolean
}

const sources = `
  with month as (select $1::date as competence, ($1::date + interval '1 month' - interval '1 day')::date as last_day),
  recurring as (
    select r.description, 'expense' as direction, r.amount_cents, r.category_id, r.account_id, r.member_id,
      null::bigint as income_id, r.id as recurring_expense_id, r.day_of_month, r.installments_total,
      case when r.installments_total is null then null
        else ((extract(year from m.competence) - extract(year from r.starts_on)) * 12 + extract(month from m.competence) - extract(month from r.starts_on))::int + 1 end as installment_number,
      exists (select 1 from entry e where e.recurring_expense_id = r.id and e.competence = m.competence) as present
    from recurring_expense r, month m
    where r.closed_at is null and r.starts_on <= m.last_day and (r.ends_on is null or r.ends_on >= m.competence)
  ),
  incomes as (
    select i.description, 'income', i.amount_cents, i.category_id, i.account_id, i.member_id,
      i.id, null::bigint, i.day_of_month, null::int, null::int,
      exists (select 1 from entry e where e.income_id = i.id and e.competence = m.competence)
    from income i, month m
    where i.closed_at is null and i.category_id is not null and i.starts_on <= m.last_day and (i.ends_on is null or i.ends_on >= m.competence)
  )
  select s.description, s.direction, s.amount_cents, s.category_id, s.account_id, s.member_id, s.income_id, s.recurring_expense_id, s.installment_number,
    (m.competence + least(s.day_of_month, extract(day from m.last_day)::int) - 1)::text as due_on,
    not s.present as forecast
  from (select * from recurring union all select * from incomes) s, month m
  where s.installments_total is null or s.installment_number <= s.installments_total
  order by due_on, s.description`

export const forecastMonth = (client: Client, actor: Actor, month: string) =>
  write(client, actor, async (ledger): Promise<Forecast> => {
    const competence = competenceOf(month)
    await client.query("select pg_advisory_xact_lock(hashtext('forecast'))")
    const { rows } = await client.query<Source>(sources, [competence])
    const created: bigint[] = []
    for (const { forecast, ...source } of rows.filter((row) => row.forecast)) {
      const row = await ledger.create('entry', { ...source, competence, status: 'planned', origin: origins[actor.author] })
      created.push(row.id as bigint)
    }
    return { month: competence, created, skipped: rows.length - created.length }
  })
