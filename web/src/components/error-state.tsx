import { Button } from './ui/button.tsx'

export const ErrorState = ({ title = 'Não foi possível carregar', onRetry }: { title?: string; onRetry?: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-2 rounded-card border bg-late-soft px-6 py-10 text-center">
    <p className="m-0 text-section font-semibold text-late">{title}</p>
    <p className="m-0 text-muted">Verifique se a API local está rodando e tente de novo.</p>
    {onRetry && (
      <Button variant="outline" className="mt-2" onClick={onRetry}>
        Tentar novamente
      </Button>
    )}
  </div>
)
