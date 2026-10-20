import { formatBrl } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import { Card } from './card.tsx'
import { change, type CategorySpend as Spend } from './model.ts'

const signed = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' })

const delta = ({ cents, previous }: Spend) => {
  const value = change(cents, previous)
  return value === undefined ? 'novo' : `${signed.format(value).replace('-', '−')}%`
}

export const CategorySpend = ({ items, previousLabel }: { items: Spend[]; previousLabel: string }) => (
  <Card
    id="cat-title"
    title={
      <>
        <span className="md:hidden">Onde foi o dinheiro</span>
        <span className="hidden md:inline">Gastos por categoria</span>
      </>
    }
    aside={`vs. ${previousLabel}`}
    className="flex-[2_1_520px]"
  >
    {items.length === 0 ? (
      <p className="m-0 py-2 text-muted">Nenhuma despesa neste mês.</p>
    ) : (
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {items.map((item) => {
          const value = change(item.cents, item.previous)
          return (
            <li key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto_56px] items-center gap-x-3 gap-y-1.5 md:grid-cols-[120px_minmax(0,1fr)_110px_64px]">
              <span className="truncate">{item.name}</span>
              <div className="col-span-3 row-start-2 h-1.5 overflow-hidden rounded-full bg-sunken md:col-span-1 md:row-start-auto md:h-2">
                <div className="h-full rounded-full bg-expense" style={{ width: `${item.share}%` }} />
              </div>
              <span className="amount text-right">{formatBrl(item.cents)}</span>
              <span className={cn('text-right text-xs text-muted tabular-nums', value !== undefined && value > 0 && 'text-late')}>{delta(item)}</span>
            </li>
          )
        })}
      </ul>
    )}
  </Card>
)
