export const themes = ['system', 'light', 'dark'] as const

export type Theme = (typeof themes)[number]

const key = 'finance.theme'

const isTheme = (value: unknown): value is Theme => themes.includes(value as Theme)

export const readTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(key)
    return isTheme(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export const storeTheme = (theme: Theme) => {
  try {
    if (theme === 'system') localStorage.removeItem(key)
    else localStorage.setItem(key, theme)
  } catch {}
}

const darkQuery = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)')

export const isDark = (theme: Theme) => theme === 'dark' || (theme === 'system' && Boolean(darkQuery()?.matches))

export const applyTheme = (theme: Theme, root = document.documentElement) => {
  root.classList.toggle('dark', isDark(theme))
}

export const watchSystemTheme = (onChange: () => void) => {
  const query = darkQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}
