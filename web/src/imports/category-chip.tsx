import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { chip } from '../decisions/decision-card.tsx'
import { cn } from '../lib/utils.ts'

export type Rename = (name: string, done: { close: () => void; refuse: (message: string) => void }) => void

type Category = { id: string; name: string; direction: string }

const input = 'min-h-11 min-w-0 flex-1 rounded-control border bg-bg px-3 text-body text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-soft aria-invalid:border-late md:min-h-10'

export const CategoryChip = ({ category, busy, onRename }: { category: Category; busy: boolean; onRename?: Rename }) => {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [error, setError] = useState<string>()
  const fieldId = `category-name-${category.id}`
  const errorId = `${fieldId}-error`
  const field = useRef<HTMLInputElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const returning = useRef(false)
  useEffect(() => {
    if (editing) field.current?.focus()
    else if (returning.current) opener.current?.focus()
    returning.current = editing
  }, [editing])
  const close = () => {
    setEditing(false)
    setError(undefined)
  }
  if (!editing)
    return (
      <li className="flex items-center">
        <span className={cn(chip, 'bg-accent-soft text-accent')}>
          {category.name}
          <span className="sr-only">, {category.direction}</span>
        </span>
        {onRename && (
          <Button
            ref={opener}
            variant="ghost"
            size="icon"
            className="text-accent md:size-8"
            aria-label={`Renomear ${category.name}`}
            disabled={busy}
            onClick={() => {
              setName(category.name)
              setEditing(true)
            }}
          >
            <Pencil size={12} aria-hidden="true" />
          </Button>
        )}
      </li>
    )
  return (
    <li className="w-full max-w-xl">
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === category.name) return close()
          onRename?.(name.trim(), { close, refuse: setError })
        }}
      >
        <label htmlFor={fieldId} className="text-meta font-medium">
          Novo nome de {category.name}
        </label>
        <div className="flex flex-wrap gap-2">
          <input ref={field} id={fieldId} value={name} maxLength={200} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => setName(event.target.value)} className={input} />
          <Button type="submit" disabled={busy || !name.trim()}>
            Salvar
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="m-0 text-meta text-late">
            {error}
          </p>
        )}
      </form>
    </li>
  )
}
