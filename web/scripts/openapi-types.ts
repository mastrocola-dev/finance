import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')

export const documentFile = join(web, '..', 'openapi.json')
export const typesFile = join(web, 'src', 'api', 'schema.ts')

export const generate = async () => astToString(await openapiTS(JSON.parse(await readFile(documentFile, 'utf8')), { exportType: true, rootTypes: true, rootTypesNoSchemaPrefix: true }))

if (import.meta.main) await writeFile(typesFile, await generate())
