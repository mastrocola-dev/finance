import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { text } from 'node:stream/consumers'
import { parseArgs } from 'node:util'
import { sample } from './sample.ts'

const { values } = parseArgs({ options: { 'agent-dir': { type: 'string' } } })
const dir = values['agent-dir'] ?? 'agents/import'
const task = JSON.parse(await text(process.stdin))
const mode = task.segment.source as string
if (mode === 'crash') throw new Error('Invalid agent config')

const config = JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8'))
const traces = process.env.TRACE_DIR ?? 'traces'
const end = (error?: string) => {
  mkdirSync(traces, { recursive: true })
  const usage = { input: 1000, output: 300, cacheWrite: 0, cacheRead: 200 }
  appendFileSync(join(traces, 'run.jsonl'), `${JSON.stringify({ type: 'run.end', status: error ? 'error' : 'ok', ...(error && { error }), usage, costUsd: 0.0081 })}\n`)
  console.error(`trace: ${join(traces, 'run.jsonl')}`)
}

if (mode === 'fail') {
  end('Error: model refused 1234567890')
  console.error('Error: model refused 1234567890')
  process.exit(1)
}
if (mode === 'garbage') {
  end()
  console.log('not json')
} else if (mode === 'hang') await new Promise((done) => setTimeout(done, 60_000))
else if (mode === 'echo') {
  const echo = { dir, files: readdirSync(dir).sort(), folder: config.mcpServers.ingest.args.at(-1), database: process.env.DATABASE_URL ?? null, maxRunTokens: config.maxRunTokens, maxTokens: task.maxTokens, offset: task.offset }
  end()
  console.log(JSON.stringify({ candidates: [], questions: [], echo }))
} else {
  end()
  console.log(JSON.stringify(sample))
}
