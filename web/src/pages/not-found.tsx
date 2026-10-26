import { Link } from '@tanstack/react-router'
import { EmptyState } from '../components/empty-state.tsx'
import { buttonVariants } from '../components/ui/button.tsx'

export const NotFound = () => (
  <EmptyState
    title="Página não encontrada"
    action={
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        Voltar para a visão do mês
      </Link>
    }
  >
    O endereço não corresponde a nenhuma tela.
  </EmptyState>
)
