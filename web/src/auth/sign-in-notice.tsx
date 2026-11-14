import type { Ended } from './sign-in-screen.tsx'

const notices: Record<Ended, { title: string; text: string }> = {
  expired: { title: 'Sua sessão terminou.', text: 'Por segurança a entrada vale por 8 horas. Entre de novo para continuar de onde parou.' },
  unknown: { title: 'Esta conta Google não está cadastrada na casa.', text: 'Entre com a conta que um membro cadastrou para você, ou peça para ele cadastrar esta.' },
  failed: { title: 'Não foi possível concluir a entrada.', text: 'Tente de novo. Se continuar falhando, feche esta aba e abra o Caixa outra vez.' },
}

export const SignInNotice = ({ ended }: { ended: Ended }) => {
  const { title, text } = notices[ended]
  const tone = ended === 'failed' ? 'bg-late-soft text-late' : 'bg-pending-soft text-pending'
  return (
    <div role={ended === 'failed' ? 'alert' : 'status'} className={`flex flex-col gap-1 rounded-control px-3 py-2 text-meta ${tone}`}>
      <strong className="font-semibold">{title}</strong>
      <span>{text}</span>
    </div>
  )
}
