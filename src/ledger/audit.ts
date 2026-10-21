import type { Queryable } from '../db/connection.ts'

export const authors = ['member', 'claude', 'import', 'system'] as const

export type Author = (typeof authors)[number]
export type AuditFilter = { author?: Author; member?: string; entity?: string; before?: bigint; limit?: number }
export type AuditItem = { id: bigint; at: Date; author: Author; member: string | null; entity: string; entityId: string | null; action: 'create' | 'update' | 'close'; before: unknown; after: unknown }
export type AuditPage = { items: AuditItem[]; counts: Record<Author, number>; memberCounts: { name: string; total: number }[]; next: string | null }

const scope = `
  from audit_log l
  left join member m on m.id = l.member_id
  where ($1::text is null or lower(m.name) = lower($1)) and ($2::text is null or l.entity = $2)`

const page = `
  select l.id, l.at, l.author, m.name as member, l.entity, l.entity_id::text as "entityId", l.action, l.before, l.after
  ${scope} and ($3::text is null or l.author = $3) and ($4::bigint is null or l.id < $4)
  order by l.id desc
  limit $5`

const counts = `select l.author, count(*)::int as total ${scope} group by l.author`

const memberCounts = `select m.name, count(*)::int as total ${scope} and l.author = 'member' group by m.name order by m.name`

export const listAudit = async (client: Queryable, { author, member, entity, before, limit = 50 }: AuditFilter = {}): Promise<AuditPage> => {
  const scoped = [member?.trim() || null, entity?.trim() || null]
  const rows = (await client.query<AuditItem>(page, [...scoped, author ?? null, before ?? null, limit + 1])).rows
  const totals = (await client.query<{ author: Author; total: number }>(counts, scoped)).rows
  const people = (await client.query<{ name: string; total: number }>(memberCounts, scoped)).rows
  const items = rows.slice(0, limit)
  return {
    items,
    counts: Object.fromEntries(authors.map((name) => [name, totals.find((row) => row.author === name)?.total ?? 0])) as Record<Author, number>,
    memberCounts: people,
    next: rows.length > limit ? (items.at(-1)?.id.toString() ?? null) : null,
  }
}
