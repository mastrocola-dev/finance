import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { formatBrl, today } from '../lib/format.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { DebtCard } from './debt-card.tsx'
import { debtView, formatSignedBrl, monthlyInstallments, savings } from './model.ts'
import { useDebts, useNetWorth, useSavings } from './queries.ts'
import { SavingCard } from './saving-card.tsx'

const CardsSkeleton = ({ height }: { height: string }) => (
  <div className="flex flex-col gap-2.5">
    {['a', 'b'].map((key) => (
      <Skeleton key={key} className={`${height} rounded-card`} />
    ))}
  </div>
)

const NetWorth = () => {
  const worth = useNetWorth()
  return (
    <div className="text-meta text-muted" aria-busy={worth.isPending || undefined}>
      Patrimônio líquido estimado {worth.isSuccess ? <strong className="amount font-medium text-text">{formatSignedBrl(BigInt(worth.data.netWorth.cents))}</strong> : worth.isError ? 'indisponível' : <Skeleton className="inline-block h-4 w-28 align-middle" />}
    </div>
  )
}

const Debts = () => {
  const debts = useDebts()
  return (
    <section aria-labelledby="debts" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline">
        <h2 id="debts" className="m-0 text-section font-semibold">
          Dívidas
        </h2>
        {debts.isSuccess && debts.data.length > 0 && <span className="amount ml-auto text-meta text-muted">{formatBrl(monthlyInstallments(debts.data))}/mês</span>}
      </div>
      <QueryView query={debts} skeleton={<CardsSkeleton height="h-24" />} isEmpty={(data) => data.length === 0} empty={<EmptyState title="Nenhuma dívida ativa">Financiamentos e empréstimos aparecem aqui com as parcelas pagas e a próxima.</EmptyState>}>
        {(data) => data.map((debt) => <DebtCard key={debt.id} debt={debtView(debt)} />)}
      </QueryView>
    </section>
  )
}

const Savings = () => {
  const query = useSavings()
  return (
    <section aria-labelledby="savings" className="flex min-w-0 flex-col gap-2.5">
      <h2 id="savings" className="m-0 text-section font-semibold">
        Reservas e metas
      </h2>
      <QueryView query={query} skeleton={<CardsSkeleton height="h-23" />} isEmpty={(data) => data.reserves.length + data.goals.length === 0} empty={<EmptyState title="Nenhuma reserva ou meta">Reservas e metas aparecem aqui com o progresso até o alvo.</EmptyState>}>
        {(data) => savings(data.reserves, data.goals, today()).map((saving) => <SavingCard key={saving.id} saving={saving} />)}
      </QueryView>
    </section>
  )
}

export const WorthPage = () => (
  <>
    <div className="flex flex-col gap-1">
      <PageHeader screen={screenOf('/patrimonio')} />
      <NetWorth />
    </div>
    <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-2 lg:items-start">
      <Debts />
      <Savings />
    </div>
  </>
)
