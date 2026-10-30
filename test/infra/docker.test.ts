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
  for (const { from } of stages) assert.match(from, /^(node:24-slim|ghcr\.io\/astral-sh\/uv:\d+\.\d+\.\d+|modules|ingest|base|uv)$/)
  assert.equal(stage('base').from, 'node:24-slim')
})

test('api and mcp run as a non-root user with an existing entry point', () => {
  for (const [name, entry, port] of [
    ['api', 'src/http/api.ts', '3200'],
    ['mcp', 'src/mcp/http.ts', '3100'],
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
  assert.match(stage('api').text, /UV_OFFLINE=1/)
  assert.doesNotMatch(stage('mcp').text, /ingest|uv/)
})

test('the api image carries the web built for the entra sign-in and serves it from WEB_ROOT', () => {
  assert.match(stage('web').text, /npm ci --workspace web/)
  assert.match(stage('web').text, /VITE_AUTH_MODE=entra npm run build -w web/)
  assert.match(stage('api').text, /COPY --from=web \/app\/web\/dist web\/dist/)
  assert.match(stage('api').text, /WEB_ROOT=\/app\/web\/dist/)
  assert.doesNotMatch(stage('mcp').text, /web/)
  assert.doesNotMatch(stage('modules').text, /web\/src/)
})

test('the build context is an allow list that never sends secrets, state or local environments', () => {
  assert.equal(ignore[0], '*')
  const allowed = ignore.filter((line) => line.startsWith('!')).map((line) => line.slice(1))
  for (const path of allowed) assert.ok(existsSync(new URL(path, root)), path)
  for (const path of allowed) assert.doesNotMatch(path, /\.env|\.venv|node_modules|\.imports|infra|\.git/, path)
  assert.doesNotMatch(dockerfile, /^(ARG|ENV) .*(PASSWORD|SECRET|TOKEN|KEY)/m)
})

test('CI builds both images and smoke-tests them', () => {
  assert.match(workflow, /docker build --target api/)
  assert.match(workflow, /docker build --target mcp/)
  assert.match(workflow, /id -u\)" != 0/)
  assert.match(workflow, /curl -sf http:\/\/localhost:3200\/decisoes/)
  assert.match(workflow, /localhost:3200\/api\/nope\)" = 404/)
})
