import type { Queryable } from '../db/connection.ts'
import { competenceOf } from './summary.ts'

export type Payer = { name: string; sharePercent: number; paid: bigint }
export type Part = Payer & { share: bigint; balance: bigint }
export type Transfer = { from: string; to: string; amount: bigint }
export type Split = { month: string; total: bigint; members: Part[]; transfers: Transfer[] }

const query = `
  select m.name, m.share_percent as "sharePercent", coalesce(sum(e.amount_cents), 0)::bigint as paid
  from member m
  left join account a on a.member_id = m.id
  left join entry e on e.account_id = a.id and e.closed_at is null and e.member_id is null
    and e.direction = 'expense' and e.status = 'paid' and e.competence = $1
  where m.closed_at is null
  group by m.id
  order by m.id`

export const shares = (payers: Payer[]): Part[] => {
  const total = payers.reduce((sum, { paid }) => sum + paid, 0n)
  const floors = payers.map(({ sharePercent }) => (total * BigInt(sharePercent)) / 100n)
  const remainder = total - floors.reduce((sum, share) => sum + share, 0n)
  return payers.map((payer, index) => {
    const share = (floors[index] ?? 0n) + (BigInt(index) < remainder ? 1n : 0n)
    return { ...payer, share, balance: payer.paid - share }
  })
}

export const transfers = (parts: Part[]): Transfer[] => {
  const debtors = parts.filter(({ balance }) => balance < 0n).map(({ name, balance }) => ({ name, left: -balance }))
  const creditors = parts.filter(({ balance }) => balance > 0n).map(({ name, balance }) => ({ name, left: balance }))
  const result: Transfer[] = []
  for (const debtor of debtors) {
    for (const creditor of creditors) {
      const amount = debtor.left < creditor.left ? debtor.left : creditor.left
      if (amount === 0n) continue
      result.push({ from: debtor.name, to: creditor.name, amount })
      debtor.left -= amount
      creditor.left -= amount
    }
  }
  return result
}

export const monthSplit = async (client: Queryable, month: string): Promise<Split> => {
  const competence = competenceOf(month)
  const members = shares((await client.query<Payer>(query, [competence])).rows)
  return { month: competence, total: members.reduce((sum, { paid }) => sum + paid, 0n), members, transfers: transfers(members) }
}
