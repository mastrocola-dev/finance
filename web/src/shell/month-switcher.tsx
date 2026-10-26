import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthTitle } from '../lib/format.ts'
import { type AppSearch, firstDay, monthOf, shiftMonth } from '../lib/search.ts'

const arrow = 'flex size-11 shrink-0 items-center justify-center rounded-field border bg-surface text-text md:size-9 md:rounded-control'

export const MonthSwitcher = () => {
  const search = useSearch({ from: '__root__' })
  const month = monthOf(search)
  const navigate = useNavigate()
  const go = (by: number) => navigate({ to: '.', search: (previous: AppSearch) => ({ ...previous, month: shiftMonth(month, by) }) })

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <button type="button" onClick={() => go(-1)} aria-label="Mês anterior" className={arrow}>
        <ChevronLeft aria-hidden="true" className="size-4" />
      </button>
      <h1 className="m-0 flex-1 text-center text-title-mobile font-semibold tracking-[-0.02em] md:flex-none md:text-title">{formatMonthTitle(firstDay(month))}</h1>
      <button type="button" onClick={() => go(1)} aria-label="Próximo mês" className={arrow}>
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
