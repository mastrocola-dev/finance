import { expect, test } from 'vitest'
import { authConfigOf } from './config.ts'

test('local is the default', () => {
  expect(authConfigOf({})).toEqual({ mode: 'local' })
  expect(authConfigOf({ VITE_AUTH_MODE: '' })).toEqual({ mode: 'local' })
})

test('entra needs nothing else at build time and unknown modes fail', () => {
  expect(authConfigOf({ VITE_AUTH_MODE: 'entra' })).toEqual({ mode: 'entra' })
  expect(() => authConfigOf({ VITE_AUTH_MODE: 'token' })).toThrow('unknown VITE_AUTH_MODE token')
})
