import type { Queryable } from '../db/connection.ts'

export type Direction = 'income' | 'expense'
export type Category = { id: string; name: string; direction: Direction }
export type Account = { id: string; nickname: string; lastFour: string; member: string | null }

const categories = `
  select id::text, name, kind as direction
  from category
  where closed_at is null and ($1::text is null or kind = $1)
  order by kind, name
`

const accounts = `
  select a.id::text, a.nickname, a.last_four as "lastFour", m.name as member
  from account a
  left join member m on m.id = a.member_id
  where a.closed_at is null
  order by a.member_id nulls first, a.nickname
`

export const listCategories = async (client: Queryable, direction?: Direction) => (await client.query<Category>(categories, [direction ?? null])).rows

export const listAccounts = async (client: Queryable) => (await client.query<Account>(accounts)).rows
