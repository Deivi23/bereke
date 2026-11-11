/** Контрольная цифра EAN-13 по первым 12 цифрам. */
export function ean13Check(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13Check(code.slice(0, 12)) === Number(code[12])
}

/**
 * Свой внутренний штрихкод для товаров без заводского кода.
 * Префикс 2 зарезервирован стандартом GS1 для внутреннего использования магазина.
 */
export function generateInternalCode(existing: Set<string>): string {
  for (let i = 0; i < 1000; i++) {
    const body = '2' + String(Math.floor(Math.random() * 1e11)).padStart(11, '0')
    const code = body + ean13Check(body)
    if (!existing.has(code)) return code
  }
  throw new Error('cannot generate code')
}
