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
 * Faixas de massa específica a 20 °C (kg/m³) conforme resoluções ANP vigentes
 * usadas no controle de qualidade no revendedor.
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

export type DensityCorrectionResult = {
  dtKgM3: number
  temperatureC: number
  gammaKgM3: number
  d20KgM3: number
  /** Valor formatado para persistir/exibir (kg/m³ com 1 casa). */
  d20Formatted: string
  status: DensityConformity | null
  limitLabel: string | null
  formulaLabel: string
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

export function evaluateDensityConformity(
  productKey: FuelProductKey,
  d20KgM3: number,
): { status: DensityConformity | null; limitLabel: string | null } {
  const limits = FUEL_DENSITY_LIMITS_KG_M3[productKey]
  if (!limits) return { status: null, limitLabel: null }

  const minOk = limits.min == null || d20KgM3 + 1e-9 >= limits.min
  const maxOk = limits.max == null || d20KgM3 - 1e-9 <= limits.max
  const status: DensityConformity = minOk && maxOk ? 'apto' : 'inapto'

  const limitLabel =
    limits.min != null && limits.max != null
      ? `${limits.min.toFixed(1)} a ${limits.max.toFixed(1)} kg/m³`
      : limits.min != null
        ? `mín. ${limits.min.toFixed(1)} kg/m³`
        : limits.max != null
          ? `máx. ${limits.max.toFixed(1)} kg/m³`
          : null

  return { status, limitLabel }
}

/**
 * Converte densidade observada para 20 °C:
 * D20 = Dt + γ × (t − 20)
 */
export function correctDensityTo20C(
  productKey: FuelProductKey,
  densityInput: string,
  temperatureInput: string,
): DensityCorrectionResult | null {
  const gamma = FUEL_DENSITY_GAMMA_KG_M3[productKey]
  if (gamma == null) return null

  const dtKgM3 = parseDensityToKgM3(densityInput)
  const temperatureC = parseDecimalInput(temperatureInput)
  if (dtKgM3 == null || temperatureC == null) return null

  const d20KgM3 = dtKgM3 + gamma * (temperatureC - 20)
  const rounded = Number(d20KgM3.toFixed(1))
  const { status, limitLabel } = evaluateDensityConformity(productKey, rounded)

  return {
    dtKgM3,
    temperatureC,
    gammaKgM3: gamma,
    d20KgM3: rounded,
    d20Formatted: rounded.toFixed(1),
    status,
    limitLabel,
    formulaLabel: `D20 = ${dtKgM3.toFixed(1)} + ${gamma.toFixed(2)} × (${temperatureC.toFixed(1)} − 20)`,
  }
}
