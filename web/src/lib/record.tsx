import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

export const useRecordHash = () => useLocation({ select: ({ hash }) => hash })

export const recordProps = (record: string, hash: string) => ({ 'data-record': record, ...(record === hash && { 'aria-current': true as const }) })

export const RecordScroll = () => {
  const hash = useRecordHash()
  useEffect(() => {
    if (!hash) return
    const target = [...document.querySelectorAll(`[data-record="${CSS.escape(hash)}"]`)].find((element) => element.getClientRects().length > 0)
    target?.scrollIntoView({ block: 'center' })
  }, [hash])
  return null
}
