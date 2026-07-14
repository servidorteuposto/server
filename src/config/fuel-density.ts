import type { FuelProductKey } from './fuel-analyses'

/** Coeficiente absoluto γ (kg/m³/°C) na fórmula D20 = Dt + γ × (t − 20). */
export const FUEL_DENSITY_GAMMA_KG_M3: Record<FuelProductKey, number | null> = {
  'gasolina-comum': 0.85,
  'gasolina-aditivada': 0.85,
  'gasolina-premium': 0.85,
  'etanol-comum': 0.9,
  'etanol-aditivado': 0.9,
  'diesel-s10-comum': 0.7,
  'diesel-s10-aditivado': 0.7,
  'diesel-s500-comum': 0.7,
  'diesel-s500-aditivado': 0.7,
  gnv: null,
}

/**
 * Faixa operacional do termômetro de densímetro (Portaria Inmetro / práticas ANP de RAQ).
 * Temperatura fora disso invalida o ensaio — não pode ser Apto.
 */
export const DENSITY_ASSAY_TEMPERATURE_C = { min: -10, max: 50 }

/**
 * Faixa plausível de Dt lida no densímetro (kg/m³), por família de produto.
 * Evita marcar Apto com valores fisicamente impossíveis.
 */
export const OBSERVED_DENSITY_RANGE_KG_M3: Record<
  Exclude<FuelProductKey, 'gnv'>,
  { min: number; max: number }
> = {
  'gasolina-comum': { min: 700, max: 800 },
  'gasolina-aditivada': { min: 700, max: 800 },
  'gasolina-premium': { min: 700, max: 800 },
  'etanol-comum': { min: 790, max: 820 },
  'etanol-aditivado': { min: 790, max: 820 },
  'diesel-s10-comum': { min: 810, max: 880 },
  'diesel-s10-aditivado': { min: 810, max: 880 },
  'diesel-s500-comum': { min: 810, max: 880 },
  'diesel-s500-aditivado': { min: 810, max: 880 },
}

/**
 * Teor de biodiesel (fração 0–1) usado para projetar a faixa ME do óleo diesel B
 * a partir do diesel A e do biodiesel (Res. ANP nº 968/2024).
 * Atualize quando o CNPE alterar o percentual vigente.
 */
export const BIODIESEL_BLEND_FRACTION = 0.15

/** Limites ME do biodiesel a 20 °C (Res. ANP nº 920/2023), kg/m³. */
const BIODIESEL_ME_KG_M3 = { min: 850.0, max: 900.0 }

/** Limites ME do diesel A a 20 °C (Res. ANP nº 968/2024), kg/m³. */
const DIESEL_A_ME_KG_M3 = {
  s10: { min: 815.0, max: 850.0 },
  s500: { min: 815.0, max: 865.0 },
}

function dieselBLimits(dieselA: { min: number; max: number }) {
  const tB = BIODIESEL_BLEND_FRACTION
  const tA = 1 - tB
  return {
    min: Number((BIODIESEL_ME_KG_M3.min * tB + dieselA.min * tA).toFixed(1)),
    max: Number((BIODIESEL_ME_KG_M3.max * tB + dieselA.max * tA).toFixed(1)),
  }
}

export type DensityLimit = {
  min: number | null
  max: number | null
  unit: 'kg/m³'
  reference: string
}

/**
 * Teor alcoólico na gasolina C (% vol): somente 29 a 31 é conforme.
 * Abaixo ou acima → luz vermelha (Fora das Especificações).
 */
export const GASOLINE_ALCOHOL_PERCENT = { min: 29, max: 31 }

/**
 * Teor alcoólico do etanol hidratado combustível (% massa / °INPM).
 * Res. ANP nº 907/2022 — EHC: 92,5 a 95,4.
 */
export const ETHANOL_ALCOHOL_PERCENT = { min: 92.5, max: 95.4 }

/**
 * Correlação aproximada Massa Específica × °INPM (soluções hidroalcoólicas a 20 °C).
 * C = −758,31·d² + 882,02·d − 124,99  (d em g/cm³).
 * Útil para automação; referência oficial de ensaio: NBR 5992.
 */
export function calculateEthanolInpmFromD20KgM3(d20KgM3: number): number {
  const d = d20KgM3 / 1000
  const c = -758.31 * d * d + 882.02 * d - 124.99
  return Number(c.toFixed(1))
}

