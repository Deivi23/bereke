/**
 * Адрес и публичный ключ проекта Supabase.
 * Ключ «anon» публичный по замыслу: данные защищены входом по паролю и правилами базы (см. supabase/schema.sql).
 * Если поля пустые, приложение предложит ввести их на странице «Ещё» (хранятся на устройстве).
 */
export const SUPABASE_URL = ''
export const SUPABASE_ANON_KEY = ''

export function getSyncConfig(): { url: string; key: string } | null {
  let url = SUPABASE_URL
  let key = SUPABASE_ANON_KEY
  if (!url || !key) {
    try {
      url = localStorage.getItem('sb_url') ?? ''
      key = localStorage.getItem('sb_key') ?? ''
    } catch {
      /* ignore */
    }
  }
  return url && key ? { url, key } : null
}

export function saveSyncConfig(url: string, key: string) {
  localStorage.setItem('sb_url', url.trim().replace(/\/+$/, ''))
  localStorage.setItem('sb_key', key.trim())
}

export function clearSyncConfig() {
  localStorage.removeItem('sb_url')
  localStorage.removeItem('sb_key')
}
