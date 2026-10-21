import type { Client } from 'pg'
import { connect } from './connection.ts'
import { seedDecisions } from './seed-decisions.ts'
import { type Row, type Writer, write } from './write.ts'

export const seedToday = '2026-10-18'
const addMonths = (date: string, count: number) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + count, 1)).toISOString().slice(0, 10)
const firstMonth = '2025-11-01'
export const seedMonths = Array.from({ length: 12 }, (_, index) => addMonths(firstMonth, index))

const day = (competence: string, value: number) => `${competence.slice(0, 8)}${String(value).padStart(2, '0')}`
const vary = (base: bigint, step: number, range: number) => (index: number) => base + BigInt((index * step) % range)
const lateInCurrentMonth = new Set(['Electricity'])

const accounts = {
  joint: { institution: 'Banco Aurora', nickname: 'Joint checking', last_four: '0427', kind: 'checking', member: null },
  savings: { institution: 'Banco Aurora', nickname: 'Joint savings', last_four: '0428', kind: 'savings', member: null },
  marcio: { institution: 'Banco Aurora', nickname: 'Marcio checking', last_four: '6093', kind: 'checking', member: 'marcio' },
  marcioCard: { institution: 'Banco Horizonte', nickname: 'Marcio card', last_four: '8812', kind: 'credit_card', member: 'marcio' },
  gabriela: { institution: 'Banco Horizonte', nickname: 'Gabriela checking', last_four: '3150', kind: 'checking', member: 'gabriela' },
} as const

type AccountKey = keyof typeof accounts
type MemberKey = 'marcio' | 'gabriela'

const categories = {
  income: ['Salary', 'Freelance'],
  expense: ['Housing', 'Utilities', 'Groceries', 'Transport', 'Health', 'Leisure', 'Home', 'Debt'],
} as const

const incomes = [
  { description: 'Marcio salary', member: 'marcio', account: 'marcio', amount: 950000n, day: 5 },
  { description: 'Gabriela salary', member: 'gabriela', account: 'gabriela', amount: 820000n, day: 5 },
] as const

type Recurring = { description: string; category: string; account: AccountKey; member: MemberKey | null; amount: bigint; day: number; starts_on: string; installments_total?: number; actual?: (index: number) => bigint }

const recurring: Recurring[] = [
  { description: 'Rent', category: 'Housing', account: 'joint', member: null, amount: 320000n, day: 10, starts_on: '2024-03-01' },
  { description: 'Condominium fee', category: 'Housing', account: 'joint', member: null, amount: 85000n, day: 10, starts_on: '2024-03-01' },
  { description: 'Electricity', category: 'Utilities', account: 'joint', member: null, amount: 21000n, day: 15, starts_on: '2024-03-01', actual: vary(17500n, 1700, 7000) },
  { description: 'Internet', category: 'Utilities', account: 'joint', member: null, amount: 12000n, day: 20, starts_on: '2024-03-01' },
  { description: 'Health plan', category: 'Health', account: 'joint', member: null, amount: 98000n, day: 5, starts_on: '2025-01-01' },
  { description: 'Gym', category: 'Health', account: 'gabriela', member: 'gabriela', amount: 15000n, day: 7, starts_on: '2025-06-01' },
  { description: 'Sofa', category: 'Home', account: 'marcioCard', member: 'marcio', amount: 45000n, day: 12, starts_on: '2026-02-01', installments_total: 10 },
]

const variable = [
  { description: 'Supermarket', category: 'Groceries', account: 'joint', member: null, day: 8, amount: vary(62000n, 3100, 15000) },
  { description: 'Supermarket', category: 'Groceries', account: 'joint', member: null, day: 22, amount: vary(48000n, 4300, 12000) },
  { description: 'Fuel', category: 'Transport', account: 'marcioCard', member: 'marcio', day: 17, amount: vary(26000n, 2900, 8000) },
  { description: 'Restaurant', category: 'Leisure', account: 'gabriela', member: 'gabriela', day: 14, amount: vary(18000n, 2300, 9000) },
  { description: 'Pharmacy', category: 'Health', account: 'marcioCard', member: null, day: 3, amount: vary(9000n, 1300, 5000) },
] as const

const debts = [
  { creditor: 'Financeira Exemplo', description: 'Car financing', member: null, account: 'joint', principal: 4800000n, rate: '1.2900', installment: 130000n, total: 48, starts_on: '2024-11-01', day: 12 },
  { creditor: 'Banco Horizonte', description: 'Personal loan', member: 'gabriela', account: 'gabriela', principal: 1200000n, rate: '2.1000', installment: 112000n, total: 12, starts_on: '2026-03-01', day: 25 },
] as const

const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7))

const settle = (description: string, due_on: string) => {
  const current = due_on.slice(0, 7) === seedToday.slice(0, 7)
  if (current && lateInCurrentMonth.has(description) && due_on < seedToday) return { status: 'late' }
  return due_on < seedToday ? { status: 'paid', paid_on: due_on } : { status: 'planned' }
}

