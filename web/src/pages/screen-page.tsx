import { EmptyState } from '../components/empty-state.tsx'
import type { Screen } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'

export const ScreenPage = ({ screen }: { screen: Screen }) => (
  <>
    <PageHeader screen={screen} />
    <EmptyState title={`${screen.title} em construção`}>Esta tela chega nos próximos incrementos; a navegação, o mês e o membro escolhidos já ficam no endereço.</EmptyState>
  </>
)
