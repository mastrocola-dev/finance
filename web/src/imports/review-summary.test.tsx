import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ReviewSummary } from './review-summary.tsx'
import type { ReviewSummary as Summary } from './summary-model.ts'

const summary = (changes: Partial<Summary> = {}): Summary => ({ ready: 12, byModel: 9, waiting: 2, categories: [], merges: [], unchecked: [], failure: undefined, blocking: 0, blocked: 0, ...changes })

afterEach(cleanup)

const region = () => screen.getByRole('region', { name: 'Resumo' })

test('leads with the ready items and how many the Claude accepted', () => {
  render(<ReviewSummary summary={summary()} />)
  expect(within(region()).getByText('12 itens prontos para importar')).toBeTruthy()
  expect(within(region()).getByText('9 aceitos pelo Claude')).toBeTruthy()
  expect(within(region()).getByText('2 esperam revisão')).toBeTruthy()
  expect(within(region()).getByText('Nada bloqueia a importação')).toBeTruthy()
  expect(within(region()).queryByRole('list')).toBeNull()
  expect(within(region()).queryByRole('alert')).toBeNull()
})

test('says how many questions and items still block', () => {
  render(<ReviewSummary summary={summary({ ready: 1, byModel: 0, waiting: 0, blocking: 1, blocked: 2 })} />)
  expect(within(region()).getByText('1 item pronto para importar')).toBeTruthy()
  const blocks = within(within(region()).getByRole('list', { name: 'O que ainda bloqueia' })).getAllByRole('listitem')
  expect(blocks.map((item) => item.textContent)).toEqual(['1 pergunta ainda precisa de vocês', '2 itens com bloqueio: edite ou rejeite antes de aceitar'])
  expect(within(region()).queryByText('Nada bloqueia a importação')).toBeNull()
  expect(within(region()).queryByText(/aceito pelo Claude/)).toBeNull()
})

test('lists the new categories with their direction', () => {
  render(
    <ReviewSummary
      summary={summary({
        categories: [
          { id: '1', name: 'Bônus', direction: 'receita' },
          { id: '2', name: 'Pets', direction: 'despesa' },
        ],
      })}
    />,
  )
  expect(within(region()).getByRole('heading', { name: 'Categorias novas (2)' })).toBeTruthy()
  const items = within(screen.getByRole('list', { name: 'Categorias novas' })).getAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual(['Bônus, receita', 'Pets, despesa'])
})

test('shows each merge with its item count', () => {
  render(
    <ReviewSummary
      summary={summary({
        merges: [
          { name: 'Farmácia', kind: 'expense', to: 'Saúde', candidates: 3 },
          { name: 'Drogaria', kind: 'expense', to: 'Saúde', candidates: 1 },
        ],
      })}
    />,
  )
  const items = within(screen.getByRole('list', { name: 'Categorias juntadas' })).getAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual(['FarmáciaparaSaúde3 itens', 'DrogariaparaSaúde1 item'])
})

test('warns about subtotals a merge left unchecked', () => {
  render(<ReviewSummary summary={summary({ unchecked: ['Subtotal de Farmácia em outubro de 2026 (R$ 89,90) ficou sem conferência'] })} />)
  expect(within(screen.getByRole('list', { name: 'Subtotais sem conferência' })).getByText(/Subtotal de Farmácia/)).toBeTruthy()
  expect(within(region()).getByText(/Confira os itens antes de importar/)).toBeTruthy()
})

test('explains a consolidation failure', () => {
  render(<ReviewSummary summary={summary({ failure: 'Não foi possível juntar as categorias novas. Elas ficaram como foram lidas.' })} />)
  expect(within(region()).getByRole('alert').textContent).toBe('Não foi possível juntar as categorias novas. Elas ficaram como foram lidas.')
})
