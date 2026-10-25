import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { chip } from '../decisions/decision-card.tsx'
import { cn } from '../lib/utils.ts'
import { type Batch, canRetry, closeAction, formatStamp, formatTokens, formatUsd, phaseLabels, phaseOf, phaseTones, plural, progressText, retryText, summary } from './model.ts'

type Props = { batch: Batch; busy: boolean; onClose: () => void; onRetry: () => void }

const Progress = ({ batch, progress }: { batch: Batch; progress: NonNullable<Batch['progress']> }) => (
  <div className="flex flex-col gap-1.5">
    <div role="progressbar" aria-label={`Leitura de ${batch.fileName}`} aria-valuemin={0} aria-valuemax={Math.max(progress.total, 1)} aria-valuenow={progress.done} aria-valuetext={progressText(progress)} className="h-1.5 overflow-hidden rounded-full bg-sunken">
      <div className="h-full rounded-full bg-claude transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 4}%` }} />
    </div>
    <span className="text-xs text-muted">{progressText(progress)}</span>
  </div>
)

const Failures = ({ batch }: { batch: Batch }) => (
  <details className="text-meta">
    <summary className="cursor-pointer text-late">{plural(batch.failures.length, 'trecho não lido', 'trechos não lidos')}</summary>
    <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
      {batch.failures.map((failure) => (
        <li key={`${failure.source}@${failure.offset}`} className="flex flex-wrap gap-x-2 text-xs">
          <span className="font-medium">{failure.source}</span>
          <span className="text-muted">{failure.reason}</span>
        </li>
      ))}
    </ul>
  </details>
)

export const BatchItem = ({ batch, busy, onClose, onRetry }: Props) => {
  const [confirming, setConfirming] = useState(false)
  const phase = phaseOf(batch)
  const action = closeAction(batch)
  const retry = canRetry(batch)
  return (
    <li className="flex flex-col gap-2.5 border-b py-3.5 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{batch.fileName}</span>
          <span className="text-xs text-muted">
            {batch.format.toUpperCase()} · {formatStamp(batch.createdAt)}
          </span>
        </div>
        <span className={cn(chip, phaseTones[phase])}>{phaseLabels[phase]}</span>
      </div>
      {batch.progress && phase === 'extracting' ? <Progress batch={batch} progress={batch.progress} /> : <span className="text-meta">{summary(batch)}</span>}
      {phase === 'failed' && batch.progress?.error && <span className="text-meta text-late">{batch.progress.error}</span>}
      {batch.failures.length > 0 && <Failures batch={batch} />}
      {retry && <span className="text-xs text-muted">{retryText(batch)}</span>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="amount">{formatTokens(batch)}</span>
        <span className="amount">{formatUsd(batch.costUsd)}</span>
        {(phase === 'verified' || action || retry) && (
          <span className="ml-auto flex flex-wrap justify-end gap-2">
            {retry && !confirming && (
              <Button variant="outline" disabled={busy} aria-label={`Ler de novo ${batch.fileName}`} onClick={onRetry}>
                Ler de novo
              </Button>
            )}
            {phase === 'verified' && !confirming && (
              <Link to="/importar/$id" params={{ id: batch.id }} aria-label={`Revisar ${batch.fileName}`} className={buttonVariants({ variant: 'primary' })}>
                Revisar
              </Link>
            )}
            {!action ? null : confirming ? (
              <>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  aria-label={`${action.confirm} de ${batch.fileName}`}
                  onClick={() => {
                    setConfirming(false)
                    onClose()
                  }}
                >
                  {action.confirm}
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled={busy} aria-label={`${action.label} ${batch.fileName}`} onClick={() => setConfirming(true)}>
                {action.label}
              </Button>
            )}
          </span>
        )}
      </div>
    </li>
  )
}
