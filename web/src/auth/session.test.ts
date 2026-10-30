import { expect, test, vi } from 'vitest'
import { cookieSession } from './session.ts'

const place = (href: string) => {
  const location = { href, assign: vi.fn() } as unknown as Location & { assign: ReturnType<typeof vi.fn> }
  const history = { state: { key: 'k' }, replaceState: vi.fn() } as unknown as History & { replaceState: ReturnType<typeof vi.fn> }
  return { location, history }
}

test('signs in through the API with the current path to come back to', () => {
  const { location, history } = place('https://caixa.example/decisoes?month=2026-10')
  const session = cookieSession(location, history, vi.fn())
  expect(session.failed).toBe(false)
  expect(history.replaceState).not.toHaveBeenCalled()
  session.signIn('/decisoes?month=2026-10')
  expect(location.assign).toHaveBeenCalledWith('/auth/login?to=%2Fdecisoes%3Fmonth%3D2026-10')
})

test('a failed sign-in is read once from the address and removed from it', () => {
  const { location, history } = place('https://caixa.example/?entrada=falhou&x=1#top')
  expect(cookieSession(location, history, vi.fn()).failed).toBe(true)
  expect(history.replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/?x=1#top')
})

test('signs out with a POST and follows the provider logout, or goes home', async () => {
  const { location, history } = place('https://caixa.example/')
  const fetch = vi.fn(async () => Response.json({ logout_url: 'https://login.example/logout' }))
  await cookieSession(location, history, fetch as unknown as typeof globalThis.fetch).signOut()
  expect(fetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST', credentials: 'same-origin' })
  expect(location.assign).toHaveBeenLastCalledWith('https://login.example/logout')
  for (const answer of [async () => Response.json({ logout_url: null }), async () => Promise.reject(new Error('offline')), async () => new Response('no', { status: 403 })]) {
    await cookieSession(location, history, vi.fn(answer) as unknown as typeof globalThis.fetch).signOut()
    expect(location.assign).toHaveBeenLastCalledWith('/')
  }
})
