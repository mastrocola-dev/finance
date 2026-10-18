import pg from 'pg'

export const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/finance'

export const connect = async (url = databaseUrl) => {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  return client
}
