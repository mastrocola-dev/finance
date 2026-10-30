export type AuthConfig = { mode: 'local' | 'entra' }

export const authConfigOf = (env: Record<string, string | undefined>): AuthConfig => {
  const mode = env.VITE_AUTH_MODE || 'local'
  if (mode !== 'local' && mode !== 'entra') throw new Error(`unknown VITE_AUTH_MODE ${mode}`)
  return { mode }
}
