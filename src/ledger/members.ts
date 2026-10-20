import type { Queryable } from '../db/connection.ts'

export type Member = { id: bigint; name: string; sharePercent: number }

const query = `
  select id, name, share_percent as "sharePercent"
  from member
  where closed_at is null and lower(name) = lower($1)
`

export const findMember = async (client: Queryable, name: string): Promise<Member | undefined> => (await client.query<Member>(query, [name.trim()])).rows[0]

export const listMembers = async (client: Queryable) => (await client.query<Member>('select id, name, share_percent as "sharePercent" from member where closed_at is null order by id')).rows
