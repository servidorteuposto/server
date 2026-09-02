const FUEL_ASPECTO_HLIMP_LABEL = 'Homogênea Límpida e Isenta de Impurezas'
const FUEL_ASPECTO_TURVA_LABEL = 'Turva com Impurezas'

function canonicalAspectoLabel(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) return null
  const upper = normalized.toUpperCase()
  if (upper === 'HLIMP' || upper.startsWith('HLIMP ')) return FUEL_ASPECTO_HLIMP_LABEL
  if (upper === 'TURVA' || /turva/i.test(normalized)) return FUEL_ASPECTO_TURVA_LABEL
  return null
}

export function formatFuelAspecto(value: string | null | undefined): string {
  if (!value?.trim()) return ''
  return canonicalAspectoLabel(value) ?? value.trim()
}
