import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { chip } from '../decisions/decision-card.tsx'
import { cn } from '../lib/utils.ts'
import { plural } from './model.ts'
import type { ReviewSummary as Summary } from './summary-model.ts'

const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <h3 className="m-0 text-meta font-semibold">{title}</h3>
    {children}
  </div>
)

const list = 'm-0 flex list-none flex-col gap-1 p-0 text-meta'

export const ReviewSummary = ({ summary }: { summary: Summary }) => (
  <section aria-labelledby="summary-title" className="flex min-w-0 flex-col gap-3 rounded-card border bg-surface px-4 py-3 md:px-6 md:py-4">
    <h2 id="summary-title" className="m-0 text-section font-semibold">
      Resumo
    </h2>
    <p className="m-0 flex flex-wrap items-center gap-2">
      <span className="font-medium">{plural(summary.ready, 'item pronto para importar', 'itens prontos para importar')}</span>
      {summary.byModel > 0 && <span className={cn(chip, 'bg-claude-soft text-claude')}>{plural(summary.byModel, 'aceito pelo Claude', 'aceitos pelo Claude')}</span>}
      {summary.waiting > 0 && <span className="text-meta text-muted">{plural(summary.waiting, 'espera revisão', 'esperam revisão')}</span>}
    </p>
    {summary.blocking + summary.blocked === 0 ? (
      <p className="m-0 text-meta text-ok">Nada bloqueia a importação</p>
    ) : (
      <ul aria-label="O que ainda bloqueia" className="m-0 flex list-none flex-col gap-1 p-0 text-meta text-late">
        {summary.blocking > 0 && <li>{plural(summary.blocking, 'pergunta ainda precisa de vocês', 'perguntas ainda precisam de vocês')}</li>}
        {summary.blocked > 0 && <li>{plural(summary.blocked, 'item com bloqueio', 'itens com bloqueio')}: edite ou rejeite antes de aceitar</li>}
      </ul>
    )}
    {summary.failure && (
      <p role="alert" className="m-0 text-meta text-late">
        {summary.failure}
      </p>
    )}
    {summary.categories.length > 0 && (
      <Part title={`Categorias novas (${summary.categories.length})`}>
        <ul aria-label="Categorias novas" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {summary.categories.map((category) => (
            <li key={category.id} className={cn(chip, 'bg-accent-soft text-accent')}>
              {category.name}
              <span className="sr-only">, {category.direction}</span>
            </li>
          ))}
        </ul>
      </Part>
    )}
    {summary.merges.length > 0 && (
      <Part title="Categorias juntadas pelo Claude">
        <ul aria-label="Categorias juntadas" className={list}>
          {summary.merges.map((merge) => (
            <li key={`${merge.kind}-${merge.name}`} className="flex flex-wrap items-center gap-1.5">
              <span>{merge.name}</span>
              <ArrowRight aria-hidden="true" className="size-3.5 text-muted" />
              <span className="sr-only">para</span>
              <span className="font-medium">{merge.to}</span>
              <span className="text-xs text-muted">{plural(merge.candidates, 'item', 'itens')}</span>
            </li>
          ))}
        </ul>
      </Part>
    )}
    {summary.unchecked.length > 0 && (
      <Part title="Subtotais sem conferência">
        <ul aria-label="Subtotais sem conferência" className={cn(list, 'text-pending')}>
          {summary.unchecked.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="m-0 text-xs text-muted">Juntar categorias mudou o que estes subtotais somam. Confira os itens antes de importar.</p>
      </Part>
    )}
  </section>
)
