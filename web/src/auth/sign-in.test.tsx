import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import type { Session } from './session.ts'

const members = [
  { id: '1', name: 'Marcio', sharePercent: 50 },
  { id: '2', name: 'Gabriela', sharePercent: 50 },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const fakeSession = (failed = false) => ({
  failed,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
})

const api = (signedIn: boolean, answer: (request: Request) => Response | undefined = () => undefined) => {
  const calls: Request[] = []
  const fetch = vi.fn(async (request: Request) => {
    calls.push(request)
    const { pathname } = new URL(request.url)
    const answered = answer(request)
    if (answered) return answered
    if (!signedIn) return Response.json({ error: 'this request needs a signed-in session or a bearer token' }, { status: 401 })
    if (pathname === '/api/me') return Response.json(members[0])
    if (pathname === '/api/members') return Response.json(members)
    if (pathname === '/api/decisions') return Response.json([])
    return Response.json({ error: 'not found' }, { status: 404 })
  }) as unknown as typeof globalThis.fetch
  return { calls, fetch }
}

const start = (session: Session, fetch: typeof globalThis.fetch, url = '/decisoes') => render(<App history={createMemoryHistory({ initialEntries: [url] })} fetch={fetch} session={session} />)

const sidebar = () => screen.getAllByRole('complementary')[0] as HTMLElement

test('without a session cookie only the sign-in screen shows and Entrar goes to the API login', async () => {
  const session = fakeSession()
  const { calls, fetch } = api(false)
  start(session, fetch)
  expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
  expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }))
  expect(session.signIn).toHaveBeenCalledWith('/')
  expect(calls.map(({ url }) => new URL(url).pathname)).toEqual(['/api/me'])
})

test('a failed sign-in callback is told in Portuguese', async () => {
  start(fakeSession(true), api(false).fetch)
  expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível concluir a entrada. Tente de novo.')
  expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeTruthy()
})

test('signed in calls the API with the cookie, shows the member and signs out from the sidebar, dropping cached reads', async () => {
  const caches = { delete: vi.fn(async () => true) }
  vi.stubGlobal('caches', caches)
  const session = fakeSession()
  const { calls, fetch } = api(true)
  start(session, fetch)
  expect(await screen.findByRole('heading', { level: 1, name: 'Decisões' })).toBeTruthy()
  await waitFor(() => expect(within(sidebar()).getByText('Marcio')).toBeTruthy())
  expect(screen.queryByLabelText('Você é')).toBeNull()
  expect(calls.length).toBeGreaterThan(1)
  expect(calls.every((request) => request.credentials === 'same-origin' && !request.headers.has('authorization') && !request.headers.has('x-member'))).toBe(true)
  await userEvent.click(within(sidebar()).getByRole('button', { name: 'Sair' }))
  expect(session.signOut).toHaveBeenCalledOnce()
  expect(caches.delete).toHaveBeenCalledWith('api')
})

test('a 401 after signing in sends the person back to the sign-in screen', async () => {
  const expired = (request: Request) => (new URL(request.url).pathname === '/api/decisions' ? Response.json({ error: 'this request needs a signed-in session or a bearer token' }, { status: 401 }) : undefined)
  start(fakeSession(), api(true, expired).fetch)
  expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('Sua sessão terminou. Entre de novo para continuar.')
  expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull()
})

test('an account no member is linked to is told so on the sign-in screen', async () => {
  const unknown = () => Response.json({ error: 'unknown member' }, { status: 403 })
  start(fakeSession(), api(true, unknown).fetch)
  expect(await screen.findByRole('status')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('Esta conta Google não está cadastrada na casa. Entre com outra conta.')
})
