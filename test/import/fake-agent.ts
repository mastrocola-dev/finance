import { text } from 'node:stream/consumers'
import { sample } from './sample.ts'

const task = JSON.parse(await text(process.stdin))
const spent = { inputTokens: 1200, outputTokens: 300, costUsdMicros: 8100 }
const mode = task.segment.source as string

if (mode === 'fail') {
  console.log(JSON.stringify({ error: 'model refused 1234567890', usage: spent }))
  console.error('budget exceeded')
  process.exit(2)
}
if (mode === 'garbage') console.log('not json')
else if (mode === 'hang') await new Promise((done) => setTimeout(done, 60_000))
else if (mode === 'echo') {
  const echo = { args: process.argv.slice(2), folder: process.env.IMPORT_FOLDER, database: process.env.DATABASE_URL ?? null, maxTokens: task.maxTokens, offset: task.offset }
  console.log(JSON.stringify({ output: { candidates: [], questions: [], echo }, usage: spent }))
} else console.log(JSON.stringify({ output: sample, usage: spent }))
