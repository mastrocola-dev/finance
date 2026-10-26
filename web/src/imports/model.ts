import type { components } from '../api/schema.ts'
import { ApiFailure } from '../query/client.ts'

export type Batch = components['schemas']['ImportBatch']

export type Runtime = components['schemas']['ImportRuntime']

export const runtimeTexts: Record<NonNullable<Runtime['cause']>, string> = {
  missing: 'A leitura de arquivos não está instalada neste computador. Instale o uv; a API tenta de novo sozinha.',
  timeout: 'A preparação da leitura de arquivos demorou demais. A API tenta de novo em instantes.',
  failed: 'Não foi possível preparar a leitura de arquivos. Veja o log da API; ela tenta de novo em instantes.',
}

export type Unavailable = { title: string; text: string }

const warming: Unavailable = { title: 'Preparando a leitura.', text: 'Isso leva alguns instantes; a tela atualiza sozinha.' }

export const unavailableNotice = (runtime: Runtime | undefined): Unavailable | undefined => {
  if (!runtime || runtime.ready) return undefined
  if (runtime.warming) return warming
  return runtime.cause ? { title: 'Leitura indisponível.', text: runtimeTexts[runtime.cause] } : undefined
}

export const runtimePollMs = 5000

export const unavailableId = 'upload-unavailable'

const offline = 'A leitura de arquivos não está disponível agora. Veja o aviso acima.'

export const formats = ['xlsx', 'csv', 'json', 'xml', 'txt', 'ofx', 'pdf']

export const accept = formats.map((format) => `.${format}`).join(',')

export const maxBytes = 20 * 1024 * 1024

export type Phase = 'extracting' | 'failed' | 'draft' | 'verified' | 'committed' | 'abandoned' | 'closed'

export const phaseOf = (batch: Batch): Phase => {
  if (batch.progress?.state === 'extracting') return 'extracting'
  if (batch.status === 'draft') return batch.progress?.state === 'failed' ? 'failed' : 'draft'
  if (batch.status === 'closed') return batch.committed > 0 ? 'closed' : 'abandoned'
  return batch.status
}

export const phaseLabels: Record<Phase, string> = {
  extracting: 'Extraindo',
  failed: 'Falhou',
  draft: 'Rascunho',
  verified: 'Para revisar',
  committed: 'Gravado',
  abandoned: 'Descartado',
  closed: 'Encerrado',
}

export const phaseTones: Record<Phase, string> = {
  extracting: 'bg-claude-soft text-claude',
  failed: 'bg-late-soft text-late',
  draft: 'bg-pending-soft text-pending',
  verified: 'bg-accent-soft text-accent',
  committed: 'bg-ok-soft text-ok',
  abandoned: 'bg-pending-soft text-pending',
  closed: 'bg-ok-soft text-ok',
}

export const isExtracting = (batch: Batch) => batch.progress?.state === 'extracting'

export const closeAction = (batch: Batch) => {
  if (isExtracting(batch) || batch.status === 'closed') return undefined
  return batch.status === 'committed' ? { label: 'Encerrar', confirm: 'Confirmar encerramento' } : { label: 'Descartar', confirm: 'Confirmar descarte' }
}

export const progressText = (progress: NonNullable<Batch['progress']>) => (progress.total === 0 ? 'Preparando o arquivo' : `Lendo trecho ${Math.min(progress.done + 1, progress.total)} de ${progress.total}`)

const integer = new Intl.NumberFormat('pt-BR')

const dollars = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

export const formatTokens = (batch: Batch) => `${integer.format(batch.inputTokens + batch.outputTokens)} tokens`

export const formatUsd = (cost: string) => `US$ ${dollars.format(Number(cost))}`

const stamp = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export const formatStamp = (iso: string) => stamp.format(new Date(iso))

export const plural = (count: number, one: string, many: string) => `${integer.format(count)} ${count === 1 ? one : many}`

export const summary = (batch: Batch) => {
  if (batch.status === 'closed') return batch.committed > 0 ? plural(batch.committed, 'item gravado', 'itens gravados') : 'Nada foi gravado'
  if (batch.status === 'committed') return plural(batch.committed, 'item gravado', 'itens gravados')
  return [plural(batch.candidates, 'item', 'itens'), batch.openQuestions > 0 && plural(batch.openQuestions, 'pergunta', 'perguntas'), batch.flagged > 0 && plural(batch.flagged, 'com alerta', 'com alerta')].filter(Boolean).join(' · ')
}

export const canRetry = (batch: Batch) => batch.retryable > 0 && !isExtracting(batch) && (batch.status === 'draft' || batch.status === 'verified')

export const retryText = (batch: Batch) => (batch.retryable === 1 ? '1 trecho pode ser lido de novo: falhou ou tem baixa confiança.' : `${integer.format(batch.retryable)} trechos podem ser lidos de novo: falharam ou têm baixa confiança.`)

export const fileIssue = (file: File) => {
  const format = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined
  if (!format || !formats.includes(format)) return `Formato não aceito. Use ${formats.join(', ')}.`
  if (file.size === 0) return 'O arquivo está vazio.'
  if (file.size > maxBytes) return 'O arquivo passa de 20 MB.'
  return undefined
}

export const uploadFailure = (error: Error) => {
  if (!(error instanceof ApiFailure)) return 'Não foi possível enviar o arquivo. Tente de novo.'
  if (error.status === 401) return 'Escolha quem você é para importar.'
  if (error.status === 413) return 'O arquivo passa de 20 MB.'
  if (error.status === 503) return offline
  if (/already in import batch/.test(error.message)) return 'Este arquivo já foi enviado. Veja o histórico.'
  if (/unsupported format/.test(error.message)) return `Formato não aceito. Use ${formats.join(', ')}.`
  if (/service-agent/.test(error.message)) return 'A leitura pelo Claude não está disponível neste ambiente.'
  return 'Não foi possível enviar o arquivo. Tente de novo.'
}

export const closeFailure = (error: Error) => {
  if (error instanceof ApiFailure && error.status === 401) return 'Escolha quem você é para encerrar.'
  if (error instanceof ApiFailure && error.status === 409) return 'A importação ainda está sendo lida. Espere terminar.'
  if (error instanceof ApiFailure && error.status === 422) return 'Esta importação já foi encerrada. A lista foi atualizada.'
  return 'Não foi possível encerrar. Tente de novo.'
}

export const retryFailure = (error: Error) => {
  if (!(error instanceof ApiFailure)) return 'Não foi possível ler de novo. Tente de novo.'
  if (error.status === 401) return 'Escolha quem você é para ler de novo.'
  if (error.status === 409) return 'A importação ainda está sendo lida. Espere terminar.'
  if (error.status === 503) return offline
  if (/no longer kept/.test(error.message)) return 'O arquivo não está mais guardado. Descarte a importação e envie o arquivo de novo.'
  if (/nothing to retry/.test(error.message)) return 'Não há trechos para ler de novo. A lista foi atualizada.'
  if (/not open for a retry/.test(error.message)) return 'Esta importação já foi gravada ou encerrada. A lista foi atualizada.'
  return 'Não foi possível ler de novo. Tente de novo.'
}
