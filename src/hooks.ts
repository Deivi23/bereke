import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

/** Долг каждого клиента: id -> сумма (долги минус оплаты). */
export function useBalances(): Map<number, number> | undefined {
  return useLiveQuery(async () => {
    const m = new Map<number, number>()
    await db.ledger.each((e) => {
      m.set(e.customerId, (m.get(e.customerId) ?? 0) + (e.type === 'debt' ? e.amount : -e.amount))
    })
    return m
  }, [])
}
