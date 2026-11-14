import { Bar, BarChart, ResponsiveContainer, XAxis } from 'recharts'
import type { ReleaseBar } from './card-model.ts'

export const ReleaseBars = ({ bars }: { bars: ReleaseBar[] }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={bars} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%" accessibilityLayer={false}>
      <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} height={18} />
      <Bar dataKey="cents" fill="var(--color-income)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>
)
