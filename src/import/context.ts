import type { Queryable } from '../db/connection.ts'
import type { Candidate } from './candidate.ts'
import { maskDigits } from './staging.ts'

export type Names = { income: string[]; expense: string[] }
export type LedgerContext = {
  members: { name: string; initials: string }[]
  categories: Names
  accounts: { nickname: string; institution: string; lastFour: string }[]
  reserves: string[]
  proposed: Names
}

export const emptyContext = (): LedgerContext => ({ members: [], categories: { income: [], expense: [] }, accounts: [], reserves: [], proposed: { income: [], expense: [] } })

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase())
    .join('')

const byKind = (rows: { name: string; kind: string }[]): Names => ({
  income: rows.filter((row) => row.kind === 'income').map((row) => maskDigits(row.name)),
  expense: rows.filter((row) => row.kind === 'expense').map((row) => maskDigits(row.name)),
})

const names = async (client: Queryable, sql: string, values: unknown[] = []) => (await client.query<{ name: string; kind: string }>(sql, values)).rows

export const ledgerContext = async (client: Queryable, batchId?: bigint): Promise<LedgerContext> => {
  const members = await names(client, 'select name from member where closed_at is null order by id')
  const categories = await names(client, 'select name, kind from category where closed_at is null order by kind, name')
  const accounts = await client.query<{ nickname: string; institution: string; last_four: string }>('select nickname, institution, last_four from account where closed_at is null order by nickname')
  const reserves = await names(client, 'select name from reserve where closed_at is null order by name')
  const proposed = batchId === undefined ? [] : await names(client, `select distinct payload->>'name' as name, payload->>'kind' as kind from import_candidate where batch_id = $1 and kind = 'category' and closed_at is null and status <> 'rejected' order by 2, 1`, [batchId])
  return {
    members: members.map(({ name }) => ({ name: maskDigits(name), initials: initialsOf(name) })),
    categories: byKind(categories),
    accounts: accounts.rows.map((row) => ({ nickname: maskDigits(row.nickname), institution: maskDigits(row.institution), lastFour: `•${row.last_four}` })),
    reserves: reserves.map(({ name }) => maskDigits(name)),
    proposed: byKind(proposed),
  }
}

const known = (list: string[], name: string) => list.some((item) => item.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0)

export const propose = (context: LedgerContext, candidates: Candidate[]) => {
  for (const item of candidates) {
    if (item.kind !== 'category') continue
    const { name, kind } = item.payload
    if (!known(context.categories[kind], name) && !known(context.proposed[kind], name)) context.proposed[kind].push(maskDigits(name))
  }
}