/**
 * Faixas de massa específica a 20 °C (kg/m³) conforme resoluções ANP vigentes
 * usadas no controle de qualidade no revendedor.
 *
 * Gasolina C: mínimo 715 kg/m³ (sem teto ANP). Abaixo disso → luz vermelha.
 */
export const FUEL_DENSITY_LIMITS_KG_M3: Record<FuelProductKey, DensityLimit | null> = {
  'gasolina-comum': {
    min: 715.0,
    max: null,
    unit: 'kg/m³',
    reference: 'Res. ANP nº 807/2020 — Gasolina C, mín. 715,0 kg/m³',
  },
  'gasolina-aditivada': {
    min: 715.0,
    max: null,
    unit: 'kg/m³',
    reference: 'Res. ANP nº 807/2020 — Gasolina C, mín. 715,0 kg/m³',
  },
  'gasolina-premium': {
    min: 715.0,
    max: null,
    unit: 'kg/m³',
    reference: 'Res. ANP nº 807/2020 — Gasolina C Premium, mín. 715,0 kg/m³',
  },
  'etanol-comum': {
    min: 802.9,
    max: 811.2,
    unit: 'kg/m³',
    reference: 'Res. ANP nº 19/2015 — EHC, 802,9 a 811,2 kg/m³',
  },
  'etanol-aditivado': {
    min: 802.9,
    max: 811.2,
    unit: 'kg/m³',
    reference: 'Res. ANP nº 19/2015 — EHC, 802,9 a 811,2 kg/m³',
  },
  'diesel-s10-comum': {
    ...dieselBLimits(DIESEL_A_ME_KG_M3.s10),
    unit: 'kg/m³',
    reference: `Res. ANP nº 968/2024 — Diesel B S10 (B${Math.round(BIODIESEL_BLEND_FRACTION * 100)})`,
  },
  'diesel-s10-aditivado': {
    ...dieselBLimits(DIESEL_A_ME_KG_M3.s10),
    unit: 'kg/m³',
    reference: `Res. ANP nº 968/2024 — Diesel B S10 (B${Math.round(BIODIESEL_BLEND_FRACTION * 100)})`,
  },
  'diesel-s500-comum': {
    ...dieselBLimits(DIESEL_A_ME_KG_M3.s500),
    unit: 'kg/m³',
    reference: `Res. ANP nº 968/2024 — Diesel B S500 (B${Math.round(BIODIESEL_BLEND_FRACTION * 100)})`,
  },
  'diesel-s500-aditivado': {
    ...dieselBLimits(DIESEL_A_ME_KG_M3.s500),
    unit: 'kg/m³',
    reference: `Res. ANP nº 968/2024 — Diesel B S500 (B${Math.round(BIODIESEL_BLEND_FRACTION * 100)})`,
  },
  gnv: null,
}

export type DensityConformity = 'apto' | 'inapto'

export const DENSITY_CONFORMITY_LABELS: Record<DensityConformity, string> = {
  apto: 'Dentro das Especificações',
  inapto: 'Fora das Especificações',
}

export type DensityCorrectionResult = {
  dtKgM3: number
  temperatureC: number
  gammaKgM3: number
  d20KgM3: number
  /** Valor formatado para persistir/exibir (kg/m³ com 1 casa). */
  d20Formatted: string
  status: DensityConformity
  limitLabel: string | null
  formulaLabel: string
  /** Motivo quando o ensaio/entrada é inválida ou fora da faixa ANP. */
  statusReason: string | null
  /** Rótulo amigável da situação (densidade / teor). */
  statusLabel: string
  /** Teor alcoólico automático (etanol °INPM); null se não aplicável. */
  alcoholFormatted: string | null
}

export function gasolineAlcoholLimitLabel() {
  return `${GASOLINE_ALCOHOL_PERCENT.min}% a ${GASOLINE_ALCOHOL_PERCENT.max}%`
}

export function ethanolAlcoholLimitLabel() {
  return `${ETHANOL_ALCOHOL_PERCENT.min.toFixed(1).replace('.', ',')}% a ${ETHANOL_ALCOHOL_PERCENT.max.toFixed(1).replace('.', ',')}% (°INPM)`
}

