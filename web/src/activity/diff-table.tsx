import type { DiffRow } from './model.ts'

const head = 'px-2 py-2 text-left font-normal md:px-3'

const cell = 'border-t px-2 py-2 text-left align-top break-words md:px-3'

const value = `${cell} border-l font-mono text-xs md:text-meta`

export const DiffTable = ({ rows }: { rows: DiffRow[] }) => (
  <div className="overflow-hidden rounded-field border">
    <table className="w-full border-collapse text-meta md:table-fixed">
      <thead className="bg-sunken text-muted">
        <tr>
          <th scope="col" className={head}>
            Campo
          </th>
          <th scope="col" className={`${head} border-l`}>
            Antes
          </th>
          <th scope="col" className={`${head} border-l`}>
            Depois
          </th>
        </tr>
      </thead>
      <tbody className="bg-surface">
        {rows.map((row) => (
          <tr key={row.field}>
            <th scope="row" className={`${cell} font-normal`}>
              {row.field}
            </th>
            <td className={`${value} text-late line-through`}>{row.before}</td>
            <td className={`${value} text-ok`}>{row.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