const plant = async (ledger: Writer) => {
  const id = (row: Row) => row.id as bigint
  const members = {
    marcio: id(await ledger.create('member', { name: 'Marcio', share_percent: 50 })),
    gabriela: id(await ledger.create('member', { name: 'Gabriela', share_percent: 50 })),
  }
  const memberOf = (key: MemberKey | null) => (key ? members[key] : null)

  const accountIds = {} as Record<AccountKey, bigint>
  for (const [key, { member, ...values }] of Object.entries(accounts)) {
    accountIds[key as AccountKey] = id(await ledger.create('account', { ...values, member_id: memberOf(member) }))
  }

  const categoryIds = new Map<string, bigint>()
  for (const [kind, names] of Object.entries(categories)) {
    for (const name of names) categoryIds.set(name, id(await ledger.create('category', { name, kind })))
  }
  const category = (name: string) => categoryIds.get(name) as bigint

  const entry = (values: Row & { description: string; due_on: string }) => ledger.create('entry', { origin: 'manual', competence: day(values.due_on, 1), ...values, ...settle(values.description, values.due_on) })

  for (const income of incomes) {
    const { id: income_id } = await ledger.create('income', { description: income.description, member_id: members[income.member], category_id: category('Salary'), account_id: accountIds[income.account], amount_cents: income.amount, day_of_month: income.day, starts_on: '2024-01-01' })
    for (const month of seedMonths) {
      await entry({ description: income.description, due_on: day(month, income.day), direction: 'income', amount_cents: income.amount, category_id: category('Salary'), account_id: accountIds[income.account], member_id: members[income.member], income_id })
    }
  }

  for (const [index, month] of seedMonths.entries()) {
    if (index % 3 === 2) await entry({ description: 'Design freelance', due_on: day(month, 20), direction: 'income', amount_cents: 150000n + BigInt(index * 10000), category_id: category('Freelance'), account_id: accountIds.gabriela, member_id: members.gabriela })
  }

  for (const expense of recurring) {
    const ends_on = expense.installments_total ? day(addMonths(expense.starts_on, expense.installments_total - 1), 28) : null
    const { id: recurring_expense_id } = await ledger.create('recurring_expense', {
      description: expense.description,
      category_id: category(expense.category),
      account_id: accountIds[expense.account],
      member_id: memberOf(expense.member),
      amount_cents: expense.amount,
      day_of_month: expense.day,
      installments_total: expense.installments_total ?? null,
      starts_on: expense.starts_on,
      ends_on,
    })
    for (const [index, month] of seedMonths.entries()) {
      if (month < expense.starts_on || (ends_on && month > ends_on)) continue
      const installment_number = expense.installments_total ? monthsBetween(expense.starts_on, month) + 1 : null
      await entry({
        description: expense.description,
        due_on: day(month, expense.day),
        direction: 'expense',
        amount_cents: expense.actual?.(index) ?? expense.amount,
        category_id: category(expense.category),
        account_id: accountIds[expense.account],
        member_id: memberOf(expense.member),
        recurring_expense_id,
        installment_number,
      })
    }
  }

  for (const [index, month] of seedMonths.entries()) {
    for (const expense of variable) {
      await entry({ description: expense.description, due_on: day(month, expense.day), direction: 'expense', amount_cents: expense.amount(index), category_id: category(expense.category), account_id: accountIds[expense.account], member_id: memberOf(expense.member) })
    }
  }

  for (const debt of debts) {
    const dueDates = Array.from({ length: debt.total }, (_, index) => day(addMonths(debt.starts_on, index), debt.day))
    const paid = dueDates.filter((due) => due < seedToday).length
    const { id: debt_id } = await ledger.create('debt', {
      creditor: debt.creditor,
      description: debt.description,
      member_id: memberOf(debt.member),
      account_id: accountIds[debt.account],
      principal_cents: debt.principal,
      balance_cents: debt.installment * BigInt(debt.total - paid),
      monthly_rate_percent: debt.rate,
      installment_cents: debt.installment,
      installments_total: debt.total,
      installments_paid: paid,
      starts_on: debt.starts_on,
    })
    for (const [index, due_on] of dueDates.entries()) {
      if (due_on < firstMonth || due_on.slice(0, 7) > seedToday.slice(0, 7)) continue
      await entry({ description: debt.description, due_on, direction: 'expense', amount_cents: debt.installment, category_id: category('Debt'), account_id: accountIds[debt.account], member_id: memberOf(debt.member), debt_id, installment_number: index + 1 })
    }
  }

  await ledger.create('reserve', { name: 'Emergency fund', account_id: accountIds.savings, balance_cents: 1800000n, target_cents: 3000000n })
  await ledger.create('goal', { name: 'Trip to Lisbon', target_cents: 1200000n, saved_cents: 450000n, due_on: '2027-07-01' })
  return members
}

export const seed = async (client: Client) => {
  const { rows } = await client.query<{ total: number }>('select count(*)::int as total from member')
  if (rows[0]?.total) throw new Error('database already has members, run db:reset before seeding')
  return write(client, { author: 'system' }, plant)
}

if (import.meta.main) {
  const client = await connect()
  try {
    await seed(client)
    const decisions = await seedDecisions(client)
    const { rows } = await client.query<{ total: number }>('select count(*)::int as total from entry')
    console.log(`seeded ${rows[0]?.total} entries from ${seedMonths[0]} to ${seedMonths.at(-1)} and ${decisions} decisions`)
  } finally {
    await client.end()
  }
}
