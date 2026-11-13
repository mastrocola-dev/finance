import { useCallback, useState } from 'react'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { type Notice, Toast } from '../components/toast.tsx'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { useSetup } from './queries.ts'
import { RecordList } from './record-list.tsx'

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
      <QueryView query={setup} skeleton={<SetupSkeleton />}>
        {(records) => <RecordList records={records} notify={setNotice} />}
      </QueryView>
      <Toast notice={notice} onClose={dismiss} />
    </>
  )
}
