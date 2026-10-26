import { writeFile } from 'node:fs/promises'
import { routes } from './api.ts'
import { openApi } from './openapi.ts'

export const documentFile = new URL('../../openapi.json', import.meta.url)

export const serialized = () => `${JSON.stringify(openApi(routes), null, 2)}\n`

if (import.meta.main) await writeFile(documentFile, serialized())
