import { FUEL_PRODUCTS, type FuelProductKey } from './fuel-analyses'

export const NOZZLE_METROLOGY_STORAGE_BUCKET = 'nozzle-metrology'
export const NOZZLE_METROLOGY_MAX_NOZZLES = 80
export const NOZZLE_METROLOGY_REGULATION = 'PORTARIA 227/2022 — INMETRO'

/** Faixa de volumetria selecionável (passo 20). */
export const VOLUMETRY_MIN = -200
export const VOLUMETRY_MAX = 200
export const VOLUMETRY_STEP = 20

/** Tolerância de aprovação da volumetria. */
export const VOLUMETRY_TOLERANCE_MIN = -100
export const VOLUMETRY_TOLERANCE_MAX = 100

/**
 * Diferença máxima permitida entre volumetria mínima e máxima do mesmo bico.
 * Cada passo de 20 = 0,1%; acima de 0,5% reprova.
 * Ex.: +100 e −20 → 0,6% → fora.
 */
export const VOLUMETRY_PERCENT_PER_STEP = 0.1
export const VOLUMETRY_SPREAD_MAX_PERCENT = 0.5

/** Vazão mínima: em 1 minuto, no mínimo 5 L. */
export const FLOW_MIN_LITERS_LIMIT = 5

/** Vazão máxima: em 12 segundos, no mínimo 5 L. */
export const FLOW_MAX_LITERS_REQUIRED = 5

export const FLOW_MIN_TIME_LABEL = '1 minuto'
export const FLOW_MAX_TIME_LABEL = '12 segundos'

export type MetrologyStatus = 'aprovado' | 'reprovado'
export type MetrologyItemStatus = MetrologyStatus | 'manutencao'

export type NozzleFuelKey = FuelProductKey | 'outro' | 'manutencao'

export const NOZZLE_MAINTENANCE_KEY = 'manutencao' as const

export const NOZZLE_FUEL_OPTIONS: { key: NozzleFuelKey; label: string }[] = [
  ...FUEL_PRODUCTS.map((product) => ({
    key: product.key as NozzleFuelKey,
    label: product.label,
  })),
  { key: 'manutencao', label: 'Bico em manutenção' },
  { key: 'outro', label: 'Outro' },
]

export function isMaintenanceFuel(key: string | null | undefined) {
  return key === NOZZLE_MAINTENANCE_KEY
}

export const VOLUMETRY_OPTIONS: number[] = Array.from(
  { length: (VOLUMETRY_MAX - VOLUMETRY_MIN) / VOLUMETRY_STEP + 1 },
  (_, index) => VOLUMETRY_MIN + index * VOLUMETRY_STEP,
)

export function formatNozzleLabel(nozzleNumber: number) {
  return `BICO Nº ${String(nozzleNumber).padStart(2, '0')}`
}

export function formatVolumetryLabel(value: number) {
  if (value > 0) return `+${value}`
  return String(value)
}

export function parseVolumetryInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!cleaned || cleaned === '+' || cleaned === '-') return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  if (!VOLUMETRY_OPTIONS.includes(parsed)) return null
  return parsed
}

/** Sugere valores da grade ao digitar (ex.: "-2" → -200, -20). Campo vazio: lista completa −200…+200. */
export function suggestVolumetryOptions(raw: string, limit = 40): number[] {
  const query = raw.trim().replace(/\s/g, '')
  if (!query) return [...VOLUMETRY_OPTIONS]

  const normalizedQuery = query.replace(',', '.')
  const scored = VOLUMETRY_OPTIONS.map((value) => {
    const label = formatVolumetryLabel(value)
    const asString = String(value)
    let score = 0
    if (label === normalizedQuery || asString === normalizedQuery) score = 100
    else if (label.startsWith(normalizedQuery) || asString.startsWith(normalizedQuery)) score = 80
    else if (label.includes(normalizedQuery) || asString.includes(normalizedQuery)) score = 40
    else return null
    return { value, score }
  }).filter((row): row is { value: number; score: number } => row != null)

  scored.sort((a, b) => b.score - a.score || a.value - b.value)
  return scored.slice(0, limit).map((row) => row.value)
}

export function isVolumetryApproved(value: number) {
  return value >= VOLUMETRY_TOLERANCE_MIN && value <= VOLUMETRY_TOLERANCE_MAX
}

/** Diferença percentual entre dois valores de volumetria (20 = 0,1%). */
export function volumetryDifferencePercent(a: number, b: number) {
  return (Math.abs(a - b) / VOLUMETRY_STEP) * VOLUMETRY_PERCENT_PER_STEP
}

export function formatPercentPt(value: number) {
  return `${value.toFixed(1).replace('.', ',')}%`
}

