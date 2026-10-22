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
  if (pathname === '/api/decisions') return Response.json(['1', '2'].map((id) => ({ id, title: `Decisão ${id}`, description: '', amount: null, status: 'proposed', proposedBy: 'Marcio', origin: 'manual', confirmedBy: [], awaiting: ['Gabriela'], createdAt: '2026-10-19T12:00:00.000Z', closedAt: null })))
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

test('every screen is a tab or an entry of the Mais menu', async () => {
  const history = start('/decisoes?month=2026-10')
  await screen.findByRole('heading', { level: 1, name: 'Decisões' })
  const tabBar = screen.getAllByRole('navigation', { name: 'Principal' })[1] as HTMLElement
  expect(within(tabBar).getAllByRole('link')).toHaveLength(5)
  const more = screen.getByRole('button', { name: 'Mais' })
  expect(more.getAttribute('aria-expanded')).toBe('false')
  await userEvent.click(more)
  const menu = screen.getByRole('navigation', { name: 'Mais telas' })
  expect(
    within(menu)
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Lançamentos', 'Atividade'])
  expect(screen.getAllByRole('group', { name: 'Tema' })).toHaveLength(2)
  const reachable = [...within(tabBar).getAllByRole('link'), ...within(menu).getAllByRole('link')].map((link) => new URL(link.getAttribute('href') ?? '', 'http://x').pathname)
  expect([...new Set(reachable)].sort()).toEqual(['/', '/atividade', '/contas', '/decisoes', '/lancamentos', '/patrimonio'])
  await userEvent.click(within(menu).getByRole('link', { name: 'Atividade' }))
  await screen.findByRole('heading', { level: 1, name: 'Atividade' })
  expect(history.location.search).toContain('month=2026-10')
  expect(screen.queryByRole('navigation', { name: 'Mais telas' })).toBeNull()
})

test('the Mais menu closes on Escape and on a tap outside', async () => {
  start('/decisoes')
  await screen.findByRole('heading', { level: 1, name: 'Decisões' })
  const more = screen.getByRole('button', { name: 'Mais' })
  await userEvent.click(more)
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('navigation', { name: 'Mais telas' })).toBeNull()
  expect(document.activeElement).toBe(more)
  await userEvent.click(more)
  await userEvent.click(screen.getByRole('heading', { level: 1, name: 'Decisões' }))
  expect(screen.queryByRole('navigation', { name: 'Mais telas' })).toBeNull()
})
