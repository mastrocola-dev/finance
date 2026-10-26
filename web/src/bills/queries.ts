import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useIdentity } from '../identity/identity-provider.tsx'
import { today } from '../lib/format.ts'
import type { Entry } from '../overview/model.ts'
import { unwrap } from '../query/client.ts'
import { withPayment } from './model.ts'

export type Payment = { bill: Entry; paid: boolean }

const billsKey = (month: string) => ['entries', 'bills', month]

export const useBills = (month: string) => {
  const { api } = useIdentity()
  return useQuery({ queryKey: billsKey(month), queryFn: async () => unwrap(await api.GET('/api/months/{month}/entries', { params: { path: { month }, query: { direction: 'expense' } } })) })
}

export type PaymentHandlers = { onSuccess: (payment: Payment) => void; onError: (error: Error, payment: Payment) => void }

export const usePayment = (month: string, handlers: PaymentHandlers) => {
  const { api } = useIdentity()
  const queryClient = useQueryClient()
  const replace = (bill: Entry) => queryClient.setQueryData<Entry[]>(billsKey(month), (bills) => bills?.map((current) => (current.id === bill.id ? bill : current)))
  return useMutation({
    mutationKey: ['payment'],
    scope: { id: 'payment' },
    mutationFn: async ({ bill, paid }: Payment) => {
      const params = { path: { id: bill.id } }
      return unwrap(paid ? await api.POST('/api/entries/{id}/paid', { params, body: {} }) : await api.POST('/api/entries/{id}/unpaid', { params }))
    },
    onMutate: async ({ bill, paid }) => {
      await queryClient.cancelQueries({ queryKey: billsKey(month) })
      const previous = queryClient.getQueryData<Entry[]>(billsKey(month))?.find((current) => current.id === bill.id) ?? bill
      replace(withPayment(previous, paid, today()))
      return previous
    },
    onError: (error, payment, previous) => {
      if (previous) replace(previous)
      handlers.onError(error, payment)
    },
    onSuccess: (bill, payment) => {
      replace(bill)
      handlers.onSuccess(payment)
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['payment'] }) > 1) return
      return Promise.all(['entries', 'split', 'audit'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
    },
  })
}
