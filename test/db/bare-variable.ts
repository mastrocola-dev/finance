import type { Client } from 'pg'
import { write } from '../../src/db/write.ts'

export const bareSeedVariables = (client: Client) =>
  write(client, { author: 'system' }, async (ledger) => {
    const { rows } = await client.query<{ id: bigint }>('select id from variable_expense where closed_at is null')
    for (const plan of rows) await ledger.close('variable_expense', plan.id)
  })
