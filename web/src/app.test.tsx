import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from './app.tsx'

const members = [
  { id: '1', name: 'Marcio', sharePercent: 50 },
  { id: '2', name: 'Gabriela', sharePercent: 50 },
]

const calls: Request[] = []

const fetch = vi.fn(async (input: Request) => {
  calls.push(input)
  const { pathname } = new URL(input.url)
  if (pathname === '/api/members') return Response.json(members)
  if (pathname === '/api/decisions') return Response.json([{ id: '1' }, { id: '2' }])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

beforeEach(() => {
  localStorage.clear()
  calls.length = 0
})

afterEach(cleanup)

const start = (url = '/') => {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} fetch={fetch} />)
  return history
}

const main = () => screen.getAllByRole('navigation', { name: 'Principal' })[0] as HTMLElement

test('renders the six screens in the sidebar with the proposed decisions count', async () => {
  start('/?month=2026-10')
  expect(await screen.findByRole('heading', { level: 1, name: 'Outubro de 2026' })).toBeTruthy()
  const links = within(main()).getAllByRole('link')
  await waitFor(() => expect(links.map((link) => link.textContent)).toEqual(['Visão do mês', 'Contas do mês', 'Lançamentos', 'Dívidas e reservas', 'Decisões2 pendentes', 'Atividade']))
  expect(links[0]?.getAttribute('aria-current')).toBe('page')
})

test('switches month and keeps month and member across screens', async () => {
  const history = start('/?month=2026-01&member=Gabriela')
  await screen.findByRole('heading', { level: 1, name: 'Janeiro de 2026' })
  await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
  await screen.findByRole('heading', { level: 1, name: 'Dezembro de 2025' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Gabriela' }).getAttribute('aria-pressed')).toBe('true'))
  await userEvent.click(within(main()).getByRole('link', { name: 'Contas do mês' }))
  await screen.findByRole('heading', { level: 1, name: 'Dezembro de 2025' })
  expect(history.location.pathname).toBe('/contas')
  expect(history.location.search).toContain('month=2025-12')
  expect(history.location.search).toContain('member=Gabriela')
})

test('the member filter selects one member or the whole household', async () => {
  const history = start('/lancamentos')
  await userEvent.click(await screen.findByRole('button', { name: 'Marcio' }))
  await waitFor(() => expect(history.location.search).toContain('member=Marcio'))
  await userEvent.click(screen.getByRole('button', { name: 'Casa' }))
  await waitFor(() => expect(history.location.search).not.toContain('member'))
  expect(screen.getByRole('button', { name: 'Casa' }).getAttribute('aria-pressed')).toBe('true')
})

test('ignores an unknown member and an invalid month', async () => {
  start('/?month=2026-13&member=Ninguem')
  expect(await screen.findByRole('heading', { level: 1, name: /de 20\d\d$/ })).toBeTruthy()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Casa' }).getAttribute('aria-pressed')).toBe('true'))
})

test('the identity picker sends x-member and is remembered per browser', async () => {
  start('/decisoes')
  const picker = (await screen.findAllByLabelText('Você é'))[0] as HTMLSelectElement
  await waitFor(() => expect(picker.options.length).toBe(3))
  expect(calls.every((request) => !request.headers.has('x-member'))).toBe(true)
  await userEvent.selectOptions(picker, 'Gabriela')
  expect(localStorage.getItem('finance.member')).toBe('Gabriela')
  expect(screen.getAllByText('Divide 50% · Casa').length).toBeGreaterThan(0)
  cleanup()
  calls.length = 0
  start('/decisoes')
  await screen.findByRole('heading', { level: 1, name: 'Decisões' })
  await waitFor(() => expect(calls.length).toBeGreaterThan(0))
  expect(calls.every((request) => request.headers.get('x-member') === 'Gabriela')).toBe(true)
})

test('answers unknown paths with a not found page', async () => {
  start('/nada')
  expect(await screen.findByText('Página não encontrada')).toBeTruthy()
})
