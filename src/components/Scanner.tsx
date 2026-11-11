import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector as PonyDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { useI18n } from '../i18n'
import { beep } from '../feedback'

// Свой wasm-файл (кэшируется приложением), чтобы сканер работал без интернета.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
})

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] as const

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

function createDetector(): Detector {
  const Native = (window as unknown as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector
  if (Native) {
    try {
      return new Native({ formats: [...FORMATS] })
    } catch {
      /* fall through */
    }
  }
  return new PonyDetector({ formats: [...FORMATS] }) as unknown as Detector
}

interface Props {
  onDetect: (code: string) => void
  /** Не реагировать на один и тот же код чаще, чем раз в N мс */
  cooldownMs?: number
}

export default function Scanner({ onDetect, cooldownMs = 2500 }: Props) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  const cb = useRef(onDetect)
  cb.current = onDetect

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer = 0
    const last = { code: '', at: 0 }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        setError(true)
        return
      }
      if (stopped) {
        stream.getTracks().forEach((tr) => tr.stop())
        return
      }
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => undefined)
      const detector = createDetector()

      const tick = async () => {
        if (stopped) return
        try {
          if (video.readyState >= 2) {
            const found = await detector.detect(video)
            const code = found[0]?.rawValue
            const now = Date.now()
            if (code && !(code === last.code && now - last.at < cooldownMs)) {
              last.code = code
              last.at = now
              beep()
              cb.current(code)
            }
          }
        } catch {
          /* кадр не распознан — пробуем дальше */
        }
        timer = window.setTimeout(tick, 140)
      }
      tick()
    }

    start()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [cooldownMs])

  if (error) return <div className="notice error">{t('cameraError')}</div>

  return (
    <div className="scanner">
      <video ref={videoRef} playsInline muted />
      <div className="scan-frame" />
    </div>
  )
}
