import { useEffect, useState } from 'react'

const parse = (s: string) => {
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

/** Количество: кнопки −/+ для штучного товара, свободный ввод для весового. */
export default function QtyInput({
  value,
  onChange,
  step,
}: {
  value: number
  onChange: (v: number) => void
  step: number
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    if (parse(text) !== value) setText(String(value))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const bump = (d: number) => {
    const next = Math.max(step, Math.round((value + d) * 1000) / 1000)
    onChange(next)
  }

  return (
    <div className="qty">
      <button className="btn secondary" onClick={() => bump(-step)} aria-label="−">
        −
      </button>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const v = parse(e.target.value)
          if (v > 0) onChange(v)
        }}
        onBlur={() => setText(String(value))}
        onFocus={(e) => e.target.select()}
      />
      <button className="btn secondary" onClick={() => bump(step)} aria-label="+">
        +
      </button>
    </div>
  )
}
