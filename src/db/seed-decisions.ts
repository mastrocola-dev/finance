import type { Client } from 'pg'
import { confirmDecision, proposeDecision, rejectDecision } from '../ledger/record.ts'
import type { Actor } from './write.ts'

const memberIds = async (client: Client) => {
  const { rows } = await client.query<{ name: string; id: bigint }>('select name, id from member where closed_at is null')
  const ids = new Map(rows.map((row) => [row.name, row.id]))
  const of = (name: string) => {
    const id = ids.get(name)
    if (id === undefined) throw new Error(`seed member ${name} is missing`)
    return id
  }
  return { marcio: of('Marcio'), gabriela: of('Gabriela') }
}

export const seedDecisions = async (client: Client) => {
  const { rows } = await client.query<{ total: number }>('select count(*)::int as total from decision')
  if (rows[0]?.total) return 0
  const { marcio, gabriela } = await memberIds(client)
  const asMarcio: Actor = { author: 'member', memberId: marcio }
  const asGabriela: Actor = { author: 'member', memberId: gabriela }

  const streaming = await proposeDecision(client, asMarcio, { title: 'Add another streaming subscription', description: 'Family plan shared with the series we already watch.', amount: 3990n })
  await rejectDecision(client, asGabriela, streaming)

  const reserve = await proposeDecision(client, asGabriela, { title: 'Raise the monthly reserve contribution', description: 'Move R$ 1.500,00 to the emergency fund right after salaries arrive.', amount: 150000n })
  await confirmDecision(client, asGabriela, reserve)
  await confirmDecision(client, asMarcio, reserve)

  const internet = await proposeDecision(client, asGabriela, { title: 'Upgrade home internet to 1 Gb', description: 'Same provider, no lock-in. Starts on the November bill.', amount: 4000n })
  await confirmDecision(client, asGabriela, internet)

  await proposeDecision(client, { author: 'claude', memberId: marcio }, { title: 'Prepay six car loan installments', description: 'Use part of the emergency fund above target to pay installments 43 to 48 and save about R$ 1.150,00 in interest.', amount: 840000n })
  return 4
}
