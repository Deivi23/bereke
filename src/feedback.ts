let ctx: AudioContext | null = null

/** Короткий звук + вибрация при успешном скане. */
export function beep(ok = true) {
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = ok ? 1200 : 300
    g.gain.value = 0.08
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.09 : 0.25))
  } catch {
    /* звук необязателен */
  }
  try {
    navigator.vibrate?.(ok ? 40 : [80, 40, 80])
  } catch {
    /* ignore */
  }
}
