import { productAlcoholKind, type FuelProductKey } from './fuel-analyses'
import { parseDecimalInput } from './fuel-density'

export type AlcoholKind = 'none' | 'gasoline' | 'ethanol'

/** Arredonda para 1 casa decimal (93,47 → 93,5; 94,36 → 94,4). */
export function roundAlcoholPercent(value: number): number {
  return Math.round(value * 10) / 10
}

/** Formata número com 1 casa decimal usando vírgula. */
export function formatAlcoholDecimal(value: number): string {
  return roundAlcoholPercent(value).toFixed(1).replace('.', ',')
}

/** Valor cru arredondado para persistência (sem unidade). */
export function normalizeAlcoholTeorForStorage(raw: string): string {
  const value = parseDecimalInput(raw)
  if (value == null) return raw.trim()
  return formatAlcoholDecimal(value)
}

function parseStoredAlcoholValue(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim()
  return parseDecimalInput(cleaned)
}

/** Teor formatado para exibição (cadastro, QR, histórico). */
export function formatStoredAlcoholTeor(
  raw: string | null | undefined,
  kind: AlcoholKind,
): string {
  if (!raw?.trim() || kind === 'none') return ''
  const value = parseStoredAlcoholValue(raw)
  if (value == null) return raw.trim()
  if (kind === 'ethanol') return `${formatAlcoholDecimal(value)} °INPM`
  if (kind === 'gasoline') return `${formatAlcoholDecimal(value)} % v/v`
  return raw.trim()
}

/** Rótulo do campo no formulário ou na página pública. */
export function alcoholFieldLabel(
  kind: AlcoholKind,
  context: 'form' | 'display' = 'form',
): string | null {
  if (kind === 'ethanol') {
    return context === 'form' ? 'Teor alcoólico °INPM (calculado)' : 'Teor alcoólico (°INPM)'
  }
  if (kind === 'gasoline') {
    return 'Teor alcoólico (% v/v)'
  }
  return null
}

/** Rótulo no PDF (sem acentos). */
export function alcoholPdfLabel(kind: AlcoholKind): string | null {
  if (kind === 'ethanol') return 'Teor alcoolico (INPM)'
  if (kind === 'gasoline') return 'Teor alcoolico (% v/v)'
  return null
}

/** Variável {{tipo}} do modelo aviso_raq_fora na Meta. */
export function alcoholWhatsAppTipoLabel(kind: AlcoholKind): string {
  if (kind === 'ethanol') return 'Teor Alcoólico ºINPM (calculado):'
  if (kind === 'gasoline') return 'Teor Alcoólico (% v/v) (calculado):'
  return ''
}

/** Variável {{teor}} do modelo aviso_raq_fora na Meta. */
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

export function alcoholKindForProduct(productKey: FuelProductKey | string): AlcoholKind {
  return productAlcoholKind(productKey as FuelProductKey)
}
