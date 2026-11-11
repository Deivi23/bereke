import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

/**
 * Поле для ввода кода. Работает и для ручного ввода, и для USB/Bluetooth-сканера
 * (он «печатает» код и жмёт Enter).
 */
export default function CodeInput({
  onSubmit,
  autoFocus = false,
  placeholder,
}: {
  onSubmit: (code: string) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onSubmit(v)
    setValue('')
    if (autoFocus) ref.current?.focus()
  }

  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        ref={ref}
        value={value}
        inputMode="numeric"
        placeholder={placeholder ?? t('manualCode')}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="btn">
        {t('find')}
      </button>
    </form>
  )
}
