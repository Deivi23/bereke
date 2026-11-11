import { useEffect, useRef, useState } from 'react'
import { exportAll, importAll } from '../db'
import { decodeBytes, exportProductsCsv, importProductsCsv } from '../csv'
import { useI18n, type Lang } from '../i18n'

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>
}

export default function More() {
  const { t, lang, setLang } = useI18n()
  const [msg, setMsg] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [installEv, setInstallEv] = useState<InstallEvent | null>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted)
    const h = (e: Event) => {
      e.preventDefault()
      setInstallEv(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  const day = new Date().toISOString().slice(0, 10)

  const onJson = async (f?: File) => {
    if (!f) return
    if (!confirm(t('importWarn'))) return
    try {
      const r = await importAll(await f.text())
      setMsg(`${t('importDone')}: ${r.products}`)
    } catch {
      setMsg(t('importError'))
    }
  }

  const onCsv = async (f?: File) => {
    if (!f) return
    try {
      const r = await importProductsCsv(decodeBytes(await f.arrayBuffer()))
      setMsg(`${t('csvDone')}: +${r.added}, ↻${r.updated}, ${t('csvSkipped')}: ${r.skipped}`)
    } catch {
      setMsg(t('importError'))
    }
  }

  return (
    <div className="page">
      <h1>{t('moreTitle')}</h1>
      {msg && <div className="notice ok">{msg}</div>}

      <div className="card">
        <b>{t('language')}</b>
        <div className="chips">
          {(['ru', 'kk'] as Lang[]).map((l) => (
            <button key={l} className={lang === l ? 'chip active' : 'chip'} onClick={() => setLang(l)}>
              {l === 'ru' ? 'Русский' : 'Қазақша'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <b>{t('csvTitle')}</b>
        <p className="muted small">{t('csvHint')}</p>
        <div className="row">
          <button className="btn" onClick={() => csvRef.current?.click()}>
            {t('csvButton')}
          </button>
          <button
            className="btn secondary"
            onClick={async () => download(`bereke-products-${day}.csv`, await exportProductsCsv(), 'text/csv;charset=utf-8')}
          >
            {t('csvExport')}
          </button>
        </div>
        <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => (onCsv(e.target.files?.[0]), (e.target.value = ''))} />
      </div>

      <div className="card">
        <b>{t('backup')}</b>
        <p className="muted small">{t('backupHint')}</p>
        <div className="row">
          <button className="btn" onClick={async () => download(`bereke-backup-${day}.json`, await exportAll(), 'application/json')}>
            {t('export')}
          </button>
          <button className="btn secondary" onClick={() => jsonRef.current?.click()}>
            {t('import')}
          </button>
        </div>
        <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => (onJson(e.target.files?.[0]), (e.target.value = ''))} />
      </div>

      <div className="card">
        <b>{t('storage')}</b>
        <p className="muted small">{persisted ? `✓ ${t('storageOk')}` : t('storageWarn')}</p>
        {installEv && (
          <button className="btn" onClick={() => installEv.prompt()}>
            {t('install')}
          </button>
        )}
      </div>
    </div>
  )
}
