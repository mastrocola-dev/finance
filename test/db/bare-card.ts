import type { Client } from 'pg'
import { write } from '../../src/db/write.ts'

export const bareSeedCard = (client: Client) =>
  write(client, { author: 'system' }, async (ledger) => {
    const card = await client.query<{ id: bigint }>("select id from account where nickname = 'Cartão Marcio' and closed_at is null")
    const [{ id } = { id: 0n }] = card.rows
    const { rows } = await client.query<{ id: bigint }>('select id from card_installment where closed_at is null and account_id = $1', [id])
    for (const installment of rows) await ledger.close('card_installment', installment.id)
    await ledger.update('account', id, { credit_limit_cents: null })
  })
