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

  const streaming = await proposeDecision(client, asMarcio, { title: 'Assinar mais um streaming', description: 'Plano família com as séries que já assistimos.', amount: 3990n })
  await rejectDecision(client, asGabriela, streaming)

  const reserve = await proposeDecision(client, asGabriela, { title: 'Aumentar o aporte mensal na reserva', description: 'Transferir R$ 1.500,00 para a reserva de emergência logo após os salários.', amount: 150000n })
  await confirmDecision(client, asGabriela, reserve)
  await confirmDecision(client, asMarcio, reserve)

  const internet = await proposeDecision(client, asGabriela, { title: 'Trocar a internet de casa para 1 Gb', description: 'Mesma operadora, sem fidelidade. Começa na fatura de novembro.', amount: 4000n })
  await confirmDecision(client, asGabriela, internet)

  await proposeDecision(client, { author: 'claude', memberId: marcio }, { title: 'Antecipar seis parcelas do financiamento do carro', description: 'Usar a parte da reserva de emergência acima da meta para quitar as parcelas 43 a 48 e economizar cerca de R$ 1.150,00 em juros.', amount: 840000n })
  return 4
}
