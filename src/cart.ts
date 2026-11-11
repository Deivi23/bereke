import { useSyncExternalStore } from 'react'

export interface CartLine {
  productId: string
  qty: number
}

const KEY = 'cart'

function load(): CartLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((l) => typeof l?.productId === 'string') : []
  } catch {
    return []
  }
}

let lines: CartLine[] = load()
const subs = new Set<() => void>()

function set(next: CartLine[]) {
  lines = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f())
}

/** Корзина живёт вне страницы, поэтому не теряется при переключении вкладок. */
export const cart = {
  add(productId: string, qty = 1) {
    const i = lines.findIndex((l) => l.productId === productId)
    if (i >= 0) set(lines.map((l, j) => (j === i ? { ...l, qty: Math.round((l.qty + qty) * 1000) / 1000 } : l)))
    else set([...lines, { productId, qty }])
  },
  setQty(productId: string, qty: number) {
    set(lines.map((l) => (l.productId === productId ? { ...l, qty } : l)))
  },
  remove(productId: string) {
    set(lines.filter((l) => l.productId !== productId))
  },
  clear() {
    set([])
  },
}

export function useCartLines(): CartLine[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => lines,
  )
}
