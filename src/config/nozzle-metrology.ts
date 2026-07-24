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

/** Vazão mínima: 5 L em pelo menos 60 s. */
export const FLOW_MIN_SECONDS_REQUIRED = 60

/** Vazão máxima: 5 L em no máximo 12 s. */
export const FLOW_MAX_SECONDS_REQUIRED = 12

export type MetrologyStatus = 'aprovado' | 'reprovado'

export type NozzleFuelKey = FuelProductKey | 'outro'

export const NOZZLE_FUEL_OPTIONS: { key: NozzleFuelKey; label: string }[] = [
  ...FUEL_PRODUCTS.map((product) => ({
    key: product.key as NozzleFuelKey,
    label: product.label,
  })),
  { key: 'gnv', label: 'Gás Natural Veicular' },
  { key: 'outro', label: 'Outro' },
]

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

/** Sugere valores da grade ao digitar (ex.: "-2" → -200, -20). */
export function suggestVolumetryOptions(raw: string, limit = 8): number[] {
  const query = raw.trim().replace(/\s/g, '')
  if (!query) return []

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

  scored.sort((a, b) => b.score - a.score || Math.abs(a.value) - Math.abs(b.value))
  return scored.slice(0, limit).map((row) => row.value)
}

export function isVolumetryApproved(value: number) {
  return value >= VOLUMETRY_TOLERANCE_MIN && value <= VOLUMETRY_TOLERANCE_MAX
}

export function isFlowMinApproved(seconds: number) {
  return Number.isFinite(seconds) && seconds >= FLOW_MIN_SECONDS_REQUIRED
}

export function isFlowMaxApproved(seconds: number) {
  return Number.isFinite(seconds) && seconds > 0 && seconds <= FLOW_MAX_SECONDS_REQUIRED
}

export type NozzleDraftEvaluation = {
  status: MetrologyStatus | 'pendente'
  reasons: string[]
}

export type NozzleDraftInput = {
  fuelProductKey: NozzleFuelKey | ''
  fuelOtherLabel: string
  volumetryMin: number | null
  volumetryMax: number | null
  flowMinSeconds: number | null
  flowMaxSeconds: number | null
  sealsOk: boolean | null
  leakage: boolean | null
}

export function evaluateNozzleDraft(input: NozzleDraftInput): NozzleDraftEvaluation {
  const reasons: string[] = []
  const incomplete =
    !input.fuelProductKey ||
    (input.fuelProductKey === 'outro' && !input.fuelOtherLabel.trim()) ||
    input.volumetryMin == null ||
    input.volumetryMax == null ||
    input.flowMinSeconds == null ||
    input.flowMaxSeconds == null ||
    input.sealsOk == null ||
    input.leakage == null

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
  if (!isFlowMinApproved(input.flowMinSeconds!)) {
    reasons.push(
      `Vazão mínima: 5 L devem levar pelo menos ${FLOW_MIN_SECONDS_REQUIRED} s (1 minuto).`,
    )
  }
  if (!isFlowMaxApproved(input.flowMaxSeconds!)) {
    reasons.push(
      `Vazão máxima: 5 L devem ser entregues em até ${FLOW_MAX_SECONDS_REQUIRED} s.`,
    )
  }
  if (input.sealsOk === false) {
    reasons.push('Lacres não estão OK.')
  }
  if (input.leakage === true) {
    reasons.push('Há vazamento.')
  }

  return {
    status: reasons.length === 0 ? 'aprovado' : 'reprovado',
    reasons,
  }
}

export function fuelLabel(key: NozzleFuelKey, otherLabel?: string | null) {
  if (key === 'outro') return otherLabel?.trim() || 'Outro'
  return NOZZLE_FUEL_OPTIONS.find((option) => option.key === key)?.label ?? key
}

export function statusLabel(status: MetrologyStatus | 'pendente') {
  if (status === 'aprovado') return 'APROVADO'
  if (status === 'reprovado') return 'REPROVADO'
  return 'PENDENTE'
}
