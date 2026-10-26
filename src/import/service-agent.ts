import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as z from 'zod'
import { RuleError } from '../ledger/rule.ts'
import { type Extraction, ExtractionError, type Extractor, type Task, type Usage, usage } from './agent.ts'
import { maskDigits } from './staging.ts'

export type ServiceAgent = { folder: string; cli?: string; agentDir?: string; timeoutMs?: number }

const reply = z.object({ output: z.unknown().optional(), usage: usage.optional(), error: z.string().optional() })
const replyLimit = 4_000_000
const nothing: Usage = { inputTokens: 0, outputTokens: 0, costUsdMicros: 0 }
const passed = ['PATH', 'HOME', 'LANG', 'ANTHROPIC_API_KEY', 'UV_SYSTEM_CERTS', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY']

export const defaultCli = () => resolve(process.env.SERVICE_AGENT_CLI ?? '../service-agent/src/cli.ts')

export const childEnvironment = (folder: string) => ({
  ...Object.fromEntries(passed.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))),
  IMPORT_FOLDER: resolve(folder),
})

const parseReply = (stdout: string) => {
  try {
    return reply.safeParse(JSON.parse(stdout.trim().split('\n').at(-1) ?? ''))
  } catch {
    return undefined
  }
}

const brief = (text: string) => maskDigits(text).slice(0, 300)

const headline = (stderr: string) => {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.find((line) => /error/i.test(line)) ?? lines[0]
}

export const run = ({ folder, cli = defaultCli(), agentDir = 'agents/import', timeoutMs = 300_000 }: ServiceAgent, task: Task) =>
  new Promise<Extraction>((done, fail) => {
    const child = spawn(process.execPath, [cli, '--agent-dir', agentDir], { env: childEnvironment(folder), stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (data: string) => {
      stdout += data
      if (stdout.length > replyLimit) child.kill()
    })
    child.stderr.setEncoding('utf8').on('data', (data: string) => {
      stderr = (stderr + data).slice(-4000)
    })
    child.on('error', (error) => fail(new ExtractionError(brief(error.message), nothing)))
    child.on('close', (code, signal) => {
      const parsed = parseReply(stdout)
      const spent = parsed?.success ? (parsed.data.usage ?? nothing) : nothing
      if (code === 0 && parsed?.success && parsed.data.usage && parsed.data.output !== undefined) return done({ output: parsed.data.output, usage: parsed.data.usage })
      const exited = `service-agent exited with ${code}`
      const why = signal ? `service-agent stopped by ${signal}` : parsed?.success ? (parsed.data.error ?? exited) : code === 0 ? 'service-agent reply is not { output, usage } JSON' : exited
      fail(new ExtractionError(brief([why, headline(stderr)].filter(Boolean).join(': ')), spent))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(task))
  })

export const serviceAgentExtractor = (agent: ServiceAgent): Extractor => {
  const cli = agent.cli ?? defaultCli()
  if (!existsSync(cli)) throw new RuleError(`service-agent CLI not found at ${cli}, set SERVICE_AGENT_CLI`)
  return { extract: (task) => run({ ...agent, cli }, task) }
}
