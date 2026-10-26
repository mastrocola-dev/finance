import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { getDefaultEnvironment, StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/client/stdio'
import * as z from 'zod'
import type { Segment } from './agent.ts'

const ingestDirectory = fileURLToPath(new URL('../../ingest', import.meta.url))
export const runtimeEnvironment = join(ingestDirectory, '.venv-runtime')

const segment = z.object({ id: z.string(), kind: z.enum(['table', 'tree', 'text']), source: z.string(), shape: z.record(z.string(), z.unknown()), preview: z.unknown().optional() })
const listing = z.object({ segments: z.array(segment) })

const passed = () => ['UV_SYSTEM_CERTS', 'UV_OFFLINE'].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : []))

export const ingestRuntime = (command: string[]) => ({
  command: 'uv',
  args: ['--directory', ingestDirectory, 'run', '--no-dev', '--exact', '--locked', '--quiet', ...command],
  env: { ...getDefaultEnvironment(), ...Object.fromEntries(passed()), UV_PROJECT_ENVIRONMENT: runtimeEnvironment },
})

export const ingestServer = (folder: string): StdioServerParameters => ({ ...ingestRuntime(['python', '-m', 'ingest', 'serve', resolve(folder)]), stderr: 'ignore' })

const failure = (content: unknown) =>
  (content as { type: string; text?: string }[])
    .flatMap((item) => (item.type === 'text' && item.text ? [item.text] : []))
    .join(' ')
    .slice(0, 300) || 'ingest failed'

export const ingestSegments = async (folder: string, file: string, server = ingestServer(folder)): Promise<Segment[]> => {
  const client = new Client({ name: 'finance-import', version: '0.0.0' })
  await client.connect(new StdioClientTransport(server))
  try {
    const result = await client.callTool({ name: 'list_segments', arguments: { file } })
    if (result.isError) throw new Error(failure(result.content))
    return listing.parse(result.structuredContent).segments
  } finally {
    await client.close()
  }
}
