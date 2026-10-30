import { Button } from '../components/ui/button.tsx'
import { Brand } from '../shell/brand.tsx'

export type Ended = 'expired' | 'unknown' | 'failed'

const endings: Record<Ended, string> = {
  expired: 'Sua sessão terminou. Entre de novo para continuar.',
  unknown: 'Esta conta Google não está cadastrada na casa. Entre com outra conta.',
  failed: 'Não foi possível concluir a entrada. Tente de novo.',
}

export const SignInScreen = ({ signIn, ended }: { signIn: () => void; ended?: Ended }) => (
  <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
    <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-hero border bg-surface px-6 py-8 md:px-8">
      <Brand />
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-title-mobile font-semibold tracking-[-0.02em] md:text-title">Entrar</h1>
        <p className="m-0 text-muted">Use a conta Google cadastrada na casa para ver e registrar as finanças.</p>
      </div>
      {ended === 'failed' && (
        <p role="alert" className="m-0 rounded-control bg-late-soft px-3 py-2 text-meta text-late">
          {endings.failed}
        </p>
      )}
      {ended && ended !== 'failed' && (
        <p role="status" className="m-0 rounded-control bg-pending-soft px-3 py-2 text-meta text-pending">
          {endings[ended]}
        </p>
      )}
      <Button className="w-full" onClick={signIn}>
        Entrar com Google
      </Button>
    </div>
  </main>
)
