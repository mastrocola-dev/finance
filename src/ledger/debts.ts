import type { Queryable } from '../db/connection.ts'

export type Debt = {
  id: bigint
  creditor: string
  description: string
  member: string | null
  account: string | null
  principal: bigint
  balance: bigint
  monthlyRatePercent: string | null
  installment: bigint | null
  installmentsTotal: number | null
  installmentsPaid: number
  installmentsRemaining: number | null
  startsOn: string
}

const query = `
  select d.id, d.creditor, d.description, m.name as member, a.nickname as account,
    d.principal_cents as principal, d.balance_cents as balance, d.monthly_rate_percent::text as "monthlyRatePercent",
    d.installment_cents as installment, d.installments_total as "installmentsTotal", d.installments_paid as "installmentsPaid",
    d.installments_total - d.installments_paid as "installmentsRemaining", d.starts_on::text as "startsOn"
  from debt d
  left join member m on m.id = d.member_id
  left join account a on a.id = d.account_id
  where d.closed_at is null
  order by d.balance_cents desc, d.id`

export const listDebts = async (client: Queryable) => (await client.query<Debt>(query)).rows
