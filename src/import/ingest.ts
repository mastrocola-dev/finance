import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { getDefaultEnvironment, StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/client/stdio'
import * as z from 'zod'
import type { Segment } from './agent.ts'

const ingestDirectory = fileURLToPath(new URL('../../ingest', import.meta.url))

const segment = z.object({ id: z.string(), kind: z.enum(['table', 'tree', 'text']), source: z.string(), shape: z.record(z.string(), z.unknown()), preview: z.unknown().optional() })
const listing = z.object({ segments: z.array(segment) })

export const ingestServer = (folder: string): StdioServerParameters => ({
  command: 'uv',
  args: ['--directory', ingestDirectory, 'run', '--quiet', 'python', '-m', 'ingest', 'serve', resolve(folder)],
  env: { ...getDefaultEnvironment(), ...(process.env.UV_SYSTEM_CERTS ? { UV_SYSTEM_CERTS: process.env.UV_SYSTEM_CERTS } : {}) },
  stderr: 'ignore',
})

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
