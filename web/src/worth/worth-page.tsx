import { useCallback, useRef, useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { useIdentity } from '../identity/identity-provider.tsx'
import { formatBrl, today } from '../lib/format.ts'
import { RecordScroll, useRecordHash } from '../lib/record.tsx'
import { ApiFailure } from '../query/client.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { DebtCard } from './debt-card.tsx'
import { goalFailure, type NewGoal } from './goal.ts'
import { GoalForm } from './goal-form.tsx'
import { debtView, formatSignedBrl, monthlyInstallments, savings } from './model.ts'
import { useCreateGoal, useDebts, useNetWorth, useSavings } from './queries.ts'
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
  const hash = useRecordHash()
  return (
    <section aria-labelledby="debts" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline">
        <h2 id="debts" className="m-0 text-section font-semibold">
          Dívidas
        </h2>
        {debts.isSuccess && debts.data.length > 0 && <span className="amount ml-auto text-meta text-muted">{formatBrl(monthlyInstallments(debts.data))}/mês</span>}
      </div>
      <QueryView query={debts} skeleton={<CardsSkeleton height="h-24" />} isEmpty={(data) => data.length === 0} empty={<EmptyState title="Nenhuma dívida ativa">Financiamentos e empréstimos aparecem aqui com as parcelas pagas e a próxima.</EmptyState>}>
        {(data) => (
          <>
            {data.map((debt) => (
              <DebtCard key={debt.id} debt={debtView(debt)} hash={hash} />
            ))}
            <RecordScroll />
          </>
        )}
      </QueryView>
    </section>
  )
}

const AddGoal = ({ reserves }: { reserves: string[] }) => {
  const { member } = useIdentity()
  const create = useCreateGoal()
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [notice, setNotice] = useState<Notice>()
  const opener = useRef<HTMLButtonElement>(null)
  const dismiss = useCallback(() => setNotice(undefined), [])
  const close = () => {
    setOpen(false)
    setFailure(undefined)
    requestAnimationFrame(() => opener.current?.focus())
  }
  const submit = (goal: NewGoal) => {
    if (create.isPending) return
    setFailure(undefined)
    create.mutate(goal, {
      onSuccess: (created) => {
        close()
        setNotice({ message: `Meta criada: ${created.name}` })
      },
      onError: (error) => setFailure(goalFailure(error instanceof ApiFailure ? error.status : undefined, error.message, goal.name)),
    })
  }
  return (
    <>
      {open ? (
        <GoalForm thisMonth={today().slice(0, 7)} reserves={reserves} member={member} pending={create.isPending} failure={failure} onSubmit={submit} onCancel={close} />
      ) : (
        <button ref={opener} type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-field border border-dashed bg-transparent font-medium text-accent">
          + Nova meta
        </button>
      )}
      <Toast notice={notice} onClose={dismiss} />
    </>
  )
}

const Savings = () => {
  const query = useSavings()
  const hash = useRecordHash()
  return (
    <section aria-labelledby="savings" className="flex min-w-0 flex-col gap-2.5">
      <h2 id="savings" className="m-0 text-section font-semibold">
        Reservas e metas
      </h2>
      <QueryView query={query} skeleton={<CardsSkeleton height="h-23" />} isEmpty={(data) => data.reserves.length + data.goals.length === 0} empty={<EmptyState title="Nenhuma reserva ou meta">Reservas e metas aparecem aqui com o progresso até o alvo.</EmptyState>}>
        {(data) => (
          <>
            {savings(data.reserves, data.goals, today()).map((saving) => (
              <SavingCard key={saving.id} saving={saving} hash={hash} />
            ))}
            <RecordScroll />
          </>
        )}
      </QueryView>
      <AddGoal reserves={(query.data?.reserves ?? []).map(({ name }) => name)} />
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
