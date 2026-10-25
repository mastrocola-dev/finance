import { Link } from '@tanstack/react-router'
import { Ellipsis } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { ThemeSwitch } from '../theme/theme-switch.tsx'
import { screens } from './nav.ts'

const extras = screens.filter(({ tab }) => !tab)

export const MoreMenu = () => {
  const id = useId()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', dismiss)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <Button ref={toggle} variant="ghost" size="icon" className="aria-expanded:bg-sunken" aria-label="Mais" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
        <Ellipsis aria-hidden="true" className="size-5" />
      </Button>
      {open && (
        <div id={id} className="absolute top-full right-0 z-20 mt-2 flex w-60 flex-col gap-3 rounded-card border bg-surface p-3">
          <nav aria-label="Mais telas" className="flex flex-col gap-1">
            {extras.map(({ path, title }) => (
              <Link key={path} to={path} activeOptions={{ exact: path === '/' }} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-control px-2.5 text-text data-[status=active]:bg-accent-soft data-[status=active]:font-semibold data-[status=active]:text-accent">
                {title}
              </Link>
            ))}
          </nav>
          <div className="border-t pt-3">
            <ThemeSwitch />
          </div>
        </div>
      )}
    </div>
  )
}
