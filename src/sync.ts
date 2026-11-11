import { liveQuery } from 'dexie'
import type { BerekeDB, RemoteRow, Store } from './db'

/** Сервер: хранит записи и отдаёт их по порядку изменения (seq). */
export interface Remote {
  push(rows: RemoteRow[]): Promise<void>
  pull(afterSeq: number, limit: number): Promise<RemoteRow[]>
}

export interface SyncStatus {
  state: 'stopped' | 'idle' | 'syncing' | 'offline' | 'error'
  /** Сколько записей ждёт отправки */
  pending: number
  lastSync: number | null
  error: string
}

const PAGE = 1000
/**
 * Номера seq на сервере могут появляться не строго по порядку (две записи в один момент),
 * поэтому каждый раз читаем с небольшим запасом назад. Повторное применение безопасно.
 */
const OVERLAP = 200

const onlineNow = () => typeof navigator === 'undefined' || navigator.onLine !== false

export function createSyncEngine(db: BerekeDB, store: Store, remote: Remote) {
  let status: SyncStatus = { state: 'stopped', pending: 0, lastSync: null, error: '' }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch }
    listeners.forEach((f) => f())
  }

  let running = false
  let again = false
  let stopFns: (() => void)[] = []
  let debounce: ReturnType<typeof setTimeout> | undefined

  async function pullAll() {
    let cursor = (await store.getMeta<number>('cursor')) ?? 0
    let from = Math.max(0, cursor - OVERLAP)
    for (;;) {
      const rows = await remote.pull(from, PAGE)
      if (!rows.length) break
      await store.applyRows(rows, false)
      const last = rows[rows.length - 1].seq ?? from
      from = last
      cursor = Math.max(cursor, last)
      if (rows.length < PAGE) break
    }
    await store.setMeta('cursor', cursor)
  }

  async function pushAll() {
    for (;;) {
      const { items, rows } = await store.pendingRows(300)
      if (!items.length) break
      if (rows.length) await remote.push(rows)
      await store.ackPushed(items)
    }
  }

  async function syncNow(): Promise<void> {
    if (running) {
      again = true
      return
    }
    if (!onlineNow()) {
      set({ state: 'offline', error: '' })
      return
    }
    running = true
    set({ state: 'syncing', error: '' })
    try {
      await pullAll()
      await pushAll()
      set({ state: 'idle', lastSync: Date.now(), error: '' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const network = !onlineNow() || /fetch|network|load failed/i.test(msg)
      set({ state: network ? 'offline' : 'error', error: network ? '' : msg })
    } finally {
      running = false
      if (again) {
        again = false
        setTimeout(syncNow, 500)
      }
    }
  }

  /** Запускает автоматическую синхронизацию: при изменениях, раз в минуту, при возврате связи. */
  function start() {
    if (stopFns.length) return
    const sub = liveQuery(() => db.outbox.count()).subscribe((n) => {
      set({ pending: n })
      if (n > 0) {
        clearTimeout(debounce)
        debounce = setTimeout(syncNow, 1500)
      }
    })
    const timer = setInterval(syncNow, 60_000)
    const onOnline = () => syncNow()
    const onVisible = () => document.visibilityState === 'visible' && syncNow()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline)
      document.addEventListener('visibilitychange', onVisible)
    }
    stopFns = [
      () => sub.unsubscribe(),
      () => clearInterval(timer),
      () => clearTimeout(debounce),
      () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', onOnline)
          document.removeEventListener('visibilitychange', onVisible)
        }
      },
    ]
    set({ state: 'idle' })
    syncNow()
  }

  function stop() {
    stopFns.forEach((f) => f())
    stopFns = []
    set({ state: 'stopped' })
  }

  return {
    syncNow,
    start,
    stop,
    getStatus: () => status,
    subscribe: (f: () => void) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
  }
}

export type SyncEngine = ReturnType<typeof createSyncEngine>
