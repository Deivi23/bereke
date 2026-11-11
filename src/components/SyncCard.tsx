import { useState } from 'react'
import { clearSyncConfig, getSyncConfig, saveSyncConfig, SUPABASE_URL } from '../syncConfig'
import { getClient, sync, useSession, useSyncStatus } from '../syncRuntime'
import { fmtDate, useI18n } from '../i18n'

/** Настройка синхронизации: подключение сервера, вход, состояние. */
export default function SyncCard() {
  const { t } = useI18n()
  const status = useSyncStatus()
  const session = useSession()
  const cfg = getSyncConfig()
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const connect = () => {
    if (!url.trim() || !key.trim()) return
    saveSyncConfig(url, key)
    location.reload()
  }

  const signIn = async () => {
    setBusy(true)
    setError('')
    const { error: err } = await getClient()!.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(`${t('authError')} (${err.message})`)
    else setPassword('')
  }

  return (
    <div className="card">
      <b>☁ {t('syncTitle')}</b>
      <p className="muted small">{t('syncHint')}</p>

      {!cfg && (
        <>
          <p className="small">{t('syncNoServer')}</p>
          <label>
            {t('serverUrl')}
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="none" />
          </label>
          <label>
            {t('serverKey')}
            <input value={key} onChange={(e) => setKey(e.target.value)} autoCapitalize="none" />
          </label>
          <button className="btn" onClick={connect}>
            {t('connect')}
          </button>
        </>
      )}

      {cfg && session === null && (
        <>
          {error && <div className="notice error">{error}</div>}
          <label>
            {t('email')}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
          </label>
          <label>
            {t('password')}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn" disabled={busy} onClick={signIn}>
            {t('signIn')}
          </button>
        </>
      )}

      {cfg && session && (
        <>
          <p className="small">
            {t('signedInAs')}: <b>{session.user.email}</b>
          </p>
          <p className={status.state === 'error' ? 'small debt' : 'small'}>
            {status.state === 'syncing' && t('syncRunning')}
            {status.state === 'idle' && status.pending === 0 && `✓ ${t('syncOk')}`}
            {status.state === 'idle' && status.pending > 0 && `${t('syncWaiting')}: ${status.pending}`}
            {status.state === 'offline' && t('syncOffline')}
            {status.state === 'error' && `${t('syncError')}: ${status.error}`}
            {status.lastSync && <span className="muted"> · {t('lastSync')}: {fmtDate(status.lastSync)}</span>}
          </p>
          <div className="row">
            <button className="btn" onClick={() => sync.syncNow()}>
              {t('syncNow')}
            </button>
            <button className="btn secondary" onClick={() => getClient()!.auth.signOut()}>
              {t('signOut')}
            </button>
          </div>
        </>
      )}

      {cfg && !session && !SUPABASE_URL && (
        <button
          className="link small"
          onClick={() => {
            clearSyncConfig()
            location.reload()
          }}
        >
          {t('disconnectServer')}
        </button>
      )}
    </div>
  )
}
