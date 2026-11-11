import { useSyncExternalStore } from 'react'

export interface CartLine {
  productId: string
  qty: number
}

export interface Discount {
  kind: 'percent' | 'amount'
  value: number
}

export interface ParkedCart {
  id: string
  savedAt: number
  lines: CartLine[]
  discount: Discount | null
}

interface CartState {
  lines: CartLine[]
  discount: Discount | null
  parked: ParkedCart[]
}

const KEY = 'cart2'

function load(): CartState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && Array.isArray(v.lines)) {
      return {
        lines: v.lines.filter((l: CartLine) => typeof l?.productId === 'string'),
        discount: v.discount ?? null,
        parked: Array.isArray(v.parked) ? v.parked : [],
      }
    }
  } catch {
    /* ignore */
  }
  return { lines: [], discount: null, parked: [] }
}

let state: CartState = load()
const subs = new Set<() => void>()

function set(next: Partial<CartState>) {
  state = { ...state, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f())
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Корзина живёт вне страницы, поэтому не теряется при переключении вкладок. */
export const cart = {
  add(productId: string, qty = 1) {
    const i = state.lines.findIndex((l) => l.productId === productId)
    if (i >= 0) set({ lines: state.lines.map((l, j) => (j === i ? { ...l, qty: round3(l.qty + qty) } : l)) })
    else set({ lines: [...state.lines, { productId, qty }] })
  },
  setQty(productId: string, qty: number) {
    set({ lines: state.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)) })
  },
  remove(productId: string) {
    set({ lines: state.lines.filter((l) => l.productId !== productId) })
  },
  clear() {
    set({ lines: [], discount: null })
  },
  setDiscount(discount: Discount | null) {
    set({ discount })
  },
  /** Отложить текущий чек (покупатель пошёл за ещё одним товаром). */
  park() {
    if (!state.lines.length) return
    const p: ParkedCart = { id: String(Date.now()), savedAt: Date.now(), lines: state.lines, discount: state.discount }
    set({ parked: [...state.parked, p], lines: [], discount: null })
  },
  /** Вернуть отложенный чек; текущий, если он не пуст, откладывается. */
  resume(id: string) {
    const p = state.parked.find((x) => x.id === id)
    if (!p) return
    const rest = state.parked.filter((x) => x.id !== id)
    if (state.lines.length) {
      rest.push({ id: String(Date.now()), savedAt: Date.now(), lines: state.lines, discount: state.discount })
    }
    set({ parked: rest, lines: p.lines, discount: p.discount })
  },
  dropParked(id: string) {
    set({ parked: state.parked.filter((x) => x.id !== id) })
  },
}

export function useCart(): CartState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state,
  )
}

/** Скидка в тенге от суммы чека. */
export function discountAmount(subtotal: number, d: Discount | null): number {
  if (!d || d.value <= 0) return 0
  const v = d.kind === 'percent' ? Math.round((subtotal * Math.min(d.value, 100)) / 100) : Math.round(d.value)
  return Math.min(v, subtotal)
}
