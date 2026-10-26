import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { generate, typesFile } from './openapi-types.ts'

test('keeps the web types in sync with openapi.json', async () => {
  expect(await readFile(typesFile, 'utf8')).toBe(await generate())
})
