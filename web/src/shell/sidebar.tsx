import { Link } from '@tanstack/react-router'
import { useProposedDecisions } from '../query/shell.ts'
import { ThemeSwitch } from '../theme/theme-switch.tsx'
import { Brand } from './brand.tsx'
import { IdentityPicker } from './identity-picker.tsx'
import { screens } from './nav.ts'

export const Sidebar = () => {
  const { data: proposed } = useProposedDecisions()

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-1 border-r bg-surface px-4 py-6 md:flex">
      <div className="px-2 pb-5">
        <Brand />
      </div>
      <nav aria-label="Principal" className="flex flex-col gap-1">
        {screens.map(({ path, title }) => (
          <Link key={path} to={path} activeOptions={{ exact: path === '/' }} className="group flex min-h-10 items-center gap-2.5 rounded-control px-2.5 text-text data-[status=active]:bg-accent-soft data-[status=active]:font-semibold data-[status=active]:text-accent">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-border group-data-[status=active]:bg-accent" />
            <span>{title}</span>
            {path === '/decisoes' && proposed && proposed.length > 0 && (
              <span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">
                {proposed.length}
                <span className="sr-only"> pendentes</span>
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col items-start gap-4 border-t px-2.5 pt-4">
        <ThemeSwitch />
        <IdentityPicker />
      </div>
    </aside>
  )
}
