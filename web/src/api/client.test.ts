import { expect, test } from 'vitest'
import { createApi } from './client.ts'

const recording = () => {
  const requests: Request[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return Response.json([], { status: 200 })
  }
  return { requests, fetch: fetch as typeof globalThis.fetch }
}

test('fills path and query parameters from the contract', async () => {
  const { requests, fetch } = recording()
  const api = createApi({ baseUrl: 'http://localhost:5173', fetch })
  const { data } = await api.GET('/api/months/{month}/entries', { params: { path: { month: '2026-10' }, query: { state: 'late' } } })
  expect(data).toEqual([])
  expect(requests[0]?.url).toBe('http://localhost:5173/api/months/2026-10/entries?state=late')
  expect(requests[0]?.headers.has('x-member')).toBe(false)
})

test('sends the member header on writes', async () => {
  const { requests, fetch } = recording()
  const api = createApi({ baseUrl: 'http://localhost:5173', member: 'Marcio', fetch })
  await api.POST('/api/entries/{id}/paid', { params: { path: { id: '42' } }, body: { paid_on: '2026-10-20' } })
  expect(requests[0]?.method).toBe('POST')
  expect(requests[0]?.headers.get('x-member')).toBe('Marcio')
  expect(await requests[0]?.json()).toEqual({ paid_on: '2026-10-20' })
})
