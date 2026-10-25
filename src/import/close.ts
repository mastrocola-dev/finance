import type { Client } from 'pg'
import { type Actor, write } from '../db/write.ts'
import { RuleError } from '../ledger/rule.ts'

export const closeBatch = (client: Client, actor: Actor, batchId: bigint) =>
  write(client, actor, async (ledger) => {
    const status = (await client.query<{ status: string }>('select status from import_batch where id = $1 and closed_at is null for update', [batchId])).rows[0]?.status
    if (!status) throw new RuleError(`import batch ${batchId} is already closed`)
    const questions = await client.query<{ id: bigint }>('select id from import_question where batch_id = $1 and closed_at is null order by id', [batchId])
    for (const { id } of questions.rows) await ledger.close('import_question', id)
    const candidates = await client.query<{ id: bigint }>('select id from import_candidate where batch_id = $1 and closed_at is null order by id', [batchId])
    for (const { id } of candidates.rows) await ledger.close('import_candidate', id)
    await ledger.close('import_batch', batchId, { status: 'closed' })
    return { batchId, outcome: status === 'committed' ? ('closed' as const) : ('abandoned' as const) }
  })
