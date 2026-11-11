import { useSyncExternalStore } from 'react'

export interface Shop {
  name: string
  footer: string
}

const KEY = 'shop2'
const DEFAULT: Shop = { name: 'Береке', footer: '' }

function load(): Shop {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && typeof v === 'object') return { name: String(v.name ?? DEFAULT.name), footer: String(v.footer ?? '') }
  } catch {
    /* ignore */
  }
  return DEFAULT
}

let current: Shop = load()
const subs = new Set<() => void>()

/** Название магазина и текст на чеке. Хранятся на устройстве. */
export const shop = {
  get: () => current,
  set(next: Partial<Shop>) {
    current = { ...current, ...next }
    try {
      localStorage.setItem(KEY, JSON.stringify(current))
    } catch {
      /* ignore */
    }
    subs.forEach((f) => f())
  },
}

export function useShop(): Shop {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => current,
  )
}
