import { expect, test } from 'vitest'
import { authConfigOf } from './config.ts'

const entra = { VITE_AUTH_MODE: 'entra', VITE_ENTRA_CLIENT_ID: 'client', VITE_ENTRA_AUTHORITY: 'https://caixa.ciamlogin.com/', VITE_ENTRA_SCOPE: 'api://finance/access' }

test('local is the default', () => {
  expect(authConfigOf({})).toEqual({ mode: 'local' })
  expect(authConfigOf({ VITE_AUTH_MODE: '' })).toEqual({ mode: 'local' })
})

test('entra needs client, authority and scope', () => {
  expect(authConfigOf(entra)).toEqual({ mode: 'entra', clientId: 'client', authority: 'https://caixa.ciamlogin.com/', scope: 'api://finance/access' })
  expect(() => authConfigOf({ ...entra, VITE_ENTRA_SCOPE: ' ', VITE_ENTRA_CLIENT_ID: undefined })).toThrow('VITE_AUTH_MODE=entra needs VITE_ENTRA_CLIENT_ID, VITE_ENTRA_SCOPE')
  expect(() => authConfigOf({ VITE_AUTH_MODE: 'token' })).toThrow('unknown VITE_AUTH_MODE token')
})
