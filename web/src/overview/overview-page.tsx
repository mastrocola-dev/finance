import { Link, useSearch } from '@tanstack/react-router'
import { EmptyState } from '../components/empty-state.tsx'
import { QueryView } from '../components/query-view.tsx'
import { Skeleton } from '../components/skeleton.tsx'
import { buttonVariants } from '../components/ui/button.tsx'
import { formatMonth } from '../lib/format.ts'
import { desktop, useMediaQuery } from '../lib/media.ts'
import { firstDay, monthOf, shiftMonth } from '../lib/search.ts'
import { useMembers, useProposedDecisions, useSelectedMember } from '../query/shell.ts'
import { screenOf } from '../shell/nav.ts'
import { PageHeader } from '../shell/page-header.tsx'
import { BalanceHero } from './balance-hero.tsx'
import { CategorySpend } from './category-spend.tsx'
import { DueBills } from './due-bills.tsx'
import { FlowChart } from './flow-chart.tsx'
import { KpiCards } from './kpi-cards.tsx'
import { categories, flow, overview } from './model.ts'
import { PendingDecisions } from './pending-decisions.tsx'
import { useMonthEntries, useMonthFlow, useMonthSplit, useRecentActivity } from './queries.ts'
import { RecentActivity } from './recent-activity.tsx'
import { SettlementCard } from './settlement-card.tsx'

const monthName = (month: string) => formatMonth(firstDay(month)).replace(/ de \d{4}$/, '')

const MonthSkeleton = () => (
  <div className="flex flex-col gap-4">
    <Skeleton className="h-40 md:h-28" />
    <div className="flex flex-wrap gap-4">
      <Skeleton className="hidden h-72 flex-[2_1_520px] md:block" />
      <Skeleton className="h-72 flex-[1_1_300px]" />
    </div>
  </div>
)

const CardSkeleton = () => <Skeleton className="h-32 rounded-card" />

const MonthFlow = ({ month, member }: { month: string; member: string | undefined }) => {
  const query = useMonthFlow(month, member)
  return (
    <div className="flex min-w-0 flex-[2_1_520px]">
      <QueryView query={query} skeleton={<Skeleton className="h-72" />}>
        {(data) => <FlowChart months={flow(data)} />}
      </QueryView>
    </div>
  )
}

const MonthCategories = ({ month }: { month: string }) => {
  const member = useSelectedMember()
  const entries = useMonthEntries(month, member, !useMembers().isPending)
  if (entries.data?.current.length === 0) return null
  return (
    <div className="flex min-w-0 flex-[2_1_520px]">
      <QueryView query={entries} skeleton={<Skeleton className="h-72" />}>
        {(data) => <CategorySpend items={categories(data.current, data.previous)} previousLabel={monthName(shiftMonth(month, -1))} />}
      </QueryView>
    </div>
  )
}

const MonthSection = ({ month }: { month: string }) => {
  const member = useSelectedMember()
  const entries = useMonthEntries(month, member, !useMembers().isPending)
  const wide = useMediaQuery(desktop, true)
  return (
    <QueryView
      query={entries}
      skeleton={<MonthSkeleton />}
      isEmpty={(data) => data.current.length === 0}
      empty={
        <EmptyState
          title={`Nenhum lançamento em ${formatMonth(firstDay(month))}`}
          action={
            <Link to="/lancamentos" className={buttonVariants()}>
              + Lançamento
            </Link>
          }
        />
      }
    >
      {(data) => {
        const summary = overview(data.current)
        return (
          <>
            <BalanceHero data={summary} />
            <KpiCards data={summary} />
            <div className="flex flex-wrap gap-4">
              {wide && <MonthFlow month={month} member={member} />}
              <DueBills data={summary} />
            </div>
          </>
        )
      }}
    </QueryView>
  )
}

export const OverviewPage = () => {
  const search = useSearch({ from: '__root__' })
  const month = monthOf(search)
  const split = useMonthSplit(month)
  const members = useMembers()
  const decisions = useProposedDecisions()
  const activity = useRecentActivity()
  return (
    <>
      <PageHeader screen={screenOf('/')} />
      <MonthSection month={month} />
      <div className="flex flex-wrap items-start gap-4">
        <MonthCategories month={month} />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <QueryView query={split} skeleton={<CardSkeleton />}>
            {(data) => <SettlementCard split={data} members={members.data ?? []} />}
          </QueryView>
          <QueryView query={decisions} skeleton={<CardSkeleton />}>
            {(data) => <PendingDecisions decisions={data} />}
          </QueryView>
          <QueryView query={activity} skeleton={<CardSkeleton />}>
            {(data) => <RecentActivity items={data.items} />}
          </QueryView>
        </div>
      </div>
    </>
  )
}
