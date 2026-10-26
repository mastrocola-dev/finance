import { useSearch } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { formatBrl, formatMonth } from '../lib/format.ts'
import { RecordScroll, useRecordHash } from '../lib/record.tsx'
import { firstDay, monthOf } from '../lib/search.ts'
import type { Entry } from '../overview/model.ts'
import { ApiFailure } from '../query/client.ts'
import { useMembers, useSelectedMember } from '../query/shell.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { EntriesList } from './entries-list.tsx'
import { EntriesTable } from './entries-table.tsx'
import { categoriesOf, type Filters, filterEntries, isFiltered, noFilters, totalsOf } from './model.ts'
import { type NewEntry, useCancelEntry, useCorrectEntry, useCreateEntry, useEntries } from './queries.ts'
import { QuickAddForm } from './quick-add-form.tsx'
import { Toolbar } from './toolbar.tsx'

const EntriesSkeleton = () => (
  <div className="flex flex-col gap-3">
    <Skeleton className="h-10" />
    <Skeleton className="h-96 rounded-card" />
  </div>
)

const plural = (count: number) => `${count} ${count === 1 ? 'lançamento' : 'lançamentos'}`

const failure = (error: Error, entry: NewEntry) => (error instanceof ApiFailure && error.status === 401 ? 'Escolha quem você é para lançar.' : `Não foi possível lançar ${entry.description}. Tente de novo.`)

const editFailure = (error: Error, description: string) =>
  error instanceof ApiFailure && error.status === 401 ? 'Escolha quem você é para corrigir.' : error instanceof ApiFailure && error.status === 422 ? `${description} já foi corrigido ou cancelado. A lista foi atualizada.` : `Não foi possível alterar ${description}. Tente de novo.`

const Entries = ({ entries, fresh, onEdit }: { entries: Entry[]; fresh: string | undefined; onEdit: (entry: Entry) => void }) => {
  const [filters, setFilters] = useState<Filters>(noFilters)
  const hash = useRecordHash()
  const shown = filterEntries(entries, filters)
  const totals = totalsOf(shown)
  return (
    <>
      <Toolbar filters={filters} categories={categoriesOf(entries)} onChange={setFilters} />
      <section aria-label="Lista de lançamentos" className="overflow-x-auto rounded-card border bg-surface">
        {shown.length > 0 ? (
          <>
            <EntriesTable entries={shown} fresh={fresh} hash={hash} onEdit={onEdit} />
            <EntriesList entries={shown} fresh={fresh} hash={hash} onEdit={onEdit} />
            <RecordScroll />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="m-0 text-muted">Nenhum lançamento com esses filtros.</p>
            <Button variant="outline" onClick={() => setFilters(noFilters)}>
              Limpar filtros
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 text-meta text-muted">
          <span aria-live="polite">{isFiltered(filters) ? `Mostrando ${shown.length} de ${entries.length}` : plural(entries.length)}</span>
          <span className="md:ml-auto">
            Receitas <strong className="amount font-medium text-income">{formatBrl(totals.income)}</strong>
          </span>
          <span>
            Despesas <strong className="amount font-medium text-text">{formatBrl(totals.expense)}</strong>
          </span>
        </div>
      </section>
    </>
  )
}

export const EntriesPage = () => {
  const month = monthOf(useSearch({ from: '__root__' }))
  const member = useSelectedMember()
  const loadingMembers = useMembers().isPending
  const entries = useEntries(month, member, !loadingMembers)
  const create = useCreateEntry()
  const correct = useCorrectEntry()
  const cancel = useCancelEntry()
  const [chosen, setEditing] = useState<Entry>()
  const editing = chosen?.competence.startsWith(month) ? chosen : undefined
  const [fresh, setFresh] = useState<string>()
  const [notice, setNotice] = useState<Notice>()
  const close = useCallback(() => setNotice(undefined), [])
  const add = (entry: NewEntry, reset: () => void) => {
    if (create.isPending) return
    create.mutate(entry, {
      onSuccess: (created) => {
        setFresh(created.id)
        setNotice({ message: `Lançado: ${created.description}` })
        reset()
      },
      onError: (error) => setNotice({ tone: 'error', message: failure(error, entry) }),
    })
  }
  const pending = create.isPending || correct.isPending || cancel.isPending
  const save = (entry: Entry) => (body: NewEntry) =>
    correct.mutate(
      { id: entry.id, body },
      {
        onSuccess: (replaced) => {
          setEditing(undefined)
          setFresh(replaced.id)
          setNotice({ message: `Corrigido: ${replaced.description}` })
        },
        onError: (error) => setNotice({ tone: 'error', message: editFailure(error, entry.description) }),
      },
    )
  const drop = (entry: Entry) => () => {
    if (!window.confirm(`Cancelar ${entry.description}? Ele sai da lista, mas fica no histórico.`)) return
    cancel.mutate(entry.id, {
      onSuccess: () => {
        setEditing(undefined)
        setNotice({ message: `Cancelado: ${entry.description}` })
      },
      onError: (error) => setNotice({ tone: 'error', message: editFailure(error, entry.description) }),
    })
  }
  const edit = (entry: Entry) => {
    setEditing(entry)
    window.scrollTo?.({ top: 0 })
  }
  return (
    <>
      <PageHeader screen={screenOf('/lancamentos')} />
      {!loadingMembers &&
        (editing ? (
          <QuickAddForm key={`edit:${editing.id}`} month={month} member={member} pending={pending} editing={{ entry: editing, onCancelEntry: drop(editing), onClose: () => setEditing(undefined) }} onSubmit={save(editing)} />
        ) : (
          <QuickAddForm key={`${month}:${member ?? 'all'}`} month={month} member={member} pending={pending} onSubmit={add} />
        ))}
      <QueryView query={entries} skeleton={<EntriesSkeleton />} isEmpty={(data) => data.length === 0} empty={<EmptyState title={`Nenhum lançamento em ${formatMonth(firstDay(month))}`}>Receitas e despesas do mês aparecem aqui assim que forem lançadas ou previstas.</EmptyState>}>
        {(data) => <Entries key={`${month}:${member ?? 'all'}`} entries={data} fresh={fresh} onEdit={edit} />}
      </QueryView>
      <Toast notice={notice} onClose={close} />
    </>
  )
}
