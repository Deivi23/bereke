import { useEffect, useState, useSyncExternalStore } from 'react'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { db, store, type RemoteRow } from './db'
import { createSyncEngine, type Remote } from './sync'
import { getSyncConfig } from './syncConfig'

let client: SupabaseClient | null = null

export function getClient(): SupabaseClient | null {
  if (client) return client
  const cfg = getSyncConfig()
  if (!cfg) return null
  client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } })
  return client
}

const remote: Remote = {
  async push(rows) {
    const c = getClient()!
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => ({ id: r.id, kind: r.kind, data: r.data, deleted: r.deleted }))
      const { error } = await c.from('records').upsert(chunk, { onConflict: 'id' })
      if (error) throw new Error(error.message)
    }
  },
  async pull(afterSeq, limit) {
    const c = getClient()!
    const { data, error } = await c
      .from('records')
      .select('seq,id,kind,data,deleted')
      .gt('seq', afterSeq)
      .order('seq', { ascending: true })
      .limit(limit)
    if (error) throw new Error(error.message)
    return (data ?? []) as RemoteRow[]
  },
}

export const sync = createSyncEngine(db, store, remote)

/** Запускает синхронизацию, когда пользователь вошёл, и останавливает при выходе. */
export function initSync() {
  const c = getClient()
  if (!c) return
  c.auth.getSession().then(({ data }) => (data.session ? sync.start() : sync.stop()))
  c.auth.onAuthStateChange((_e, session) => (session ? sync.start() : sync.stop()))
}

export function useSyncStatus() {
  return useSyncExternalStore(sync.subscribe, sync.getStatus)
}

/** undefined — ещё загружается, null — не вошёл. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const c = getClient()
    if (!c) return setSession(null)
    c.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = c.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}
