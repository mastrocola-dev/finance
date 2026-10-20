import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './app.tsx'

test('renders the app title', () => {
  render(<App />)
  expect(screen.getByRole('heading', { level: 1, name: 'Finanças' })).toBeTruthy()
})