export function evaluateGasolineAlcoholConformity(teorInput: string): {
  status: DensityConformity | null
  limitLabel: string
  reason: string | null
} {
  const limitLabel = gasolineAlcoholLimitLabel()
  const value = parseDecimalInput(teorInput)
  if (value == null) {
    return { status: null, limitLabel, reason: null }
  }

  if (value + 1e-9 >= GASOLINE_ALCOHOL_PERCENT.min && value - 1e-9 <= GASOLINE_ALCOHOL_PERCENT.max) {
    return { status: 'apto', limitLabel, reason: null }
  }

  return {
    status: 'inapto',
    limitLabel,
    reason: `Teor alcoólico ${value.toFixed(1).replace('.', ',')}% fora da faixa (${limitLabel}).`,
  }
}

export function evaluateEthanolAlcoholConformity(teorInput: string): {
  status: DensityConformity | null
  limitLabel: string
  reason: string | null
} {
  const limitLabel = ethanolAlcoholLimitLabel()
  const value = parseDecimalInput(teorInput)
  if (value == null) {
    return { status: null, limitLabel, reason: null }
  }

  if (value + 1e-9 >= ETHANOL_ALCOHOL_PERCENT.min && value - 1e-9 <= ETHANOL_ALCOHOL_PERCENT.max) {
    return { status: 'apto', limitLabel, reason: null }
  }

  return {
    status: 'inapto',
    limitLabel,
    reason: `Teor alcoólico ${value.toFixed(1).replace('.', ',')} °INPM fora da faixa (${limitLabel}).`,
  }
}

export function buildFuelStatusLabel(options: {
  densityOk: boolean | null
  alcoholOk: boolean | null
}): string {
  const { densityOk, alcoholOk } = options

  if (densityOk === true && alcoholOk === true) {
    return 'Densidade e teor alcoólico conforme'
  }
  if (densityOk === true && alcoholOk == null) {
    return 'Densidade conforme'
  }
  if (densityOk === true && alcoholOk === false) {
    return 'Teor alcoólico fora dos padrões'
  }
  if (densityOk === false && alcoholOk === true) {
    return 'Densidade fora dos padrões'
  }
  if (densityOk === false && alcoholOk === false) {
    return 'Densidade e teor alcoólico fora dos padrões'
  }
  if (densityOk === false) {
    return 'Densidade fora dos padrões'
  }
  if (alcoholOk === false) {
    return 'Teor alcoólico fora dos padrões'
  }
  if (densityOk === true) {
    return DENSITY_CONFORMITY_LABELS.apto
  }
  return DENSITY_CONFORMITY_LABELS.inapto
}

function combineStatusReasons(...reasons: Array<string | null | undefined>) {
  const parts = reasons.filter((reason): reason is string => Boolean(reason))
  return parts.length > 0 ? parts.join(' ') : null
}

