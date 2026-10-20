import { Button } from './components/ui/button.tsx'
import { currentMonth, formatBrl, formatMonthTitle } from './lib/format.ts'
import { ThemeSwitch } from './theme/theme-switch.tsx'

const chips = [
  { label: 'Paga', className: 'bg-ok-soft text-ok' },
  { label: 'Pendente', className: 'bg-pending-soft text-pending' },
  { label: 'Atrasada', className: 'bg-late-soft text-late' },
  { label: 'via Claude', className: 'bg-claude-soft text-claude' },
]

export const App = () => (
  <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
    <header className="flex flex-wrap items-center gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-meta text-muted">{formatMonthTitle(currentMonth())}</span>
        <h1 className="m-0 text-title-mobile font-semibold tracking-[-0.02em] md:text-title">Finanças</h1>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <ThemeSwitch />
        <Button>+ Lançamento</Button>
      </div>
    </header>
    <section aria-label="Indicadores" className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
      <div className="flex flex-col gap-2 rounded-card border bg-surface px-5 py-[18px]">
        <span className="text-meta text-muted">Recebido</span>
        <span className="amount text-kpi font-medium text-income">{formatBrl('2220000')}</span>
      </div>
      <div className="flex flex-col gap-2 rounded-card border bg-surface px-5 py-[18px]">
        <span className="text-meta text-muted">Pago</span>
        <span className="amount text-kpi font-medium">{formatBrl('1120490')}</span>
      </div>
    </section>
    <ul aria-label="Estados" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {chips.map((chip) => (
        <li key={chip.label} className={`rounded-full px-2.5 py-0.5 text-meta font-medium ${chip.className}`}>
          {chip.label}
        </li>
      ))}
    </ul>
  </main>
)
