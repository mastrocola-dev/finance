import * as z from 'zod'

export const month = z.string().describe('Month as YYYY-MM')
export const today = z.string().optional().describe('Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo')
export const date = z.string().describe('Date as YYYY-MM-DD')
export const id = z.string().regex(/^\d+$/, 'id must be digits')
export const readOnly = { readOnlyHint: true, openWorldHint: false }
export const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
