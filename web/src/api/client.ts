import createClient from 'openapi-fetch'
import type { paths } from './schema.ts'

export type ApiOptions = { baseUrl?: string; member?: string; fetch?: typeof fetch }

export const createApi = ({ baseUrl = globalThis.location?.origin ?? '', member, fetch }: ApiOptions = {}) => createClient<paths>({ baseUrl, fetch, headers: member ? { 'x-member': member } : {} })

export type Api = ReturnType<typeof createApi>
