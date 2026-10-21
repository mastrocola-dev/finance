import { useCallback, useMemo, useSyncExternalStore } from 'react'

export const desktop = '(min-width: 768px)'

export const useMediaQuery = (query: string, fallback: boolean) => {
  const list = useMemo(() => globalThis.matchMedia?.(query), [query])
  const subscribe = useCallback(
    (onChange: () => void) => {
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    [list],
  )
  return useSyncExternalStore(subscribe, () => list?.matches ?? fallback)
}
