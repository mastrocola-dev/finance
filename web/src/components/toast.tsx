import { X } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '../lib/utils.ts'

export type Notice = { message: string; tone?: 'error'; action?: { label: string; run: () => void } }

export const Toast = ({ notice, onClose, duration = 6000 }: { notice: Notice | undefined; onClose: () => void; duration?: number }) => {
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [notice, onClose, duration])

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-28 z-20 flex justify-center md:inset-x-auto md:right-10 md:bottom-8">
      {notice && (
        <div className={cn('pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card border bg-surface py-2 pr-2 pl-4', notice.tone === 'error' && 'border-late bg-late-soft text-late')}>
          <span className="flex-1">{notice.message}</span>
          {notice.action && (
            <button
              type="button"
              className="min-h-11 rounded-control px-3 font-semibold text-accent hover:bg-sunken md:min-h-9"
              onClick={() => {
                notice.action?.run()
                onClose()
              }}
            >
              {notice.action.label}
            </button>
          )}
          <button type="button" aria-label="Fechar aviso" className="flex size-11 items-center justify-center rounded-control text-muted hover:bg-sunken md:size-9" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
