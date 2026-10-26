import { type FormEvent, useRef, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { accept, fileIssue, formats } from './model.ts'

const errorId = 'upload-error'

const unavailableId = 'upload-unavailable'

type Props = { member: string | undefined; pending: boolean; unavailable: string | undefined; onSubmit: (file: File, reset: () => void) => void }

export const UploadForm = ({ member, pending, unavailable, onSubmit }: Props) => {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [consent, setConsent] = useState(false)
  const [issue, setIssue] = useState<string>()

  const reset = () => {
    setFile(undefined)
    setConsent(false)
    if (input.current) input.current.value = ''
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const problem = file ? fileIssue(file) : 'Escolha um arquivo.'
    setIssue(problem ?? (consent ? undefined : 'Marque a autorização para enviar o arquivo.'))
    if (file && !problem && consent) onSubmit(file, reset)
  }

  return (
    <form aria-labelledby="upload-title" noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-card border bg-surface p-4 md:px-6 md:py-5">
      <div className="flex flex-col gap-1">
        <h2 id="upload-title" className="m-0 text-section font-semibold">
          Enviar arquivo
        </h2>
        <p className="m-0 text-meta text-muted">Planilha, extrato ou exportação de outro app. O Claude lê o conteúdo e propõe lançamentos para vocês revisarem.</p>
      </div>
      {unavailable && (
        <p id={unavailableId} role="status" className="m-0 rounded-control border bg-pending-soft px-3 py-2 text-meta text-text">
          <span className="font-semibold text-pending">Leitura indisponível.</span> {unavailable}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="upload-file" className="text-xs text-muted">
          Arquivo
        </label>
        <input
          ref={input}
          id="upload-file"
          type="file"
          accept={accept}
          aria-invalid={issue && !file ? true : undefined}
          aria-describedby={issue ? errorId : 'upload-formats'}
          onChange={(event) => {
            setFile(event.target.files?.[0])
            setIssue(undefined)
          }}
          className="min-h-11 w-full min-w-0 rounded-control border bg-bg px-3 py-2 text-body text-text file:mr-3 file:rounded-control file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-meta file:font-medium file:text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent-soft"
        />
        <span id="upload-formats" className="text-xs text-muted">
          {formats.join(', ')} · até 20 MB
        </span>
      </div>
      <label className="flex items-start gap-3 text-meta">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked)
            setIssue(undefined)
          }}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <span>Autorizo enviar o conteúdo deste arquivo ao modelo do Claude para extração. Números longos chegam mascarados e nada entra no livro antes de vocês revisarem.</span>
      </label>
      {issue && (
        <p id={errorId} role="alert" className="m-0 text-meta text-late">
          {issue}
        </p>
      )}
      <Button type="submit" disabled={pending || !member || Boolean(unavailable)} aria-describedby={unavailable ? unavailableId : undefined}>
        {pending ? 'Enviando…' : 'Enviar para leitura'}
      </Button>
      {!member && <p className="m-0 text-meta text-muted">Escolha quem você é para importar.</p>}
    </form>
  )
}
