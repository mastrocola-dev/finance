import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SignInScreen } from './sign-in-screen.tsx'

afterEach(cleanup)

test('the default screen shows the product, a Google button, the footer and the version', () => {
  render(<SignInScreen signIn={vi.fn()} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy()
  expect(screen.getByText('As finanças da casa, em um só lugar')).toBeTruthy()
  expect(screen.getAllByRole('listitem').map((item) => item.querySelector('.font-semibold')?.textContent)).toEqual(['Lançamentos do mês', 'Contas a pagar', 'Importação de planilhas'])
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('Acesso só para os membros da casa')).toBeTruthy()
  expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeTruthy()
  const button = screen.getByRole('button', { name: 'Entrar com Google' })
  expect(button.querySelector('svg path[fill="#4285F4"]')).toBeTruthy()
  expect(button.getAttribute('aria-busy')).toBe('false')
})

test('Entrar com Google turns busy and disabled while the browser leaves, and comes back from the back button', async () => {
  const signIn = vi.fn()
  render(<SignInScreen signIn={signIn} />)
  await userEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }))
  expect(signIn).toHaveBeenCalledWith(false)
  const busy = screen.getByRole('button', { name: 'Abrindo o Google…' }) as HTMLButtonElement
  expect(busy.disabled).toBe(true)
  expect(busy.getAttribute('aria-busy')).toBe('true')
  fireEvent(globalThis.window, Object.assign(new Event('pageshow'), { persisted: true }))
  expect(await screen.findByRole('button', { name: 'Entrar com Google' })).toBeTruthy()
})

test('expired says what happened and what to do', () => {
  render(<SignInScreen signIn={vi.fn()} ended="expired" />)
  const status = screen.getByRole('status')
  expect(status.textContent).toContain('Sua sessão terminou.')
  expect(status.textContent).toContain('Entre de novo para continuar de onde parou.')
  expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeTruthy()
})

test('failed is an alert that asks to try again', () => {
  render(<SignInScreen signIn={vi.fn()} ended="failed" />)
  expect(screen.getByRole('alert').textContent).toContain('Não foi possível concluir a entrada.Tente de novo.')
  expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeTruthy()
})

test('unknown offers another account, which asks to choose one', async () => {
  const signIn = vi.fn()
  render(<SignInScreen signIn={signIn} ended="unknown" />)
  expect(screen.getByRole('status').textContent).toContain('Esta conta Google não está cadastrada na casa.')
  expect(screen.queryByRole('button', { name: 'Entrar com Google' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Entrar com outra conta' }))
  expect(signIn).toHaveBeenCalledWith(true)
  expect((screen.getByRole('button', { name: 'Abrindo o Google…' }) as HTMLButtonElement).disabled).toBe(true)
})
