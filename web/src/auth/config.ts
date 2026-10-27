export type EntraConfig = { mode: 'entra'; clientId: string; authority: string; scope: string }

export type AuthConfig = { mode: 'local' } | EntraConfig

const required = ['VITE_ENTRA_CLIENT_ID', 'VITE_ENTRA_AUTHORITY', 'VITE_ENTRA_SCOPE'] as const

export const authConfigOf = (env: Record<string, string | undefined>): AuthConfig => {
  const mode = env.VITE_AUTH_MODE || 'local'
  if (mode === 'local') return { mode }
  if (mode !== 'entra') throw new Error(`unknown VITE_AUTH_MODE ${mode}`)
  const missing = required.filter((name) => !env[name]?.trim())
  if (missing.length) throw new Error(`VITE_AUTH_MODE=entra needs ${missing.join(', ')}`)
  return { mode, clientId: String(env.VITE_ENTRA_CLIENT_ID).trim(), authority: String(env.VITE_ENTRA_AUTHORITY).trim(), scope: String(env.VITE_ENTRA_SCOPE).trim() }
}
