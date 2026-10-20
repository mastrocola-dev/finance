import { afterEach, expect, test, vi } from 'vitest'
import { readIdentity, storeIdentity } from './identity.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

test('stores and clears the local identity', () => {
  expect(readIdentity()).toBeUndefined()
  storeIdentity('Marcio')
  expect(readIdentity()).toBe('Marcio')
  storeIdentity(undefined)
  expect(readIdentity()).toBeUndefined()
})

test('survives blocked storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(readIdentity()).toBeUndefined()
  expect(() => storeIdentity('Marcio')).not.toThrow()
})
