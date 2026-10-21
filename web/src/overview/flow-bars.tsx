import { Bar, BarChart, ResponsiveContainer } from 'recharts'
import type { FlowMonth } from './model.ts'

export const FlowBars = ({ months }: { months: FlowMonth[] }) => {
  const data = months.map(({ month, income, expenses }) => ({ month, income: Number(income), expenses: Number(expenses) }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barGap={4} barSize={18} accessibilityLayer={false}>
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="expenses" fill="var(--color-expense)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
