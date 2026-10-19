import pg from 'pg'

pg.types.setTypeParser(pg.types.builtins.INT8, BigInt)
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

export type Queryable = Pick<pg.ClientBase, 'query'>

export type Database = Queryable & Pick<pg.Pool, 'connect'>

export const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/finance'

export const connect = async (url = databaseUrl) => {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  return client
}

export const connectPool = (url = databaseUrl, readOnly = false) =>
  new pg.Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ...(readOnly ? { options: '-c default_transaction_read_only=on' } : {}),
  })
