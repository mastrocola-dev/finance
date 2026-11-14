import { Plus } from 'lucide-react'
import type { Notice } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { useCategories } from '../entries/queries.ts'
import { findCategory, registerFailure } from './model.ts'
import { useRegister } from './queries.ts'
import { StarterButton } from './starter-categories.tsx'

type Props = { name: string; direction: 'income' | 'expense'; notify: (notice: Notice) => void; onCreated: (name: string) => void }

export const CategoryHelp = ({ name, direction, notify, onCreated }: Props) => {
  const categories = useCategories().data
  const register = useRegister()
  if (!categories) return null
  const typed = name.trim()
  const missing = typed !== '' && !findCategory(categories, typed, direction)
  const create = () =>
    register.mutate(
      { kind: 'category', payload: { name: typed, kind: direction } },
      {
        onSuccess: (created) => {
          notify({ message: `Categoria criada: ${created.name}` })
          onCreated(created.name)
        },
        onError: (error) => notify({ tone: 'error', message: registerFailure(error) }),
      },
    )
  if (categories.length > 0 && !missing) return null
  return (
    <>
      {categories.length === 0 && <StarterButton notify={notify} variant="outline" />}
      {missing && (
        <Button variant="outline" disabled={register.isPending} aria-busy={register.isPending} onClick={create}>
          <Plus aria-hidden className="size-4" />
          {`Criar categoria ${typed}`}
        </Button>
      )}
    </>
  )
}
