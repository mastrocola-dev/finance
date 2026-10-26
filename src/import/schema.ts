import { writeFile } from 'node:fs/promises'
import { importOutputJsonSchema } from './candidate.ts'

const limits = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems'])

export const structured = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(structured)
  if (typeof node !== 'object' || node === null) return node
  const entries = Object.entries(node).filter(([key]) => !limits.has(key) && !(key === 'pattern' && 'format' in node))
  return Object.fromEntries(entries.map(([key, value]) => [key === 'oneOf' ? 'anyOf' : key, structured(value)]))
}

export const outputSchemaPath = new URL('../../agents/import/output.schema.json', import.meta.url)

export const outputSchemaText = () => `${JSON.stringify(structured(importOutputJsonSchema()), null, 2)}\n`

if (import.meta.main) await writeFile(outputSchemaPath, outputSchemaText())
