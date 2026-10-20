import * as z from 'zod'
import type { Route } from './api.ts'
import { memberHeader, schemas } from './contract.ts'

type JsonSchema = { properties?: Record<string, { description?: string }>; required?: string[] }

const uri = (id: string) => `#/components/schemas/${id}`
const json = (schema: unknown) => ({ 'application/json': { schema } })
const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

const parameters = (place: 'path' | 'query', schema?: z.ZodType) => {
  if (!schema) return []
  const { properties = {}, required = [] } = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema
  return Object.entries(properties).map(([name, { description, ...property }]) => ({ name, in: place, required: place === 'path' || required.includes(name), ...(description ? { description } : {}), schema: property }))
}

export const openApi = (routes: Route[]) => {
  const registry = z.registry<{ id: string }>()
  for (const [id, schema] of Object.entries(schemas)) registry.add(schema, { id })
  const reference = (schema: z.ZodType, fallback: string) => {
    if (!registry.has(schema)) registry.add(schema, { id: fallback })
    return { $ref: uri(registry.get(schema)?.id ?? fallback) }
  }
  const paths: Record<string, Record<string, unknown>> = {}
  for (const route of routes) {
    const path = route.pattern.pathname.replace(/:(\w+)/g, '{$1}')
    const writes = route.method !== 'GET'
    paths[path] = {
      ...paths[path],
      [route.method.toLowerCase()]: {
        operationId: route.operationId,
        summary: route.summary,
        security: writes ? [{ member: [] }] : [{}, { member: [] }],
        parameters: [...parameters('path', route.params), ...parameters('query', route.query)],
        ...(route.body ? { requestBody: { required: true, content: json(reference(route.body, `${capitalized(route.operationId)}Body`)) } } : {}),
        responses: {
          [route.status ?? 200]: { description: route.status === 201 ? 'Created' : 'OK', content: json(reference(route.response, `${capitalized(route.operationId)}Response`)) },
          default: { description: 'Error', content: json({ $ref: uri('ApiError') }) },
        },
      },
    }
  }
  const components = Object.fromEntries(Object.entries(z.toJSONSchema(registry, { io: 'input', uri }).schemas).map(([id, { $schema, $id, ...schema }]) => [id, schema]))
  return {
    openapi: '3.1.0',
    info: { title: 'finance', version: '0.1.0', description: `Household finance ledger. Writes are audited as the member named in the ${memberHeader} header.` },
    paths,
    components: { schemas: components, securitySchemes: { member: { type: 'apiKey', in: 'header', name: memberHeader } } },
  }
}
