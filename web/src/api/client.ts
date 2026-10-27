import createClient from 'openapi-fetch'
import type { paths } from './schema.ts'

export type ApiOptions = { baseUrl?: string; member?: string; token?: () => Promise<string | undefined>; fetch?: typeof fetch }

export const createApi = ({ baseUrl = globalThis.location?.origin ?? '', member, token, fetch }: ApiOptions = {}) => {
  const client = createClient<paths>({ baseUrl, fetch, headers: member ? { 'x-member': member } : {} })
  if (token)
    client.use({
      onRequest: async ({ request }) => {
        const bearer = await token()
        if (bearer) request.headers.set('authorization', `Bearer ${bearer}`)
        return request
      },
    })
  return client
}

export type Api = ReturnType<typeof createApi>
