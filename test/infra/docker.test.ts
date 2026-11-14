import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const dockerfile = readFileSync(new URL('Dockerfile', root), 'utf8')
const ignore = readFileSync(new URL('.dockerignore', root), 'utf8').split('\n').filter(Boolean)
const workflow = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8')

const stages = dockerfile
  .split(/^(?=FROM )/m)
  .filter((text) => text.startsWith('FROM '))
  .map((text) => ({ name: /AS (\w+)/.exec(text)?.[1] ?? '', from: text.split(/\s/)[1] ?? '', text }))

const stage = (name: string) => {
  const found = stages.find((item) => item.name === name)
  assert.ok(found, name)
  return found
}

const lineage = (name: string): string[] => {
  const { from } = stage(name)
  return stages.some((item) => item.name === from) ? [name, ...lineage(from)] : [name]
}

test('the image is multi-stage on pinned bases, Node 24 slim for everything that runs node', () => {
  assert.ok(stages.length >= 4)
  for (const { from } of stages) assert.match(from, /^((node:24-slim|ghcr\.io\/astral-sh\/uv:\d+\.\d+\.\d+)(@sha256:[0-9a-f]{64})?|modules|ingest|base|uv)$/)
  assert.match(stage('base').from, /^node:24-slim(@|$)/)
})

test('api, mcp and extract run as a non-root user with an existing entry point', () => {
  for (const [name, entry, port] of [
    ['api', 'src/http/api.ts', '3200'],
    ['mcp', 'src/mcp/http.ts', '3100'],
    ['extract', 'src/http/extract.ts', '3300'],
  ] as const) {
    const { text } = stage(name)
    assert.deepEqual(text.match(/^USER .+$/gm)?.at(-1), 'USER node', name)
    assert.ok(text.indexOf('USER node') < text.indexOf('CMD'), name)
    assert.ok(text.includes(`CMD ["node", "${entry}"]`), name)
    assert.ok(text.includes(`EXPOSE ${port}`), name)
    assert.ok(existsSync(new URL(entry, root)), entry)
    assert.ok(lineage(name).includes('base'), name)
  }
})

test('only production dependencies and a prebuilt ingest runtime reach the images', () => {
  assert.match(stage('modules').text, /npm ci --omit=dev/)
  assert.match(stage('ingest').text, /uv sync --no-dev --exact --locked/)
  assert.match(stage('ingest').text, /UV_PROJECT_ENVIRONMENT=\/app\/ingest\/\.venv-runtime/)
  assert.match(stage('ingest').text, /COPY ingest\/serve.py \.\//)
  assert.ok(ignore.includes('!ingest/serve.py'))
  assert.match(stage('extract').text, /UV_OFFLINE=1/)
  assert.match(stage('extract').text, /IMPORT_UPLOADS=\/app\/\.imports/)
  assert.match(stage('extract').text, /EXTRACT_HOST=0\.0\.0\.0/)
  for (const name of ['api', 'mcp']) assert.doesNotMatch(stage(name).text, /ingest|uv|python|agents|\.imports/i, name)
})

test('the api image carries the web built for the entra sign-in and serves it from WEB_ROOT', () => {
  assert.match(stage('web').text, /npm ci --workspace web/)
  assert.match(stage('web').text, /VITE_AUTH_MODE=entra npm run build -w web/)
  assert.match(stage('api').text, /COPY --from=web \/app\/web\/dist web\/dist/)
  assert.match(stage('api').text, /WEB_ROOT=\/app\/web\/dist/)
  assert.doesNotMatch(stage('mcp').text, /web/)
  assert.doesNotMatch(stage('extract').text, /web/)
  assert.doesNotMatch(stage('modules').text, /web\/src/)
})

test('the extract image carries service-agent at a pinned commit with production modules only', () => {
  const { text } = stage('agent')
  const sha = /^ARG SERVICE_AGENT_SHA=([0-9a-f]+)$/m.exec(text)?.[1] ?? ''
  assert.match(sha, /^[0-9a-f]{40}$/)
  assert.match(text, /^ADD https:\/\/github\.com\/mastrocola-dev\/service-agent\.git#\$\{SERVICE_AGENT_SHA\} \/opt\/service-agent$/m)
  assert.match(text, /npm ci --omit=dev --ignore-scripts/)
  assert.match(stage('extract').text, /COPY --from=agent \/opt\/service-agent \/opt\/service-agent/)
  assert.match(stage('extract').text, /SERVICE_AGENT_CLI=\/opt\/service-agent\/src\/cli\.ts/)
  for (const name of ['api', 'mcp']) assert.doesNotMatch(stage(name).text, /agent/, name)
})

test('CI runs the service-agent contract on the pinned commit beside the repository and in the extract image', () => {
  assert.match(workflow, /git -C \.\.\/service-agent checkout --detach "\$\(sed -n 's\/\^ARG SERVICE_AGENT_SHA=\/\/p' Dockerfile\)"/)
  assert.match(workflow, /npm ci --prefix \.\.\/service-agent --omit=dev/)
  assert.match(workflow, /SERVICE_AGENT_REQUIRED: 'true'/)
  assert.match(workflow, /UV_PROJECT_ENVIRONMENT="\$PWD\/ingest\/\.venv-runtime" uv --directory ingest sync --no-dev --exact --locked/)
  assert.match(workflow, /docker run --rm -e SERVICE_AGENT_REQUIRED=true .* finance-extract node --test test\/import\/service-agent-contract\.test\.ts/)
})

test('the build context is an allow list that never sends secrets, state or local environments', () => {
  assert.equal(ignore[0], '*')
  const allowed = ignore.filter((line) => line.startsWith('!')).map((line) => line.slice(1))
  for (const path of allowed) assert.ok(existsSync(new URL(path, root)), path)
  for (const path of allowed) assert.doesNotMatch(path, /\.env|\.venv|node_modules|\.imports|infra|\.git/, path)
  assert.doesNotMatch(dockerfile, /^(ARG|ENV) .*(PASSWORD|SECRET|TOKEN|KEY)/m)
})

test('CI builds the three images and smoke-tests the API against the extraction service', () => {
  assert.match(workflow, /docker build --target api/)
  assert.match(workflow, /docker build --target mcp/)
  assert.match(workflow, /docker build --target extract/)
  assert.match(workflow, /finance-api sh -c '! command -v uv && test ! -e \/opt\/python && test ! -e ingest && test ! -e agents && test ! -e \/opt\/service-agent'/)
  assert.match(workflow, /-e EXTRACT_KEY -e EXTRACT_URL=http:\/\/127\.0\.0\.1:3300 .*finance-api$/m)
  assert.match(workflow, /curl -sf http:\/\/localhost:3300\/health/)
  assert.match(workflow, /id -u\)" != 0/)
  assert.match(workflow, /curl -sf http:\/\/localhost:3200\/decisoes/)
  assert.match(workflow, /localhost:3200\/api\/nope\)" = 404/)
})
