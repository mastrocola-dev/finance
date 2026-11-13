import type { Notice } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { ApiFailure } from '../query/client.ts'
import { useStarterCategories } from './queries.ts'

const failure = (error: Error) => (error instanceof ApiFailure && error.status === 401 ? 'Escolha quem você é para criar as categorias.' : 'Não foi possível criar as categorias. Tente de novo.')

export const StarterCategories = ({ notify }: { notify: (notice: Notice) => void }) => {
  const starter = useStarterCategories()
  const create = () =>
    starter.mutate(undefined, {
      onSuccess: (created) => notify({ message: created.length === 1 ? 'Criada 1 categoria' : `Criadas ${created.length} categorias` }),
      onError: (error) => notify({ tone: 'error', message: failure(error) }),
    })
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-4 md:px-6">
      <p className="m-0 text-meta text-muted">Nenhuma categoria ainda. Comece pelas mais comuns da casa e renomeie ou encerre o que não servir.</p>
      <Button disabled={starter.isPending} aria-busy={starter.isPending} onClick={create}>
        Criar categorias sugeridas
      </Button>
    </div>
  )
}
