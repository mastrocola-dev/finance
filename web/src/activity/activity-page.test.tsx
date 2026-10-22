import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'
import type { AuditItem } from './describe.ts'

const event = (id: string, changes: Partial<AuditItem>): AuditItem => ({ id, at: '2025-10-20T12:14:00.000Z', author: 'member', member: 'Gabriela', entity: 'entry', entityId: id, action: 'create', subject: null, before: null, after: null, ...changes })

const items = [
  event('6', { author: 'claude', member: 'Marcio', action: 'update', subject: 'Energia', before: { description: 'Energia', status: 'planned', paid_on: null, competence: '2025-10-01' }, after: { description: 'Energia', status: 'paid', paid_on: '2025-10-20', competence: '2025-10-01' } }),
  event('5', { subject: 'Mercado', after: { description: 'Mercado', amount_cents: 38620, competence: '2025-10-01' } }),
  event('4', { at: '2025-10-19T21:02:00.000Z', author: 'import', member: null, subject: 'Aluguel', after: { description: 'Aluguel', amount_cents: 250000, competence: '2025-09-01' } }),
]

const older = event('2', { at: '2025-10-18T10:00:00.000Z', entity: 'reserve', action: 'update', subject: 'Fundo de emergência', before: { balance_cents: 100000 }, after: { balance_cents: 150000 } })

const counts = { counts: { member: 2, claude: 1, import: 1, system: 0 }, memberCounts: [{ name: 'Gabriela', total: 2 }] }

let failing = false
const calls: URL[] = []

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  calls.push(url)
  if (url.pathname === '/api/members')
    return Response.json([
      { id: '1', name: 'Marcio', sharePercent: 50 },
      { id: '2', name: 'Gabriela', sharePercent: 50 },
    ])
  if (url.pathname === '/api/decisions') return Response.json([])
  if (url.pathname !== '/api/audit') return Response.json({ error: 'not found' }, { status: 404 })
  if (failing) return Response.json({ error: 'boom' }, { status: 500 })
  const query = url.searchParams
  if (query.get('limit') === '1') return Response.json({ items: items.slice(0, 1), ...counts, next: '6' })
  if (query.get('before') === '4') return Response.json({ items: [older], ...counts, next: null })
  const author = query.get('author')
  const chosen = items.filter((item) => !author || (item.author === author && (!query.get('member') || item.member === query.get('member'))))
  return Response.json({ items: chosen, ...counts, next: author ? null : '4' })
}) as unknown as typeof globalThis.fetch

afterEach(() => {
  cleanup()
  localStorage.clear()
  calls.length = 0
  failing = false
})

const start = () => render(<App history={createMemoryHistory({ initialEntries: ['/atividade'] })} fetch={fetch} />)

const day = (name: RegExp) => screen.findByRole('region', { name })

test('shows the timeline by day with authors, records and a before and after table', async () => {
  start()
  const first = await day(/20 de outubro/)
  const events = within(first).getAllByRole('listitem')
  expect(events).toHaveLength(2)
  expect(within(events[0] as HTMLElement).getByText('Claude')).toBeTruthy()
  expect(within(events[0] as HTMLElement).getByText('a pedido de Marcio')).toBeTruthy()
  expect(within(events[0] as HTMLElement).getByText('· alterou · lançamento #6')).toBeTruthy()
  expect(within(events[0] as HTMLElement).getByText('Marcou Energia como paga')).toBeTruthy()
  const rows = within(within(events[0] as HTMLElement).getByRole('table')).getAllByRole('row')
  expect(rows.map((row) => row.textContent)).toEqual(['CampoAntesDepois', 'situaçãopendentepaga', 'pago em—2025-10-20'])
  expect(within(events[1] as HTMLElement).queryByRole('table')).toBeNull()
  expect(
    within(events[1] as HTMLElement)
      .getByRole('link', { name: 'Ver registro' })
      .getAttribute('href'),
  ).toBe('/lancamentos?month=2025-10')
  const second = await day(/19 de outubro/)
  expect(within(second).getByText('Importação')).toBeTruthy()
  expect(within(second).getByText('Lançou Aluguel · R$ 2.500,00')).toBeTruthy()
})

test('filters by author with counts and reads the member filter as written by that member', async () => {
  start()
  const filters = await screen.findByRole('group', { name: 'Autor' })
  expect(
    within(filters)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Todos 4', 'Claude 1', 'Marcio 0', 'Gabriela 2', 'Importação 1'])
  await userEvent.click(within(filters).getByRole('button', { name: 'Gabriela 2' }))
  await waitFor(() => expect(within(filters).getByRole('button', { name: 'Gabriela 2' }).getAttribute('aria-pressed')).toBe('true'))
  await waitFor(() => expect(screen.queryByText('Marcou Energia como paga')).toBeNull())
  expect(screen.getByText('Lançou Mercado · R$ 386,20')).toBeTruthy()
  const last = calls.filter(({ pathname }) => pathname === '/api/audit').at(-1)
  expect(last?.searchParams.get('author')).toBe('member')
  expect(last?.searchParams.get('member')).toBe('Gabriela')
  await userEvent.click(within(filters).getByRole('button', { name: 'Marcio 0' }))
  expect(await screen.findByText('Nada registrado por Marcio ainda.')).toBeTruthy()
})

test('loads older pages with the cursor', async () => {
  start()
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }))
  const third = await day(/18 de outubro/)
  expect(within(third).getByText('Alterou reserva Fundo de emergência')).toBeTruthy()
  expect(within(third).getByRole('link', { name: 'Ver registro' }).getAttribute('href')).toBe('/patrimonio')
  expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
})

test('offers a retry when the log cannot be read', async () => {
  failing = true
  start()
  expect(await screen.findByRole('button', { name: /tentar/i }, { timeout: 3000 })).toBeTruthy()
})
