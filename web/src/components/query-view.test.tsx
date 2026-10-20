import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { ApiFailure, unwrap } from '../query/client.ts'
import { EmptyState } from './empty-state.tsx'
import { QueryView } from './query-view.tsx'
import { Skeleton } from './skeleton.tsx'

afterEach(cleanup)

const View = ({ load }: { load: () => Promise<string[]> }) => {
  const query = useQuery({ queryKey: ['items'], queryFn: load, retry: false })
  return (
    <QueryView query={query} skeleton={<Skeleton className="h-10" />} empty={<EmptyState title="Nada por aqui" />} isEmpty={(items) => items.length === 0}>
      {(items) => <p>{items.join(', ')}</p>}
    </QueryView>
  )
}

const show = (load: () => Promise<string[]>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <View load={load} />
    </QueryClientProvider>,
  )

test('shows the skeleton while loading, then the data', async () => {
  const { container } = show(async () => ['Luz', 'Água'])
  expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  expect(await screen.findByText('Luz, Água')).toBeTruthy()
})

test('shows the empty state for empty data', async () => {
  show(async () => [])
  expect(await screen.findByText('Nada por aqui')).toBeTruthy()
})

test('shows the error state and retries', async () => {
  let fail = true
  show(async () => {
    if (fail) throw new Error('down')
    return ['Internet']
  })
  expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível carregar')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByText('Internet')).toBeTruthy()
})

test('unwrap returns data or throws the API error with its status', () => {
  expect(unwrap({ data: [1], response: new Response() })).toEqual([1])
  const failure = (() => {
    try {
      unwrap({ error: { error: 'member required' }, response: new Response(null, { status: 401 }) })
    } catch (caught) {
      return caught
    }
  })()
  expect(failure).toBeInstanceOf(ApiFailure)
  expect(failure).toMatchObject({ status: 401, message: 'member required' })
})
