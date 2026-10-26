import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { buttonVariants } from '../components/ui/button.tsx'
import { cn } from '../lib/utils.ts'
import { MemberFilter } from './member-filter.tsx'
import { MonthSwitcher } from './month-switcher.tsx'
import type { Screen } from './nav.ts'

export const PageHeader = ({ screen }: { screen: Screen }) => {
  useEffect(() => {
    document.title = `${screen.title} · Caixa`
  }, [screen.title])

  return (
    <header className="flex flex-wrap items-center gap-4">
      <div className="flex w-full flex-col gap-1 md:w-auto">
        {screen.month ? (
          <>
            <span className="hidden text-meta text-muted md:block">{screen.title}</span>
            <MonthSwitcher />
          </>
        ) : (
          <h1 className="m-0 text-title-mobile font-semibold tracking-[-0.02em] md:text-title">{screen.title}</h1>
        )}
      </div>
      <div className={cn('w-full items-center gap-4 md:ml-auto md:flex md:w-auto', screen.members ? 'flex' : 'hidden')}>
        {screen.members && <MemberFilter />}
        {screen.path !== '/lancamentos' && (
          <Link to="/lancamentos" className={cn(buttonVariants(), 'hidden md:inline-flex')}>
            + Lançamento
          </Link>
        )}
      </div>
    </header>
  )
}
