import { CalendarCheck, FileSpreadsheet, ReceiptText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { Brand } from '../shell/brand.tsx'
import { GoogleButton } from './google-button.tsx'
import { SignInNotice } from './sign-in-notice.tsx'

export type Ended = 'expired' | 'unknown' | 'failed'

const points = [
  { icon: ReceiptText, title: 'Lançamentos do mês', text: 'O que entrou e saiu, de quem e em qual categoria.' },
  { icon: CalendarCheck, title: 'Contas a pagar', text: 'Vencimentos do mês e o que ainda está em aberto.' },
  { icon: FileSpreadsheet, title: 'Importação de planilhas', text: 'Extratos e planilhas lidos pelo Claude e revisados por vocês.' },
]

export const SignInScreen = ({ signIn, ended }: { signIn: (select?: boolean) => void; ended?: Ended }) => {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => event.persisted && setBusy(false)
    globalThis.addEventListener('pageshow', restored)
    return () => globalThis.removeEventListener('pageshow', restored)
  }, [])
  const start = (select: boolean) => {
    setBusy(true)
    signIn(select)
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg px-4 py-8 md:px-8">
      <div className="mx-auto grid w-full max-w-[400px] flex-1 content-center gap-8 lg:max-w-[960px] lg:grid-cols-2 lg:items-center lg:gap-16">
        <section aria-label="Caixa" className="order-2 flex flex-col gap-6 lg:order-1">
          <Brand />
          <p className="m-0 text-title-mobile font-semibold tracking-[-0.02em] lg:text-title">As finanças da casa, em um só lugar</p>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
                  <Icon className="size-[18px]" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-section font-semibold">{title}</span>
                  <span className="text-meta text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <div className="order-1 flex flex-col gap-6 rounded-hero border bg-surface px-6 py-8 lg:order-2 lg:px-8">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-title-mobile font-semibold tracking-[-0.02em] md:text-title">Entrar</h1>
            <p className="m-0 text-muted">Use a conta Google cadastrada na casa para ver e registrar as finanças.</p>
          </div>
          {ended && <SignInNotice ended={ended} />}
          {ended === 'unknown' ? (
            <Button variant="outline" className="w-full" disabled={busy} aria-busy={busy} onClick={() => start(true)}>
              {busy ? 'Abrindo o Google…' : 'Entrar com outra conta'}
            </Button>
          ) : (
            <GoogleButton busy={busy} label="Entrar com Google" onClick={() => start(false)} />
          )}
        </div>
      </div>
      <footer className="mx-auto mt-8 flex w-full max-w-[400px] justify-between gap-4 text-meta text-muted lg:max-w-[960px]">
        <span>Acesso só para os membros da casa</span>
        <span className="font-mono">v{import.meta.env.VITE_APP_VERSION}</span>
      </footer>
    </main>
  )
}
