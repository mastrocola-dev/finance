import { useEffect, useState } from 'react'
import { applyTheme, readTheme, storeTheme, type Theme, watchSystemTheme } from './theme.ts'

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)
    if (theme === 'system') return watchSystemTheme(() => applyTheme('system'))
  }, [theme])

  const choose = (next: Theme) => {
    storeTheme(next)
    setTheme(next)
  }

  return [theme, choose] as const
}