export function parseDecimalInput(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** Aceita kg/m³ (ex.: 745) ou g/mL / g/cm³ (ex.: 0,745). */
export function parseDensityToKgM3(value: string): number | null {
  const parsed = parseDecimalInput(value)
  if (parsed == null) return null
  if (parsed > 0 && parsed < 2) return parsed * 1000
  return parsed
}

export function supportsDensityCorrection(productKey: FuelProductKey) {
  return FUEL_DENSITY_GAMMA_KG_M3[productKey] != null
}

function formatLimitLabel(limits: DensityLimit): string | null {
  if (limits.min != null && limits.max != null) {
    return `${limits.min.toFixed(1).replace('.', ',')} a ${limits.max.toFixed(1).replace('.', ',')} kg/m³`
  }
  if (limits.min != null) {
    return `igual ou superior a ${limits.min.toFixed(1).replace('.', ',')} kg/m³`
  }
  if (limits.max != null) {
    return `máx. ${limits.max.toFixed(1).replace('.', ',')} kg/m³`
  }
  return null
}

export function evaluateDensityConformity(
  productKey: FuelProductKey,
  d20KgM3: number,
): { status: DensityConformity | null; limitLabel: string | null; reason: string | null } {
  const limits = FUEL_DENSITY_LIMITS_KG_M3[productKey]
  if (!limits) return { status: null, limitLabel: null, reason: null }

  const limitLabel = formatLimitLabel(limits)
  const minOk = limits.min == null || d20KgM3 + 1e-9 >= limits.min
  const maxOk = limits.max == null || d20KgM3 - 1e-9 <= limits.max

  if (minOk && maxOk) {
    return { status: 'apto', limitLabel, reason: null }
  }

  return {
    status: 'inapto',
    limitLabel,
    reason: `D20 ${d20KgM3.toFixed(1)} kg/m³ fora da faixa ANP/ensaio (${limitLabel}).`,
  }
}

function validateAssayInputs(
  productKey: FuelProductKey,
  dtKgM3: number,
  temperatureC: number,
): string | null {
  if (
    temperatureC < DENSITY_ASSAY_TEMPERATURE_C.min ||
    temperatureC > DENSITY_ASSAY_TEMPERATURE_C.max
  ) {
    return `Temperatura ${temperatureC.toFixed(1)} °C fora da faixa do ensaio (${DENSITY_ASSAY_TEMPERATURE_C.min} a ${DENSITY_ASSAY_TEMPERATURE_C.max} °C).`
  }

  if (productKey === 'gnv') return null

  const range = OBSERVED_DENSITY_RANGE_KG_M3[productKey]
  if (dtKgM3 < range.min || dtKgM3 > range.max) {
    return `Massa específica observada ${dtKgM3.toFixed(1)} kg/m³ fora da faixa do densímetro (${range.min} a ${range.max} kg/m³).`
  }

  return null
}

/**
 * Converte densidade observada para 20 °C:
 * D20 = Dt + γ × (t − 20)
 *
 * Temperatura/Dt fora da faixa do ensaio → sempre Inapto (nunca Apto).
 * Gasolina: teor manual 29–31%. Etanol: teor °INPM calculado da densidade.
 */
export function correctDensityTo20C(
  productKey: FuelProductKey,
  densityInput: string,
  temperatureInput: string,
  alcoholInput?: string,
): DensityCorrectionResult | null {
  const gamma = FUEL_DENSITY_GAMMA_KG_M3[productKey]
  if (gamma == null) return null

  const dtKgM3 = parseDensityToKgM3(densityInput)
  const temperatureC = parseDecimalInput(temperatureInput)
  if (dtKgM3 == null || temperatureC == null) return null

  const d20KgM3 = dtKgM3 + gamma * (temperatureC - 20)
  const rounded = Number(d20KgM3.toFixed(1))
  const formulaLabel = `D20 = ${dtKgM3.toFixed(1)} + ${gamma.toFixed(2)} × (${temperatureC.toFixed(1)} − 20)`
  const limits = FUEL_DENSITY_LIMITS_KG_M3[productKey]
  const limitLabel = limits ? formatLimitLabel(limits) : null

  const isGasoline = productKey.startsWith('gasolina-')
  const isEthanol = productKey.startsWith('etanol-')

  let alcoholFormatted: string | null = null
  let alcohol: {
    status: DensityConformity | null
    limitLabel: string
    reason: string | null
  } | null = null

  if (isEthanol) {
    alcoholFormatted = calculateEthanolInpmFromD20KgM3(rounded).toFixed(1)
    alcohol = evaluateEthanolAlcoholConformity(alcoholFormatted)
  } else if (isGasoline && alcoholInput != null && alcoholInput.trim() !== '') {
    alcohol = evaluateGasolineAlcoholConformity(alcoholInput)
  }

  const assayError = validateAssayInputs(productKey, dtKgM3, temperatureC)
  if (assayError) {
    const densityOk = false
    const alcoholOk = alcohol?.status == null ? null : alcohol.status === 'apto'
    return {
      dtKgM3,
      temperatureC,
      gammaKgM3: gamma,
      d20KgM3: rounded,
      d20Formatted: rounded.toFixed(1),
      status: 'inapto',
      limitLabel,
      formulaLabel,
      statusReason: combineStatusReasons(assayError, alcohol?.reason),
      statusLabel: buildFuelStatusLabel({ densityOk, alcoholOk }),
      alcoholFormatted,
    }
  }

  const conformity = evaluateDensityConformity(productKey, rounded)
  const densityOk = conformity.status === 'apto'
  const alcoholOk = alcohol?.status == null ? null : alcohol.status === 'apto'
  const status: DensityConformity =
    densityOk && (alcoholOk == null || alcoholOk) ? 'apto' : 'inapto'

  return {
    dtKgM3,
    temperatureC,
    gammaKgM3: gamma,
    d20KgM3: rounded,
    d20Formatted: rounded.toFixed(1),
    status,
    limitLabel: conformity.limitLabel ?? limitLabel,
    formulaLabel,
    statusReason: combineStatusReasons(conformity.reason, alcohol?.reason),
    statusLabel: buildFuelStatusLabel({ densityOk, alcoholOk }),
    alcoholFormatted,
  }
}
