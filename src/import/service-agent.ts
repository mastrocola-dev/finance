import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as z from 'zod'
import { RuleError } from '../ledger/rule.ts'
import { type Extraction, ExtractionError, type Extractor, type Task, type Usage } from './agent.ts'
import { maskDigits } from './staging.ts'

export type ServiceAgent = { folder: string; cli?: string; agentDir?: string; timeoutMs?: number }

type Exit = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; failure?: string }

const root = fileURLToPath(new URL('../../', import.meta.url))
const replyLimit = 4_000_000
const nothing: Usage = { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 }
const passed = ['PATH', 'HOME', 'LANG', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'UV_SYSTEM_CERTS', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY']
const copied = ['system.md', 'output.schema.json']

const tokens = z.int().min(0)
const traced = z.object({ input: tokens, output: tokens, cacheWrite: tokens, cacheRead: tokens })
const runEnd = z.object({ type: z.literal('run.end'), error: z.string().optional(), usage: traced, costUsd: z.number().min(0).nullable() })

export const usdPerMTok: Record<string, z.infer<typeof traced>> = {
  'claude-sonnet-4-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
}

export const defaultCli = () => resolve(process.env.SERVICE_AGENT_CLI ?? '../service-agent/src/cli.ts')

export const childEnvironment = (agentDir: string) => ({
  ...Object.fromEntries(passed.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))),
  TRACE_DIR: join(agentDir, 'traces'),
})

export const renderAgent = async (template: string, folder: string, maxRunTokens = Number.MAX_SAFE_INTEGER) => {
  const dir = await mkdtemp(join(tmpdir(), 'finance-agent-'))
  const raw = await readFile(join(template, 'agent.json'), 'utf8')
  const config = JSON.parse(raw.replaceAll('{IMPORT_FOLDER}', JSON.stringify(resolve(folder)).slice(1, -1)))
  await writeFile(join(dir, 'agent.json'), JSON.stringify({ ...config, maxRunTokens: Math.min(config.maxRunTokens, maxRunTokens) }))
  await Promise.all(copied.map(async (name) => writeFile(join(dir, name), await readFile(join(template, name)))))
  return { dir, model: String(config.model) }
}

export const usageOf = (model: string, { usage, costUsd }: z.infer<typeof runEnd>): Usage => {
  const rate = usdPerMTok[model]
  const priced = rate ? usage.input * rate.input + usage.output * rate.output + usage.cacheWrite * rate.cacheWrite + usage.cacheRead * rate.cacheRead : 0
  return { inputTokens: usage.input + usage.cacheWrite + usage.cacheRead, outputTokens: usage.output, costUsdMicros: Math.round(costUsd === null ? priced : costUsd * 1_000_000) }
}

const traceEnd = async (agentDir: string) => {
  const folder = join(agentDir, 'traces')
  const files = await readdir(folder).catch(() => [])
  const lines = (await Promise.all(files.filter((name) => name.endsWith('.jsonl')).map((name) => readFile(join(folder, name), 'utf8')))).flatMap((text) => text.split('\n'))
  return lines
    .flatMap((line) => {
      try {
        const parsed = runEnd.safeParse(JSON.parse(line))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
    .at(-1)
}

const parseOutput = (stdout: string) => {
  try {
    return { value: JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as unknown }
  } catch {
    return undefined
  }
}

const brief = (text: string) => maskDigits(text).slice(0, 300)

const headline = (stderr: string) => {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('trace: '))
  return lines.find((line) => /^([A-Z]\w*)?Error\b/.test(line)) ?? lines.find((line) => /error/i.test(line)) ?? lines[0]
}

const execute = (cli: string, agentDir: string, task: Task, timeoutMs: number) =>
  new Promise<Exit>((done) => {
    const child = spawn(process.execPath, [cli, '--agent-dir', agentDir], { cwd: root, env: childEnvironment(agentDir), stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (data: string) => {
      stdout += data
      if (stdout.length > replyLimit) child.kill()
    })
    child.stderr.setEncoding('utf8').on('data', (data: string) => {
      stderr = (stderr + data).slice(-4000)
    })
    child.on('error', (error) => done({ code: null, signal: null, stdout, stderr, failure: error.message }))
    child.on('close', (code, signal) => done({ code, signal, stdout, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(task))
  })

const reasonOf = (exit: Exit, error: string | undefined, output: unknown) => {
  if (exit.failure) return exit.failure
  if (exit.signal) return `service-agent stopped by ${exit.signal}`
  if (error) return error.replace(/^Error: /, '')
  if (exit.code === 0) return output === undefined ? 'service-agent reply is not JSON' : 'service-agent wrote no trace'
  return [`service-agent exited with ${exit.code}`, headline(exit.stderr)].filter(Boolean).join(': ')
}

export const run = async ({ folder, cli = defaultCli(), agentDir = 'agents/import', timeoutMs = 300_000 }: ServiceAgent, task: Task): Promise<Extraction> => {
  const { dir, model } = await renderAgent(resolve(root, agentDir), folder, task.maxTokens)
  try {
    const exit = await execute(resolve(cli), dir, task, timeoutMs)
    const end = await traceEnd(dir)
    const spent = end ? usageOf(model, end) : nothing
    const output = parseOutput(exit.stdout)
    if (exit.code === 0 && end && !end.error && output) return { output: output.value, usage: spent }
    throw new ExtractionError(brief(reasonOf(exit, end?.error, output)), spent)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export const serviceAgentExtractor = (agent: ServiceAgent): Extractor => {
  const cli = agent.cli ?? defaultCli()
  if (!existsSync(cli)) throw new RuleError(`service-agent CLI not found at ${cli}, set SERVICE_AGENT_CLI`)
  return { extract: (task) => run({ ...agent, cli }, task) }
}
