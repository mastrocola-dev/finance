import type { Client } from 'pg'
import { RuleError } from '../ledger/rule.ts'

export type Actor = { author: 'member' | 'claude'; memberId: bigint } | { author: 'import' | 'system'; memberId?: bigint }

const closable = ['member', 'account', 'category', 'income', 'recurring_expense', 'debt', 'entry', 'reserve', 'goal', 'decision'] as const
const entities: readonly string[] = [...closable, 'decision_confirmation']

export type Closable = (typeof closable)[number]
export type Entity = Closable | 'decision_confirmation'

export type Row = Record<string, unknown>

export type Writer = {
  create: (entity: Entity, values: Row) => Promise<Row>
  update: (entity: Closable, id: bigint, changes: Row) => Promise<Row>
  close: (entity: Closable, id: bigint, changes?: Row) => Promise<Row>
}

const protectedColumns = new Set(['id', 'created_at', 'closed_at'])

const known = (entity: string) => {
  if (!entities.includes(entity)) throw new Error(`unknown entity ${entity}`)
  return entity
}

const columnsOf = (values: Row) => {
  const columns = Object.keys(values)
  const forbidden = columns.filter((column) => protectedColumns.has(column))
  if (forbidden.length) throw new Error(`columns ${forbidden.join(', ')} are not writable`)
  return columns
}

const writer = (client: Client, actor: Actor, touched: Set<Entity>): Writer => {
  const name = (identifier: string) => client.escapeIdentifier(identifier)
  const table = (entity: Entity) => name(known(entity))
  const audit = [actor.author, actor.memberId ?? null]

  const single = (rows: Row[], entity: Entity, id?: bigint) => {
    const [row] = rows
    if (!row) throw new RuleError(`${entity} ${id} not found or closed`)
    touched.add(entity)
    return row
  }

  const change = async (action: 'update' | 'close', entity: Closable, id: bigint, changes: Row) => {
    const columns = columnsOf(changes)
    const assignments = columns.map((column, index) => `${name(column)} = $${index + 5}`)
    if (action === 'close') assignments.push('closed_at = now()')
    if (!assignments.length) throw new Error('nothing to update')
    const { rows } = await client.query(
      `with previous as (select to_jsonb(t) as doc from ${table(entity)} t where id = $3 and closed_at is null for update),
      changed as (update ${table(entity)} set ${assignments.join(', ')} where id = (select (doc->>'id')::bigint from previous) returning *),
      logged as (insert into audit_log (author, member_id, entity, entity_id, action, before, after) select $1, $2, '${entity}', $3, $4, previous.doc, to_jsonb(changed) from previous, changed)
      select * from changed`,
      [...audit, id, action, ...columns.map((column) => changes[column])],
    )
    return single(rows, entity, id)
  }

  return {
    create: async (entity, values) => {
      const columns = columnsOf(values)
      const placeholders = columns.map((_, index) => `$${index + 3}`)
      const { rows } = await client.query(
        `with created as (insert into ${table(entity)} (${columns.map(name).join(', ')}) values (${placeholders.join(', ')}) returning *),
        logged as (insert into audit_log (author, member_id, entity, entity_id, action, after) select $1, $2, '${entity}', (to_jsonb(created)->>'id')::bigint, 'create', to_jsonb(created) from created)
        select * from created`,
        [...audit, ...columns.map((column) => values[column])],
      )
      return single(rows, entity)
    },
    update: (entity, id, changes) => change('update', entity, id, changes),
    close: (entity, id, changes = {}) => change('close', entity, id, changes),
  }
}

const assertShares = async (client: Client) => {
  const { rows } = await client.query<{ members: number; total: number }>('select count(*)::int as members, coalesce(sum(share_percent), 0)::int as total from member where closed_at is null')
  const [{ members, total } = { members: 0, total: 0 }] = rows
  if (members && total !== 100) throw new RuleError(`active members' share_percent must sum to 100, got ${total}`)
}

export const write = async <T>(client: Client, actor: Actor, work: (ledger: Writer) => Promise<T>) => {
  const touched = new Set<Entity>()
  await client.query('begin')
  try {
    const result = await work(writer(client, actor, touched))
    if (touched.has('member')) await assertShares(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}
