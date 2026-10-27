import type { Client } from 'pg'
import { findMember } from '../ledger/members.ts'
import { RuleError } from '../ledger/rule.ts'
import { connect } from './connection.ts'
import { write } from './write.ts'

export type NewMember = { name: string; sharePercent: number }

export const addMembers = async (client: Client, members: NewMember[]) => {
  const cleaned = members.map(({ name, sharePercent }) => ({ name: name.trim(), sharePercent }))
  const names = cleaned.map(({ name }) => name)
  if (!names.length || names.some((name) => !name)) throw new RuleError('member name is empty')
  if (new Set(names.map((name) => name.toLowerCase())).size < names.length) throw new RuleError('member names repeat')
  if (cleaned.some(({ sharePercent }) => !Number.isInteger(sharePercent) || sharePercent < 0 || sharePercent > 100)) throw new RuleError('share percent must be a whole number from 0 to 100')
  return write(client, { author: 'system' }, async (ledger) => {
    const created = []
    for (const { name, sharePercent } of cleaned) {
      if (await findMember(client, name)) throw new RuleError(`member ${name} already exists`)
      created.push(await ledger.create('member', { name, share_percent: sharePercent }))
    }
    return created
  })
}

export const membersOf = (args: string[]) => {
  if (!args.length || args.length % 2 || args.some((arg, index) => index % 2 === 1 && !/^\d+$/.test(arg))) return undefined
  return args.flatMap((arg, index) => (index % 2 ? [] : [{ name: arg, sharePercent: Number(args[index + 1]) }]))
}

if (import.meta.main) {
  const members = membersOf(process.argv.slice(2))
  if (!members) {
    console.error('usage: npm run member:add -- <name> <share percent> [<name> <share percent> ...]')
    process.exit(1)
  }
  const client = await connect()
  try {
    console.log(`added ${(await addMembers(client, members)).map(({ name }) => name).join(', ')}`)
  } catch (caught) {
    console.error(caught instanceof RuleError ? caught.message : caught)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}
