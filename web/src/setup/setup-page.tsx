import { useCallback, useState } from 'react'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { CandidateForm, useNames } from '../imports/candidate-form.tsx'
import { type Errors, serverErrors } from '../imports/edit-model.ts'
import { ApiFailure } from '../query/client.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { registerFailure, type SetupKind, setupLabels, setupOrder } from './model.ts'
import { useRegister, useSetup } from './queries.ts'
import { RecordList } from './record-list.tsx'

const field = 'min-h-11 w-full rounded-control border bg-bg px-3 text-body text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-soft md:min-h-10'

const NewRecord = ({ notify }: { notify: (notice: Notice) => void }) => {
  const [kind, setKind] = useState<SetupKind>('recurring_expense')
  const [round, setRound] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const register = useRegister()
  const names = useNames([])
  const choose = (next: SetupKind) => {
    setKind(next)
    setErrors({})
  }
  const save = (payload: Record<string, unknown>) =>
    register.mutate(
      { kind, payload },
      {
        onSuccess: (created) => {
          setErrors({})
          setRound((value) => value + 1)
          notify({ message: `Cadastrado: ${created.name}` })
        },
        onError: (error) => setErrors(error instanceof ApiFailure && error.message.startsWith('invalid ') ? serverErrors(kind, error.message) : { form: registerFailure(error) }),
      },
    )
  return (
    <section aria-labelledby="new-record" className="flex flex-col gap-3 rounded-card border bg-surface p-4 md:p-6">
      <h2 id="new-record" className="m-0 text-section font-semibold">
        Novo cadastro
      </h2>
      <div className="flex max-w-xs flex-col gap-1.5">
        <label htmlFor="setup-kind" className="text-xs text-muted">
          O que cadastrar
        </label>
        <select id="setup-kind" className={field} value={kind} onChange={(event) => choose(event.target.value as SetupKind)}>
          {setupOrder.map((option) => (
            <option key={option} value={option}>
              {setupLabels[option].one}
            </option>
          ))}
        </select>
      </div>
      <CandidateForm
        key={`${kind}:${round}`}
        candidate={{ id: `new-${kind}`, kind, payload: {} }}
        title={setupLabels[kind].one}
        label={`Cadastrar ${setupLabels[kind].one.toLowerCase()}`}
        saveLabel="Cadastrar"
        names={names}
        busy={register.isPending}
        serverErrors={errors}
        onSave={save}
        onCancel={() => {
          setErrors({})
          setRound((value) => value + 1)
        }}
      />
    </section>
  )
}

const SetupSkeleton = () => (
  <div className="flex flex-col gap-3">
    <Skeleton className="h-40 rounded-card" />
    <Skeleton className="h-40 rounded-card" />
  </div>
)

export const SetupPage = () => {
  const setup = useSetup()
  const [notice, setNotice] = useState<Notice>()
  const dismiss = useCallback(() => setNotice(undefined), [])
  return (
    <>
      <div className="flex flex-col gap-1">
        <PageHeader screen={screenOf('/cadastros')} />
        <p className="m-0 text-meta text-muted">Contas, categorias, receitas e despesas fixas, dívidas, reservas e metas da casa. Encerrar tira da lista, mas o histórico fica.</p>
      </div>
      <NewRecord notify={setNotice} />
      <QueryView query={setup} skeleton={<SetupSkeleton />}>
        {(records) => <RecordList records={records} notify={setNotice} />}
      </QueryView>
      <Toast notice={notice} onClose={dismiss} />
    </>
  )
}
