import type { Client } from 'pg'
import { type Actor, write } from '../db/write.ts'
import { entryValues, type NewEntry, origins } from '../ledger/record.ts'
import { RuleError } from '../ledger/rule.ts'
import { competenceOf } from '../ledger/summary.ts'

export type MonthImport = { month: string; created: bigint[] }

export const importMonth = (client: Client, actor: Actor, month: string, entries: NewEntry[]) =>
  write(client, actor, async (ledger): Promise<MonthImport> => {
    const competence = competenceOf(month)
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`import:${competence}`])
    if ((await client.query("select 1 from entry where competence = $1 and origin = 'import' and closed_at is null limit 1", [competence])).rowCount) {
      throw new RuleError(`${month} was already imported`)
    }
    const created: bigint[] = []
    for (const entry of entries) {
      if (competenceOf(entry.month) !== competence) throw new RuleError(`entry ${entry.description} is outside ${month}`)
      const row = await ledger.create('entry', { ...(await entryValues(client, entry)), origin: origins[actor.author] })
      created.push(row.id as bigint)
    }
    return { month: competence, created }
  })
