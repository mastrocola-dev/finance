import type { Queryable } from '../db/connection.ts'
import { competenceOf, shiftMonth } from './summary.ts'

export type Release = { month: string; amount: bigint }

export type CardInstallment = {
  id: bigint
  description: string
  member: string | null
  category: string | null
  installment: bigint
  installmentsTotal: number
  current: number | null
  remaining: number
  firstBill: string
  lastBill: string
  committed: bigint
}

export type Card = {
  id: bigint
  nickname: string
  institution: string
  lastFour: string
  member: string | null
  limit: bigint | null
  committed: bigint
  available: bigint | null
  installments: CardInstallment[]
  releases: Release[]
}

type CardRow = Omit<Card, 'committed' | 'available' | 'installments' | 'releases'>
type InstallmentRow = Omit<CardInstallment, 'current' | 'remaining' | 'lastBill' | 'committed'> & { accountId: bigint; elapsed: number }

const cards = `
  select a.id, a.nickname, a.institution, a.last_four as "lastFour", m.name as member, a.credit_limit_cents as "limit"
  from account a left join member m on m.id = a.member_id
  where a.closed_at is null and a.kind = 'credit_card'
  order by a.member_id nulls first, a.nickname`

const installments = `
  select * from (
    select i.id, i.account_id as "accountId", i.description, m.name as member, c.name as category,
      i.installment_cents as installment, i.installments_total::int as "installmentsTotal", i.first_bill::text as "firstBill",
      ((extract(year from $1::date) - extract(year from i.first_bill)) * 12 + extract(month from $1::date) - extract(month from i.first_bill))::int as elapsed
    from card_installment i
    left join member m on m.id = i.member_id
    left join category c on c.id = i.category_id
    where i.closed_at is null
  ) open where elapsed < "installmentsTotal"
  order by "firstBill", id`

const installmentOf = ({ accountId: _, elapsed, ...row }: InstallmentRow): CardInstallment => {
  const remaining = row.installmentsTotal - Math.max(elapsed, 0)
  return {
    ...row,
    current: elapsed < 0 ? null : elapsed + 1,
    remaining,
    lastBill: shiftMonth(row.firstBill, row.installmentsTotal - 1),
    committed: row.installment * BigInt(remaining),
  }
}

const releasesOf = (rows: InstallmentRow[]) => {
  const byMonth = new Map<string, bigint>()
  for (const row of rows)
    for (let index = Math.max(row.elapsed, 0); index < row.installmentsTotal; index++) {
      const month = shiftMonth(row.firstBill, index)
      byMonth.set(month, (byMonth.get(month) ?? 0n) + row.installment)
    }
  return [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }))
}

export const cardLimits = async (client: Queryable, month: string): Promise<Card[]> => {
  const competence = competenceOf(month)
  const open = (await client.query<CardRow>(cards)).rows
  const rows = (await client.query<InstallmentRow>(installments, [competence])).rows
  return open.map((card) => {
    const own = rows.filter((row) => row.accountId === card.id)
    const releases = releasesOf(own)
    const committed = releases.reduce((sum, release) => sum + release.amount, 0n)
    return { ...card, committed, available: card.limit === null ? null : card.limit - committed, installments: own.map(installmentOf), releases }
  })
}
