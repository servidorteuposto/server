export type AlcoholKind = 'none' | 'gasoline' | 'ethanol'

function parseDecimalInput(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function roundAlcoholPercent(value: number): number {
  return Math.round(value * 10) / 10
}

export function formatAlcoholDecimal(value: number): string {
  return roundAlcoholPercent(value).toFixed(1).replace('.', ',')
}

function parseStoredAlcoholValue(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim()
  return parseDecimalInput(cleaned)
}

export function alcoholKindForProductKey(productKey: string): AlcoholKind {
  if (productKey.startsWith('etanol-')) return 'ethanol'
  if (productKey.startsWith('gasolina-')) return 'gasoline'
  return 'none'
}

export function alcoholWhatsAppTipoLabel(kind: AlcoholKind): string {
  if (kind === 'ethanol') return 'Teor Alcoólico ºINPM (calculado):'
  if (kind === 'gasoline') return 'Teor Alcoólico (% v/v) (calculado):'
  return ''
}

export function alcoholWhatsAppTeorValue(
  raw: string | null | undefined,
  kind: AlcoholKind,
): string {
  if (!raw?.trim() || kind === 'none') return ''
  const value = parseStoredAlcoholValue(raw)
  if (value == null) return raw.trim()
  if (kind === 'ethanol') return `${formatAlcoholDecimal(value)} ºINPM`
  if (kind === 'gasoline') return `${formatAlcoholDecimal(value)} % v/v`
  return ''
}
