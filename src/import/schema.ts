import { writeFile } from 'node:fs/promises'
import * as z from 'zod'
import { importOutputJsonSchema } from './candidate.ts'
import { consolidationOutput } from './consolidate.ts'

const limits = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems'])

type Node = Record<string, unknown>

const nullable = (node: Node) => Array.isArray(node.anyOf) && node.anyOf.some((item: Node) => item.type === 'null')

const answered = (node: Node) => 'default' in node || nullable(node)

const requireAnswered = (node: Node) => {
  const properties = node.properties as Record<string, Node>
  const required = new Set([...((node.required as string[]) ?? []), ...Object.entries(properties).flatMap(([key, value]) => (answered(value) ? [key] : []))])
  return { ...node, required: Object.keys(properties).filter((key) => required.has(key)) }
}

export const structured = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(structured)
  if (typeof node !== 'object' || node === null) return node
  const shaped = 'properties' in node ? requireAnswered(node as Node) : node
  const entries = Object.entries(shaped).filter(([key]) => !limits.has(key) && key !== 'default' && !(key === 'pattern' && 'format' in shaped))
  return Object.fromEntries(entries.map(([key, value]) => [key === 'oneOf' ? 'anyOf' : key, structured(value)]))
}

export const parameterCounts = (node: unknown, counts = { optional: 0, unions: 0 }) => {
  if (Array.isArray(node)) {
    for (const item of node) parameterCounts(item, counts)
    return counts
  }
  if (typeof node !== 'object' || node === null) return counts
  const { properties, required = [] } = node as { properties?: Record<string, Node>; required?: string[] }
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (!required.includes(key)) counts.optional++
    if (Array.isArray(value.anyOf) || Array.isArray(value.type)) counts.unions++
  }
  for (const value of Object.values(node)) parameterCounts(value, counts)
  return counts
}

export const outputSchemaPath = new URL('../../agents/import/output.schema.json', import.meta.url)

export const outputSchemaText = () => `${JSON.stringify(structured(importOutputJsonSchema()), null, 2)}\n`

export const consolidateSchemaPath = new URL('../../agents/import-consolidate/output.schema.json', import.meta.url)

export const consolidateSchemaText = () => `${JSON.stringify(structured(z.toJSONSchema(consolidationOutput, { io: 'input', target: 'draft-2020-12' })), null, 2)}\n`

if (import.meta.main) await Promise.all([writeFile(outputSchemaPath, outputSchemaText()), writeFile(consolidateSchemaPath, consolidateSchemaText())])
