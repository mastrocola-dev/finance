import { useMutationState } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { formatBrl, formatMonth } from '../lib/format.ts'
import { firstDay, monthOf } from '../lib/search.ts'
import type { Entry } from '../overview/model.ts'
import { ApiFailure } from '../query/client.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { BillRow } from './bill-row.tsx'
import { billsOf, progressOf, stableOrder } from './model.ts'
import { type Payment, useBills, usePayment } from './queries.ts'

const BillsSkeleton = () => (
  <div className="flex flex-col gap-3">
    <Skeleton className="h-10" />
    {['a', 'b', 'c', 'd', 'e', 'f'].map((key) => (
      <Skeleton key={key} className="h-15 rounded-field" />
    ))}
  </div>
)

const failure = (error: Error, { bill, paid }: Payment) => (error instanceof ApiFailure && error.status === 401 ? 'Escolha quem você é para marcar contas.' : `Não foi possível ${paid ? 'marcar' : 'desmarcar'} ${bill.description}. Tente de novo.`)

const BillsList = ({ entries, toggle }: { entries: Entry[]; toggle: (bill: Entry) => void }) => {
  const bills = billsOf(entries)
  const [order, setOrder] = useState<string[]>([])
  const ids = stableOrder(order, bills)
  if (ids !== order) setOrder(ids)
  const byId = new Map(bills.map((bill) => [bill.id, bill]))
  const progress = progressOf(bills)
  return (
    <section aria-label="Contas" className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex text-meta">
          <span>
            {progress.paidCount} de {progress.count} pagas
          </span>
          <span className="amount ml-auto text-muted">{progress.open > 0n ? `falta ${formatBrl(progress.open)}` : 'tudo pago'}</span>
        </div>
        <div role="img" aria-label={`${progress.percent}% das contas pagas`} className="h-2 overflow-hidden rounded-full bg-sunken">
          <div className="h-full bg-ok" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {ids.map((id) => {
          const bill = byId.get(id)
          return bill && <BillRow key={id} bill={bill} onToggle={() => toggle(bill)} />
        })}
      </ul>
    </section>
  )
}

export const BillsPage = () => {
  const month = monthOf(useSearch({ from: '__root__' }))
  const bills = useBills(month)
  const [notice, setNotice] = useState<Notice>()
  const close = useCallback(() => setNotice(undefined), [])
  const payment = usePayment(month, {
    onSuccess: ({ bill, paid }) => setNotice({ message: `${bill.description} ${paid ? 'marcada como paga' : 'voltou para em aberto'}`, action: { label: 'Desfazer', run: () => payment.mutate({ bill, paid: !paid }) } }),
    onError: (error, input) => setNotice({ tone: 'error', message: failure(error, input) }),
  })

  const busy = useMutationState({ filters: { mutationKey: ['payment'], status: 'pending' }, select: (mutation) => (mutation.state.variables as Payment).bill.id })
  const toggle = (bill: Entry) => {
    if (!busy.includes(bill.id)) payment.mutate({ bill, paid: bill.state !== 'paid' })
  }

  return (
    <>
      <PageHeader screen={screenOf('/contas')} />
      <QueryView query={bills} skeleton={<BillsSkeleton />} isEmpty={(data) => billsOf(data).length === 0} empty={<EmptyState title={`Nenhuma conta em ${formatMonth(firstDay(month))}`}>As despesas planejadas e pagas do mês aparecem aqui para marcar como pagas.</EmptyState>}>
        {(data) => <BillsList entries={data} toggle={toggle} />}
      </QueryView>
      <Toast notice={notice} onClose={close} />
    </>
  )
}
