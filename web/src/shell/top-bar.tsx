import { Account } from './account.tsx'
import { Brand } from './brand.tsx'
import { MoreMenu } from './more-menu.tsx'

export const TopBar = () => (
  <header className="flex items-center gap-3 border-b bg-surface px-4 py-2 md:hidden">
    <Brand />
    <div className="ml-auto flex items-center gap-2">
      <Account compact />
      <MoreMenu />
    </div>
  </header>
)
