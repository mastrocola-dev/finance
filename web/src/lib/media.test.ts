import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useMediaQuery } from './media.ts'

afterEach(() => vi.unstubAllGlobals())

test('falls back when the browser has no matchMedia', () => {
  vi.stubGlobal('matchMedia', undefined)
  expect(renderHook(() => useMediaQuery('(min-width: 768px)', true)).result.current).toBe(true)
  expect(renderHook(() => useMediaQuery('(min-width: 768px)', false)).result.current).toBe(false)
})

test('follows the media query as it changes', () => {
  const list = Object.assign(new EventTarget(), { matches: false })
  const matchMedia = vi.fn(() => list)
  vi.stubGlobal('matchMedia', matchMedia)
  const { result } = renderHook(() => useMediaQuery('(min-width: 768px)', true))
  expect(result.current).toBe(false)
  act(() => {
    list.matches = true
    list.dispatchEvent(new Event('change'))
  })
  expect(result.current).toBe(true)
  expect(matchMedia).toHaveBeenCalledWith('(min-width: 768px)')
})