export function isVolumetrySpreadApproved(a: number, b: number) {
  return volumetryDifferencePercent(a, b) <= VOLUMETRY_SPREAD_MAX_PERCENT
}

export function isFlowMinApproved(liters: number) {
  return Number.isFinite(liters) && liters >= FLOW_MIN_LITERS_LIMIT
}

export function isFlowMaxApproved(liters: number) {
  return Number.isFinite(liters) && liters >= FLOW_MAX_LITERS_REQUIRED
}

export type NozzleDraftEvaluation = {
  status: MetrologyItemStatus | 'pendente'
  reasons: string[]
}

export type NozzleDraftInput = {
  fuelProductKey: NozzleFuelKey | ''
  fuelOtherLabel: string
  volumetryMin: number | null
  volumetryMax: number | null
  flowMinLiters: number | null
  flowMaxLiters: number | null
  sealsOk: boolean | null
  leakage: boolean | null
  hoseOk: boolean | null
  displayBurned: boolean | null
  nozzleOk: boolean | null
}

export function evaluateNozzleDraft(input: NozzleDraftInput): NozzleDraftEvaluation {
  if (isMaintenanceFuel(input.fuelProductKey)) {
    return { status: 'manutencao', reasons: [] }
  }

  const reasons: string[] = []
  const incomplete =
    !input.fuelProductKey ||
    (input.fuelProductKey === 'outro' && !input.fuelOtherLabel.trim()) ||
    input.volumetryMin == null ||
    input.volumetryMax == null ||
    input.flowMinLiters == null ||
    input.flowMaxLiters == null ||
    input.sealsOk == null ||
    input.leakage == null ||
    input.hoseOk == null ||
    input.displayBurned == null ||
    input.nozzleOk == null

  if (incomplete) {
    return { status: 'pendente', reasons: ['Preencha todos os campos do bico.'] }
  }

  if (!isVolumetryApproved(input.volumetryMin!)) {
    reasons.push(
      `Volumetria mínima fora da tolerância (${VOLUMETRY_TOLERANCE_MIN} a ${VOLUMETRY_TOLERANCE_MAX}).`,
    )
  }
  if (!isVolumetryApproved(input.volumetryMax!)) {
    reasons.push(
      `Volumetria máxima fora da tolerância (${VOLUMETRY_TOLERANCE_MIN} a ${VOLUMETRY_TOLERANCE_MAX}).`,
    )
  }
  if (!isVolumetrySpreadApproved(input.volumetryMin!, input.volumetryMax!)) {
    const percent = volumetryDifferencePercent(input.volumetryMin!, input.volumetryMax!)
    reasons.push(
      `Diferença entre volumetria mínima e máxima acima de ${formatPercentPt(VOLUMETRY_SPREAD_MAX_PERCENT)} ` +
        `(${formatPercentPt(percent)} entre ${formatVolumetryLabel(input.volumetryMin!)} e ${formatVolumetryLabel(input.volumetryMax!)}).`,
    )
  }
  if (!isFlowMinApproved(input.flowMinLiters!)) {
    reasons.push(
      `Vazão mínima: em ${FLOW_MIN_TIME_LABEL} deve entregar no mínimo ${FLOW_MIN_LITERS_LIMIT} L.`,
    )
  }
  if (!isFlowMaxApproved(input.flowMaxLiters!)) {
    reasons.push(
      `Vazão máxima: em ${FLOW_MAX_TIME_LABEL} deve entregar no mínimo ${FLOW_MAX_LITERS_REQUIRED} L.`,
    )
  }
  if (input.sealsOk === false) {
    reasons.push('Lacres não estão OK.')
  }
  if (input.leakage === true) {
    reasons.push('Há vazamento.')
  }
  if (input.hoseOk === false) {
    reasons.push('Mangueira não está OK.')
  }
  if (input.displayBurned === true) {
    reasons.push('Display queimado.')
  }
  if (input.nozzleOk === false) {
    reasons.push('Bico não está de acordo.')
  }

  return {
    status: reasons.length === 0 ? 'aprovado' : 'reprovado',
    reasons,
  }
}

export function fuelLabel(key: NozzleFuelKey, otherLabel?: string | null) {
  if (key === 'outro') return otherLabel?.trim() || 'Outro'
  if (key === 'gnv') return 'Gás Natural Veicular'
  return NOZZLE_FUEL_OPTIONS.find((option) => option.key === key)?.label ?? key
}

export function statusLabel(status: MetrologyItemStatus | 'pendente') {
  if (status === 'aprovado') return 'APROVADO'
  if (status === 'reprovado') return 'REPROVADO'
  if (status === 'manutencao') return 'EM MANUTENÇÃO'
  return 'PENDENTE'
}
