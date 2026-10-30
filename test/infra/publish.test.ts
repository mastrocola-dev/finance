import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const workflow = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8')
const dockerfile = readFileSync(new URL('Dockerfile', root), 'utf8')
const script = fileURLToPath(new URL('scripts/pin-bases.sh', root))

const jobs: Record<string, string> = Object.fromEntries(
  workflow
    .slice(workflow.indexOf('\njobs:\n'))
    .split(/^(?= {2}[\w-]+:$)/m)
    .slice(1)
    .map((text) => [text.trim().split(':')[0], text]),
)

const job = (name: string) => {
  const found = jobs[name]
  assert.ok(found, name)
  return found
}

const step = (name: string, title: string) => {
  const found = job(name)
    .split(/^(?= {6}- )/m)
    .find((text) => text.includes(`name: ${title}\n`))
  assert.ok(found, `${name} ${title}`)
  return found
}

test('jobs run test, then images; infra stands alone', () => {
  assert.deepEqual(Object.keys(jobs), ['test', 'images', 'infra'])
  assert.match(job('images'), /^ {4}needs: test$/m)
  assert.doesNotMatch(job('test'), /needs:/)
  assert.doesNotMatch(job('infra'), /needs:/)
})

test('only the images job may write packages', () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n\n/m)
  assert.match(job('images'), /^ {4}permissions:\n {6}contents: read\n {6}packages: write$/m)
  assert.doesNotMatch(job('test'), /packages/)
  assert.doesNotMatch(job('infra'), /packages/)
})

test('images are tagged with the commit and pushed to GHCR only on pushes to poc, after the smoke test', () => {
  assert.match(job('images'), /API_IMAGE: ghcr\.io\/mastrocola-dev\/finance-api:\$\{\{ github\.sha \}\}/)
  assert.match(job('images'), /MCP_IMAGE: ghcr\.io\/mastrocola-dev\/finance-mcp:\$\{\{ github\.sha \}\}/)
  assert.doesNotMatch(workflow, /:latest/)
  assert.match(step('images', 'Build'), /docker build --target api -t finance-api -t "\$API_IMAGE" \./)
  assert.match(step('images', 'Build'), /docker build --target mcp -t finance-mcp -t "\$MCP_IMAGE" \./)
  const publish = step('images', 'Publish')
  assert.match(publish, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/poc'/)
  assert.match(publish, /docker login ghcr\.io -u "\$GITHUB_ACTOR" --password-stdin/)
  assert.match(publish, /docker push "\$API_IMAGE"\n\s+docker push "\$MCP_IMAGE"/)
  assert.doesNotMatch(publish, /run: \|[\s\S]*\$\{\{/)
  assert.ok(job('images').indexOf('name: Smoke') < job('images').indexOf('name: Publish'))
})

test('the images link back to this repository', () => {
  assert.match(dockerfile, /^FROM node:24-slim\S* AS base\nLABEL org\.opencontainers\.image\.source=https:\/\/github\.com\/mastrocola-dev\/finance$/m)
})

test('pin-bases rewrites every external base to its digest and leaves stages and pinned bases alone', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pin-'))
  const node = `sha256:${'a'.repeat(64)}`
  const uv = `sha256:${'b'.repeat(64)}`
  const fake = join(folder, 'docker')
  writeFileSync(fake, ['#!/usr/bin/env bash', `[ "$1" = pull ] && { echo "$@" >> "${folder}/pulls"; exit 0; }`, `case "\${@: -1}" in node:24-slim) echo node@${node} ;; ghcr.io/astral-sh/uv:*) echo ghcr.io/astral-sh/uv@${uv} ;; esac`].join('\n'))
  chmodSync(fake, 0o755)
  const file = join(folder, 'Dockerfile')
  copyFileSync(new URL('Dockerfile', root), file)
  const env = { ...process.env, PATH: `${folder}:${process.env.PATH}` }
  execFileSync(script, [file], { env })
  const pinned = readFileSync(file, 'utf8')
  const froms = pinned.match(/^FROM .+$/gm) ?? []
  for (const line of froms.filter((text) => text.includes('node:24-slim'))) assert.ok(line.includes(`node:24-slim@${node} AS`), line)
  assert.match(pinned, new RegExp(`^FROM ghcr\\.io/astral-sh/uv:[\\d.]+@${uv} AS uv$`, 'm'))
  assert.match(pinned, /^FROM base AS api$/m)
  assert.equal(pinned.replaceAll(`@${node}`, '').replaceAll(`@${uv}`, ''), dockerfile.replace(/@sha256:[0-9a-f]{64}/g, ''))
  execFileSync(script, [file], { env })
  assert.equal(readFileSync(file, 'utf8'), pinned)
  assert.equal(readFileSync(join(folder, 'pulls'), 'utf8').trim().split('\n').length, 2)
})

test('pin-bases fails when a registry gives no digest', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pin-'))
  writeFileSync(join(folder, 'docker'), '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(join(folder, 'docker'), 0o755)
  const file = join(folder, 'Dockerfile')
  copyFileSync(new URL('Dockerfile', root), file)
  assert.throws(() => execFileSync(script, [file], { env: { ...process.env, PATH: `${folder}:${process.env.PATH}` }, stdio: 'pipe' }))
})
