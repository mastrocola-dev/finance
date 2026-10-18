import { connect, databaseUrl } from './connection.ts'
import { migrate } from './migrate.ts'

const split = (url: string) => {
  const target = new URL(url)
  const name = decodeURIComponent(target.pathname.slice(1))
  if (!name || name === 'postgres') throw new Error(`refusing to reset database '${name}'`)
  target.pathname = '/postgres'
  return { name, admin: target.href }
}

export const dropDatabase = async (url = databaseUrl) => {
  const { name, admin } = split(url)
  const client = await connect(admin)
  try {
    await client.query(`drop database if exists ${client.escapeIdentifier(name)} with (force)`)
  } finally {
    await client.end()
  }
}

export const reset = async (url = databaseUrl) => {
  await dropDatabase(url)
  const { name, admin } = split(url)
  const server = await connect(admin)
  try {
    await server.query(`create database ${server.escapeIdentifier(name)}`)
  } finally {
    await server.end()
  }
  const client = await connect(url)
  try {
    return await migrate(client)
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  const applied = await reset()
  console.log(`reset with ${applied.join(', ')}`)
}
