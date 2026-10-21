import { Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '../lib/utils.ts'
import type { Filters } from './model.ts'

const chip = 'min-h-11 rounded-full border bg-surface px-3 text-meta text-text md:min-h-9'
const active = 'border-accent bg-accent-soft text-accent'

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

const useSlashFocus = () => {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return
      event.preventDefault()
      ref.current?.focus()
    }
    document.addEventListener('keydown', focus)
    return () => document.removeEventListener('keydown', focus)
  }, [])
  return ref
}

const directions = [
  { value: 'income', label: 'Receitas' },
  { value: 'expense', label: 'Despesas' },
] as const

type Props = { filters: Filters; categories: string[]; onChange: (filters: Filters) => void }

export const Toolbar = ({ filters, categories, onChange }: Props) => {
  const search = useSlashFocus()
  const set = (changes: Partial<Filters>) => onChange({ ...filters, ...changes })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-h-11 flex-[1_1_260px] items-center gap-2 rounded-field border bg-surface px-3 text-muted focus-within:outline-2 focus-within:outline-accent md:min-h-10">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Buscar</span>
        <input
          ref={search}
          type="search"
          value={filters.text}
          onChange={(event) => set({ text: event.target.value })}
          onKeyDown={(event) => event.key === 'Escape' && set({ text: '' })}
          placeholder="Buscar descrição ou valor"
          className="min-w-0 flex-1 border-0 bg-transparent text-text outline-none placeholder:text-muted"
        />
        <span aria-hidden="true" className="hidden rounded-[4px] border px-1.5 py-0.5 font-sans text-[11px] md:inline">
          /
        </span>
      </label>
      <fieldset className="m-0 flex gap-2 border-0 p-0">
        <legend className="sr-only">Tipo</legend>
        {directions.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={filters.direction === value} onClick={() => set({ direction: filters.direction === value ? undefined : value })} className={cn(chip, filters.direction === value && active)}>
            {label}
          </button>
        ))}
      </fieldset>
      <select aria-label="Filtrar por categoria" value={filters.category ?? ''} onChange={(event) => set({ category: event.target.value || undefined })} className={cn(chip, 'pr-2', filters.category && active)}>
        <option value="">Todas as categorias</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <button type="button" aria-pressed={filters.open} onClick={() => set({ open: !filters.open })} className={cn(chip, filters.open && active)}>
        Pendentes e atrasadas
      </button>
    </div>
  )
}
