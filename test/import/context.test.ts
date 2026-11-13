import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Client } from 'pg'
import type { Actor } from '../../src/db/write.ts'
import { type Extractor, runImport, type Segment, type Task } from '../../src/import/agent.ts'
import { emptyContext, initialsOf, ledgerContext, propose } from '../../src/import/context.ts'
import { openBatch } from '../../src/import/staging.ts'
import { testDatabase } from '../db/database.ts'
import { freshHash } from './sample.ts'

const actor: Actor = { author: 'import' }
const usage = { inputTokens: 10, outputTokens: 5, costUsdMicros: 15 }
const text = (source: string): Segment => ({ id: source, kind: 'text', source, shape: { lines: 3 } })
const category = (name: string, kind: 'income' | 'expense' = 'expense') => ({ kind: 'category', source: 'L1', confidence: 0.9, payload: { name, kind } }) as const

describe('ledger context for the import agent', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>
  let client: Client

  before(async () => {
    db = await testDatabase()
    client = db.client
    await client.query("insert into member (name, share_percent) values ('Marcio Mastrocola', 50), ('Gabriela Alves', 50), ('Ana', 0)")
    await client.query("update member set closed_at = now(), share_percent = 0 where name = 'Ana'")
    await client.query("insert into category (name, kind) values ('Mercado', 'expense'), ('Saúde', 'expense'), ('Salário', 'income'), ('Antiga', 'expense')")
    await client.query("update category set closed_at = now() where name = 'Antiga'")
    await client.query("insert into account (institution, nickname, last_four, kind) values ('Banco Azul', 'Conjunta', '1234', 'checking')")
    await client.query("insert into reserve (name, balance_cents) values ('Emergência', 500000)")
  })

  after(() => db.drop())

  test('lists open names only, with initials, and masks the account digits', async () => {
    assert.equal(initialsOf('Gabriela  Mastrocola Alves'), 'GMA')
    assert.deepEqual(await ledgerContext(client), {
      members: [
        { name: 'Marcio Mastrocola', initials: 'MM' },
        { name: 'Gabriela Alves', initials: 'GA' },
      ],
      categories: { income: ['Salário'], expense: ['Mercado', 'Saúde'] },
      accounts: [{ nickname: 'Conjunta', institution: 'Banco Azul', lastFour: '•1234' }],
      reserves: ['Emergência'],
      proposed: { income: [], expense: [] },
    })
    assert.doesNotMatch(JSON.stringify(await ledgerContext(client)), /500000|"1234"/)
  })

  test('proposes each new category once, ignoring case and accents of known names', () => {
    const context = { ...emptyContext(), categories: { income: [], expense: ['Saúde'] } }
    propose(context, [category('Pets'), category('saude'), category('PETS'), category('Bônus', 'income'), category('Pets', 'income')])
    assert.deepEqual(context.proposed, { income: ['Bônus', 'Pets'], expense: ['Pets'] })
  })

  test('sends the ledger to every chunk and the categories proposed by earlier chunks to later ones', async () => {
    const tasks: Task[] = []
    const answers: Record<string, unknown[]> = { L1: [category('Pets')], L2: [], L3: [category('Pets'), category('Viagem')] }
    const extractor: Extractor = {
      extract: async (task) => {
        tasks.push(task)
        return { output: { candidates: answers[task.segment.source], questions: [] }, usage }
      },
    }
    const batch = await openBatch(client, actor, { name: 'notas.txt', format: 'txt', hash: freshHash() })
    await runImport(client, actor, batch, { file: 'notas.txt', segments: [text('L1'), text('L2'), text('L3')], extractor, tokenCap: 10_000 })
    assert.deepEqual(
      tasks.map((task) => task.ledger.proposed.expense),
      [[], ['Pets'], ['Pets']],
    )
    assert.ok(tasks.every((task) => task.ledger.categories.expense.includes('Mercado') && task.ledger.members.length === 2))
    const again = await openBatch(client, actor, { name: 'notas-2.txt', format: 'txt', hash: freshHash() })
    assert.deepEqual((await ledgerContext(client, again)).proposed.expense, [])
    assert.deepEqual((await ledgerContext(client, batch)).proposed.expense, ['Pets', 'Viagem'])
  })
})
