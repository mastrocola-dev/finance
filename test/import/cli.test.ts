import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { describeFile, importFile, importSummary } from '../../src/import/cli.ts'
import { ingestSegments } from '../../src/import/ingest.ts'
import { serviceAgentExtractor } from '../../src/import/service-agent.ts'
import { testDatabase } from '../db/database.ts'
import { sample } from './sample.ts'

const fixtures = 'ingest/tests/fixtures'
const cli = 'test/import/fake-agent.ts'
const hasUv = (() => {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

let db: Awaited<ReturnType<typeof testDatabase>>
let folder: string

before(async () => {
  db = await testDatabase()
  folder = await mkdtemp(join(tmpdir(), 'finance-import-'))
})

after(async () => {
  await rm(folder, { recursive: true, force: true })
  await db.drop()
})

describe('import command', () => {
  test('describes a file by name, format and sha-256, refusing unknown formats', async () => {
    const path = join(folder, 'Extrato.CSV')
    await copyFile(join(fixtures, 'extrato.csv'), path)
    const hash = createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
    assert.deepEqual(await describeFile(path), { name: 'Extrato.CSV', format: 'csv', hash })
    await writeFile(join(folder, 'setup.exe'), 'x')
    await assert.rejects(describeFile(join(folder, 'setup.exe')), /unsupported format exe/)
    await assert.rejects(describeFile(folder), /is not a file/)
  })

  test('opens a batch, extracts every segment and stages the output with its usage', async () => {
    const path = join(folder, 'notas.txt')
    await writeFile(path, 'aluguel 1500\n')
    const segments = async () => [{ id: 'text-1', kind: 'text' as const, source: 'L1-L1', shape: { lines: 1 } }]
    const progress: number[][] = []
    const result = await importFile(db.client, path, { segments, extractor: (at) => serviceAgentExtractor({ folder: at, cli }), onProgress: (done, total) => progress.push([done, total]) })
    assert.equal(result.candidates.length, sample.candidates.length)
    assert.deepEqual(progress, [[1, 1]])
    const { rows } = await db.client.query('select file_name, format, status, input_tokens, output_tokens, cost_usd_micros from import_batch where id = $1', [result.batchId])
    assert.deepEqual(rows[0], { file_name: 'notas.txt', format: 'txt', status: 'verified', input_tokens: 1200n, output_tokens: 300n, cost_usd_micros: 8100n })
    assert.deepEqual(importSummary(result).split('\n').slice(0, 2), [`batch ${result.batchId}: 9 candidates, 1 questions from 1 of 1 chunks`, 'verified: 5 with failed checks, 2 low confidence, 6 new questions, 0 of 0 totals mismatched'])
  })

  test('opens no batch when the agent CLI is missing', async () => {
    const path = join(folder, 'vazio.txt')
    await writeFile(path, 'nada\n')
    const count = async () => (await db.client.query<{ total: number }>('select count(*)::int as total from import_batch')).rows[0]?.total
    const initial = await count()
    await assert.rejects(importFile(db.client, path, { segments: async () => [], extractor: (at) => serviceAgentExtractor({ folder: at, cli: join(folder, 'cli.ts') }) }), /service-agent CLI not found/)
    assert.equal(await count(), initial)
  })

  test('lists segments through the ingest stdio server', { skip: !hasUv && 'uv is not installed' }, async () => {
    const segments = await ingestSegments(fixtures, 'extrato.csv')
    assert.deepEqual(
      segments.map(({ id, kind, source }) => [id, kind, source]),
      [
        ['table-1', 'table', 'extrato!A1:D4'],
        ['table-2', 'table', 'extrato!A6:D6'],
      ],
    )
    await assert.rejects(ingestSegments(fixtures, '../../package.json'), /no such file in the import folder/)
  })

  test('imports a real file through ingest and the agent CLI', { skip: !hasUv && 'uv is not installed' }, async () => {
    const path = join(folder, 'extrato.csv')
    await copyFile(join(fixtures, 'extrato.csv'), path)
    const result = await importFile(db.client, path, { extractor: (at) => serviceAgentExtractor({ folder: at, cli }) })
    assert.deepEqual([result.done, result.total, result.failures], [2, 2, []])
    assert.equal(result.candidates.length, 2 * sample.candidates.length)
  })
})
