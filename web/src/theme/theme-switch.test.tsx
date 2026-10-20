import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { applyTheme, readTheme } from './theme.ts'
import { ThemeSwitch } from './theme-switch.tsx'

const listeners = new Set<() => void>()
let prefersDark = false

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  prefersDark = false
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return prefersDark
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  listeners.clear()
})

const dark = () => document.documentElement.classList.contains('dark')

test('follows the system by default and when the stored value is unknown', () => {
  prefersDark = true
  applyTheme(readTheme())
  expect(dark()).toBe(true)
  localStorage.setItem('finance.theme', 'sepia')
  expect(readTheme()).toBe('system')
})

test('stores the choice per browser and applies it', () => {
  render(<ThemeSwitch />)
  expect(screen.getByRole('button', { name: 'Tema do sistema' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Tema escuro' }))
  expect(dark()).toBe(true)
  expect(localStorage.getItem('finance.theme')).toBe('dark')
  expect(screen.getByRole('button', { name: 'Tema escuro' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Tema claro' }))
  expect(dark()).toBe(false)
  expect(readTheme()).toBe('light')
})

test('tracks system changes only while on system', () => {
  render(<ThemeSwitch />)
  prefersDark = true
  for (const listener of listeners) listener()
  expect(dark()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Tema claro' }))
  expect(listeners.size).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Tema do sistema' }))
  expect(localStorage.getItem('finance.theme')).toBeNull()
  expect(dark()).toBe(true)
})

test('falls back to system when storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(readTheme()).toBe('system')
  vi.restoreAllMocks()
})
