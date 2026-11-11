import { Link } from 'react-router-dom'
import { getSyncConfig } from '../syncConfig'
import { useSession, useSyncStatus } from '../syncRuntime'
import { useI18n } from '../i18n'

/** Маленький индикатор синхронизации. Показывается только если сервер подключён. */
export default function SyncBadge() {
  const { t } = useI18n()
  const status = useSyncStatus()
  const session = useSession()
  if (!getSyncConfig()) return null

  let text: string
  let cls = 'sync-badge'
  if (!session) {
    text = t('syncStopped')
    cls += ' warn'
  } else if (status.state === 'syncing') text = t('syncRunning')
  else if (status.state === 'offline') {
    text = `${t('syncOffline').split('.')[0]}${status.pending ? ` · ${status.pending}` : ''}`
    cls += ' warn'
  } else if (status.state === 'error') {
    text = t('syncError')
    cls += ' bad'
  } else if (status.pending > 0) text = `${t('syncWaiting')}: ${status.pending}`
  else text = `✓ ${t('syncOk')}`

  return (
    <Link to="/more" className={cls}>
      ☁ {text}
    </Link>
  )
}
