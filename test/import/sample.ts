import { randomBytes } from 'node:crypto'

export const freshHash = () => randomBytes(32).toString('hex')

export const sample = {
  candidates: [
    { kind: 'entry', source: '2026-10!A3:G3', confidence: 0.95, payload: { date: '2026-10-10', description: 'Aluguel', direction: 'expense', amountCents: 150000, category: 'Moradia', account: 'Conta conjunta', member: 'joint', paid: true } },
    { kind: 'entry', source: '2026-10!A4:G4', confidence: 0.6, payload: { date: '2026-10-15', description: 'Farmácia', direction: 'expense', amountCents: 8990, category: 'Saúde', member: 'GMA', paid: false, installment: { number: 2, total: 3 } } },
    { kind: 'account', source: '$.accounts[0]', confidence: 0.9, payload: { institution: 'Banco Ficticio', nickname: 'Cartão Marcio', lastFour: '4321', kind: 'credit_card', member: 'Marcio' } },
    { kind: 'category', source: '$.categories[2]', confidence: 1, payload: { name: 'Pets', kind: 'expense' } },
    { kind: 'income', source: 'p1:L2', confidence: 0.8, payload: { description: 'Salário', amountCents: 900000, dayOfMonth: 5, startsOn: '2026-01-01', member: 'Gabriela' } },
    { kind: 'recurring_expense', source: 'p1:L4', confidence: 0.8, payload: { description: 'Internet', amountCents: 12000, dayOfMonth: 20, startsOn: '2026-01-01', category: 'Contas da casa' } },
    { kind: 'debt', source: 'Dívidas!A2:F2', confidence: 0.7, payload: { creditor: 'Financeira Exemplo', description: 'Empréstimo do carro', principalCents: 3000000, balanceCents: 1800000, installmentsTotal: 24, installmentsPaid: 10, startsOn: '2025-12-01' } },
    { kind: 'reserve', source: 'Metas!A2:C2', confidence: 0.9, payload: { name: 'Reserva de emergência', balanceCents: 500000, targetCents: 3000000 } },
    { kind: 'goal', source: 'Metas!A3:C3', confidence: 0.9, payload: { name: 'Viagem', targetCents: 1200000, savedCents: 0, dueOn: '2027-07-01' } },
  ],
  questions: [{ question: 'GMA é a Gabriela?', options: ['Sim', 'Não'], source: '2026-10!E4', candidate: 1 }],
}
