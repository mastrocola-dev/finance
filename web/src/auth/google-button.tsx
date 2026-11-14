import { LoaderCircle } from 'lucide-react'
import { GoogleMark } from './google-mark.tsx'

export const GoogleButton = ({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} disabled={busy} aria-busy={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-field border border-muted bg-surface px-4 text-body font-medium text-text disabled:cursor-progress">
    {busy ? <LoaderCircle aria-hidden="true" className="size-[18px] animate-spin text-muted motion-reduce:animate-none" /> : <GoogleMark />}
    {busy ? 'Abrindo o Google…' : label}
  </button>
)
