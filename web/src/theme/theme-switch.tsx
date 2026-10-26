import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '../lib/utils.ts'
import type { Theme } from './theme.ts'
import { useTheme } from './use-theme.ts'

const options = [
  { value: 'system', label: 'Tema do sistema', Icon: Monitor },
  { value: 'light', label: 'Tema claro', Icon: Sun },
  { value: 'dark', label: 'Tema escuro', Icon: Moon },
] satisfies { value: Theme; label: string; Icon: typeof Sun }[]

export const ThemeSwitch = () => {
  const [theme, setTheme] = useTheme()

  return (
    <fieldset className="m-0 inline-flex min-w-0 rounded-field border bg-sunken p-[3px]">
      <legend className="sr-only">Tema</legend>
      {options.map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-label={label} aria-pressed={theme === value} title={label} onClick={() => setTheme(value)} className={cn('flex size-11 items-center justify-center rounded-[7px] text-muted md:size-[34px]', theme === value && 'bg-surface text-text')}>
          <Icon aria-hidden="true" className="size-4" />
        </button>
      ))}
    </fieldset>
  )
}
