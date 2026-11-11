import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { isValidEan13 } from '../barcode'

export default function BarcodeSvg({ value, height = 30 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    try {
      JsBarcode(ref.current, value, {
        format: isValidEan13(value) ? 'EAN13' : 'CODE128',
        width: 1.6,
        height,
        fontSize: 11,
        margin: 0,
        textMargin: 1,
        displayValue: true,
      })
    } catch {
      /* код не подходит для рисования — оставляем пусто */
    }
  }, [value, height])
  return <svg ref={ref} className="barcode-svg" />
}
