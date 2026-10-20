import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { screenOf, tabs } from './nav.ts'

export const TabBar = () => (
  <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 items-center border-t bg-surface px-2 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
    {tabs.map((path) => {
      const { tab } = screenOf(path)
      if (!tab)
        return (
          <Link key={path} to={path} aria-label="Novo lançamento" className="flex min-h-12 items-center justify-center">
            <span className="flex size-[52px] items-center justify-center rounded-hero bg-accent text-accent-text">
              <Plus aria-hidden="true" className="size-6" strokeWidth={2.2} />
            </span>
          </Link>
        )
      return (
        <Link key={path} to={path} activeOptions={{ exact: true }} className="flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] text-muted data-[status=active]:font-semibold data-[status=active]:text-accent">
          <tab.Icon aria-hidden="true" className="size-[22px]" strokeWidth={1.8} />
          <span>{tab.label}</span>
        </Link>
      )
    })}
  </nav>
)
