import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app.tsx'

const entry = (id: string, description: string, state: 'paid' | 'pending' | 'late', dueOn: string, cents: number) => ({
  id,
  competence: '2026-10-01',
  dueOn,
  description,
  direction: 'expense',
  amount: { cents: String(cents), brl: '' },
  category: 'Moradia',
  account: null,
  member: null,
  status: state === 'paid' ? 'paid' : 'planned',
  state,
  paidOn: state === 'paid' ? dueOn : null,
  installmentNumber: null,
})

const seed = () => [entry('1', 'Aluguel', 'paid', '2026-10-05', 380000), entry('2', 'Plano de saúde', 'late', '2026-10-15', 75000), entry('3', 'Internet', 'pending', '2026-10-25', 12990)]

let bills = seed()
const posts: string[] = []
let failing = false
let gate: Promise<unknown> | undefined

const fetch = vi.fn(async (input: Request) => {
  const url = new URL(input.url)
  if (input.method === 'POST') {
    posts.push(url.pathname)
    await gate
    if (failing) return Response.json({ error: 'boom' }, { status: 500 })
    const [, id, action] = url.pathname.match(/^\/api\/entries\/(\d+)\/(paid|unpaid)$/) ?? []
    bills = bills.map((bill) => (bill.id === id ? (action === 'paid' ? { ...bill, status: 'paid', state: 'paid', paidOn: '2026-10-21' } : { ...bill, status: 'planned', state: 'late', paidOn: null }) : bill))
    return Response.json(bills.find((bill) => bill.id === id))
  }
  if (url.pathname === '/api/months/2026-10/entries') return Response.json(bills)
  if (url.pathname === '/api/months/2026-11/entries') return Response.json([])
  if (url.pathname === '/api/members') return Response.json([{ id: '1', name: 'Marcio', sharePercent: 50 }])
  if (url.pathname === '/api/decisions') return Response.json([])
  return Response.json({ error: 'not found' }, { status: 404 })
}) as unknown as typeof globalThis.fetch

afterEach(() => {
  cleanup()
  posts.length = 0
  bills = seed()
  failing = false
  gate = undefined
})

const start = (url: string) => render(<App history={createMemoryHistory({ initialEntries: [url] })} fetch={fetch} />)

const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

test('lists the month bills with progress and what is still open', async () => {
  start('/contas?month=2026-10')
  const list = await screen.findByRole('region', { name: 'Contas' })
  expect(within(list).getByText('1 de 3 pagas')).toBeTruthy()
  expect(within(list).getByText('falta R$ 879,90')).toBeTruthy()
  expect(within(list).getByRole('img').getAttribute('aria-label')).toBe('33% das contas pagas')
  expect(
    within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-pressed')),
  ).toEqual(['false', 'false', 'true'])
  expect(within(list).getByText('Atrasada · venceu 15/10 · Conjunto')).toBeTruthy()
})

test('marks a bill paid at once and undoes it from the toast', async () => {
  const user = userEvent.setup()
  start('/contas?month=2026-10')
  await screen.findByRole('region', { name: 'Contas' })
  let release = () => {}
  gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await user.click(row('Plano de saúde'))
  await waitFor(() => expect(row('Plano de saúde').getAttribute('aria-pressed')).toBe('true'))
  await user.click(row('Plano de saúde'))
  expect(screen.getByText('2 de 3 pagas')).toBeTruthy()
  expect(screen.queryByText('Plano de saúde marcada como paga')).toBeNull()
  release()
  gate = undefined
  await screen.findByText('Plano de saúde marcada como paga')
  expect(posts).toEqual(['/api/entries/2/paid'])
  await user.click(screen.getByRole('button', { name: 'Desfazer' }))
  await waitFor(() => expect(posts).toEqual(['/api/entries/2/paid', '/api/entries/2/unpaid']))
  await screen.findByText('Plano de saúde voltou para em aberto')
  expect(row('Plano de saúde').getAttribute('aria-pressed')).toBe('false')
})

test('rolls back and explains when the server refuses', async () => {
  const user = userEvent.setup()
  failing = true
  start('/contas?month=2026-10')
  await screen.findByRole('region', { name: 'Contas' })
  await user.click(row('Internet'))
  await screen.findByText('Não foi possível marcar Internet. Tente de novo.')
  expect(posts).toEqual(['/api/entries/3/paid'])
  expect(row('Internet').getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByText('1 de 3 pagas')).toBeTruthy()
})

test('shows an empty month', async () => {
  start('/contas?month=2026-11')
  expect(await screen.findByText('Nenhuma conta em novembro de 2026')).toBeTruthy()
})
