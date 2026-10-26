import { expect, test } from 'vitest'
import { cn } from './utils.ts'

test('keeps a token size beside a token color and lets the last color win', () => {
  expect(cn('text-meta text-muted', 'text-text')).toBe('text-meta text-text')
  expect(cn('rounded-card', 'rounded-control')).toBe('rounded-control')
  expect(cn('bg-surface', false, 'bg-sunken')).toBe('bg-sunken')
})
