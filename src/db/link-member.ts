import type { Client } from 'pg'
import { findMember } from '../ledger/members.ts'
import { RuleError } from '../ledger/rule.ts'
import { connect } from './connection.ts'
import { write } from './write.ts'

export const linkMember = async (client: Client, name: string, externalId: string) => {
  const id = externalId.trim()
  if (!id) throw new RuleError('external id is empty')
  const member = await findMember(client, name)
  if (!member) throw new RuleError(`member ${name} not found or closed`)
  const { rows } = await client.query('select name from member where external_id = $1 and id <> $2', [id, member.id])
  if (rows.length) throw new RuleError(`external id is already linked to ${rows[0].name}`)
  await write(client, { author: 'system' }, (ledger) => ledger.update('member', member.id, { external_id: id }))
  return member
}

if (import.meta.main) {
  const [name, externalId] = process.argv.slice(2)
  if (!name || !externalId) {
    console.error('usage: npm run member:link -- <member name> <object id>')
    process.exit(1)
  }
  const client = await connect()
  try {
    console.log(`linked ${(await linkMember(client, name, externalId)).name}`)
  } finally {
    await client.end()
  }
}
