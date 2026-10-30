import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

export type Site = (request: Request) => Promise<Response | undefined>

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

export const immutable = 'public, max-age=31536000, immutable'
export const revalidate = 'no-cache'

const decoded = (pathname: string) => {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return undefined
  }
}

const fileIn = async (base: string, pathname: string) => {
  const path = decoded(pathname)
  if (path === undefined || path.includes('\0')) return undefined
  const full = await realpath(resolve(base, `.${path}`)).catch(() => '')
  if (!full.startsWith(base + sep)) return undefined
  const info = await stat(full).catch(() => undefined)
  return info?.isFile() ? { full, info } : undefined
}

const served = async (request: Request, { full, info }: { full: string; info: { size: number; mtimeMs: number } }, cache: string) => {
  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
  const headers = { 'content-type': types[extname(full)] ?? 'application/octet-stream', 'cache-control': cache, etag, 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin' }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return new Response(request.method === 'HEAD' ? null : await readFile(full), { headers: { ...headers, 'content-length': String(info.size) } })
}

export const site = (root: string | undefined): Site | undefined => {
  if (!root) return undefined
  const real = realpath(resolve(root)).catch(() => resolve(root))
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return undefined
    const base = await real
    const { pathname } = new URL(request.url)
    const file = await fileIn(base, pathname)
    if (file) return served(request, file, pathname.startsWith('/assets/') ? immutable : revalidate)
    if (extname(pathname)) return undefined
    const index = await fileIn(base, '/index.html')
    return index && served(request, index, revalidate)
  }
}
