import { productAlcoholKind, type FuelProductKey } from './fuel-analyses'

/**
 * Modelo matemático da Tabela I (Res. ANP nº 894/2022 / CNP nº 6/70):
 * densímetro de vidro — densidade observada → densidade relativa a 20 °C.
 *
 * Por faixa de d20: d20 = dObs − S·10⁻⁶·[(A1+A2·d)·ΔT + (B1+B2·d)·ΔT²],
 * iterando em d (= d20). O fator S reproduz os valores publicados (4 casas).
 */
const ANP_TABELA_I_SCALE = 1.74

/** Faixas [dMaxExclusive, A1, A2, B1, B2] do modelo CNP (tese / Petrobras–INPM). */
const ANP_TABELA_I_COEFF_RANGES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.498, -2462, 3215, -10.14, 17.38],
  [0.518, -2391, 3074, -8.41, 13.98],
  [0.539, -2294, 2887, -8.39, 13.87],
  [0.559, -2146, 2615, -5.46, 8.55],
  [0.579, -1920, 2214, -5.51, 8.55],
  [0.6, -2358, 2962, -12.25, 20.15],
  [0.615, -1361, 1300, -0.49, 0.6],
  [0.635, -1237, 1100, -0.49, 0.6],
  [0.655, -1077, 850, -0.49, 0.6],
  [0.675, -1011, 750, -0.49, 0.6],
  [0.695, -977, 700, -0.49, 0.6],
  [0.746, -1005, 740, -0.49, 0.6],
  [0.766, -1238, 1050, -0.49, 0.6],
  [0.786, -1084, 850, -0.49, 0.6],
  [0.806, -965, 700, -0.49, 0.6],
  [0.826, -843.5, 550, -0.49, 0.6],
  [0.846, -719, 400, -0.49, 0.6],
  [0.871, -617, 280, -0.49, 0.6],
  [0.896, -512, 160, -0.49, 0.6],
  [0.996, -394.8, 30, -0.49, 0.6],
  [2, -542.6, 177.8, 2.31, -2.2],
]

function anpTabelaICoeffs(d20Relative: number): readonly [number, number, number, number] {
  for (const [dMax, a1, a2, b1, b2] of ANP_TABELA_I_COEFF_RANGES) {
    if (d20Relative < dMax) return [a1, a2, b1, b2]
  }
  const last = ANP_TABELA_I_COEFF_RANGES[ANP_TABELA_I_COEFF_RANGES.length - 1]
  return [last[1], last[2], last[3], last[4]]
}

/**
 * Converte densidade observada (densímetro de vidro) para densidade relativa a 20 °C
 * conforme a Tabela I da Res. ANP nº 894/2022.
 */
export function convertObservedDensityTo20C(
  dObsRelative: number,
  temperatureC: number,
): number {
  let d = dObsRelative
  for (let i = 0; i < 40; i += 1) {
    const [a1, a2, b1, b2] = anpTabelaICoeffs(d)
    const deltaT = temperatureC - 20
    const corr =
      -ANP_TABELA_I_SCALE * 1e-6 * (a1 + a2 * d) * deltaT -
      ANP_TABELA_I_SCALE * 1e-6 * (b1 + b2 * d) * deltaT * deltaT
    const d20 = dObsRelative + corr
    if (Math.abs(d20 - d) < 1e-12) {
      return Number(d20.toFixed(4))
    }
    d = d20
  }
  return Number(d.toFixed(4))
}

/** @deprecated Mantido para compatibilidade; use convertObservedDensityTo20C (Tabela I). */
export const GASOLINE_DENSITY_POLY = {
  c1: 0.000857,
  c2: -0.00000088,
} as const

/** @deprecated Mantido para compatibilidade; use convertObservedDensityTo20C (Tabela I). */
export const DIESEL_DENSITY_ALPHA = 0.00072

/**
 * γ de referência (kg/m³/°C) para rótulos/UI e para o etanol (correção linear).
 * Gasolina e diesel usam a Tabela I ANP (não este γ linear).
 */
export const FUEL_DENSITY_GAMMA_KG_M3: Record<FuelProductKey, number | null> = {
  'gasolina-comum': 0.857,
  'gasolina-aditivada': 0.857,
  'gasolina-premium': 0.857,
  'etanol-comum': 0.85,
  'etanol-aditivado': 0.85,
  'etanol-premium': 0.85,
  'diesel-s10-comum': 0.72,
  'diesel-s10-aditivado': 0.72,
  'diesel-s500-comum': 0.72,
  'diesel-s500-aditivado': 0.72,
  gnv: null,
}

/**
 * Faixa operacional do termômetro de densímetro (Portaria Inmetro / práticas ANP de RAQ).
 * Temperatura fora disso invalida o ensaio — não pode ser Apto.
 */
export const DENSITY_ASSAY_TEMPERATURE_C = { min: -10, max: 50 }

/** Faixa da Tabela I para conversão de densidade da gasolina. */
export const GASOLINE_DENSITY_ASSAY_TEMPERATURE_C = { min: 0, max: 50 }

/** Faixa suportada para conversão de densidade do óleo diesel. */
export const DIESEL_DENSITY_ASSAY_TEMPERATURE_C = { min: -10, max: 60 }

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
  'etanol-premium': { min: 790, max: 820 },
  'diesel-s10-comum': { min: 700, max: 900 },
  'diesel-s10-aditivado': { min: 700, max: 900 },
  'diesel-s500-comum': { min: 700, max: 900 },
  'diesel-s500-aditivado': { min: 700, max: 900 },
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
 * Teor alcoólico na gasolina C (% vol): somente 31 a 33 é conforme.
 * Abaixo ou acima → luz vermelha (Fora das Especificações).
 */
export const GASOLINE_ALCOHOL_PERCENT = { min: 31, max: 33 }

/**
 * Teor alcoólico do etanol hidratado combustível (% massa / °INPM).
 * Res. ANP nº 907/2022 — EHC: 92,5 a 95,4.
 */
export const ETHANOL_ALCOHOL_PERCENT = { min: 92.5, max: 95.4 }

/**
 * Coeficiente γ (kg/m³/°C) do etanol hidratado: ρ20 = ρlida + γ·(T−20).
 * 0,85 alinha com correção usual de EHC (ex.: 17 °C / 0,8080 → 0,8055).
 */
export const ETHANOL_DENSITY_GAMMA_KG_M3 = 0.85

/**
 * Tabela alcoométrica a 20 °C: [ρ20 kg/m³, % m/m (INPM), % v/v].
 * Fonte: tabela de conversão EHC / NBR 5992 (faixa comercial).
 */
const ETHANOL_ALCOHOL_TABLE_20C: ReadonlyArray<readonly [number, number, number]> = [
  [811.94, 92.2, 94.85],
  [811.67, 92.3, 94.92],
  [811.4, 92.4, 94.99],
  [811.12, 92.5, 95.06],
  [810.85, 92.6, 95.14],
  [810.57, 92.7, 95.21],
  [810.3, 92.8, 95.28],
  [810.02, 92.9, 95.35],
  [809.75, 93.0, 95.42],
  [809.47, 93.1, 95.49],
  [809.19, 93.2, 95.56],
  [808.91, 93.3, 95.63],
  [808.64, 93.4, 95.7],
  [808.36, 93.5, 95.77],
  [808.08, 93.6, 95.83],
  [807.8, 93.7, 95.9],
  [807.52, 93.8, 95.97],
  [807.24, 93.9, 96.04],
  [806.96, 94.0, 96.11],
  [806.68, 94.1, 96.18],
  [806.4, 94.2, 96.25],
  [806.12, 94.3, 96.32],
  [805.84, 94.4, 96.39],
  [805.56, 94.5, 96.45],
  [805.27, 94.6, 96.52],
  [804.99, 94.7, 96.59],
  [804.71, 94.8, 96.66],
  [804.42, 94.9, 96.73],
  [804.14, 95.0, 96.79],
  [803.86, 95.1, 96.86],
  [803.58, 95.2, 96.93],
  [803.3, 95.3, 97.0],
  [803.02, 95.4, 97.07],
]

export type EthanolConversionResult = {
  rho20KgM3: number
  massPercent: number
  volumePercent: number
  fcv: number
}

function interpolateEthanolAlcohol(d20KgM3: number): { massPercent: number; volumePercent: number } {
  const table = ETHANOL_ALCOHOL_TABLE_20C
  if (d20KgM3 >= table[0][0]) {
    return { massPercent: table[0][1], volumePercent: table[0][2] }
  }
  const last = table[table.length - 1]
  if (d20KgM3 <= last[0]) {
    return { massPercent: last[1], volumePercent: last[2] }
  }

  for (let i = 0; i < table.length - 1; i += 1) {
    const [rhoHi, massHi, volHi] = table[i]
    const [rhoLo, massLo, volLo] = table[i + 1]
    if (d20KgM3 <= rhoHi && d20KgM3 >= rhoLo) {
      const t = (rhoHi - d20KgM3) / (rhoHi - rhoLo)
      return {
        massPercent: Number((massHi + t * (massLo - massHi)).toFixed(2)),
        volumePercent: Number((volHi + t * (volLo - volHi)).toFixed(2)),
      }
    }
  }

  return { massPercent: last[1], volumePercent: last[2] }
}

/**
 * Converte etanol hidratado (T lida + ρ lida) para parâmetros a 20 °C.
 * Correção em densidade relativa (4 casas, half-up — igual ao densímetro):
 * d20 = dObs + 0,00085·(T−20); kg/m³ com 1 casa.
 * Teor via tabela alcoométrica; FCV = ρlida/ρ20.
 */
export function convertHydratedEthanol(
  temperatureC: number,
  rhoObservedKgM3: number,
): EthanolConversionResult {
  const dObsRelative = rhoObservedKgM3 / 1000
  const alphaRelative = ETHANOL_DENSITY_GAMMA_KG_M3 / 1000
  const d20Raw = dObsRelative + alphaRelative * (temperatureC - 20)
  // Half-up em 4 casas (evita o viés do Number#toFixed em *.x5).
  const d20Relative = Math.round((d20Raw + Number.EPSILON) * 10000) / 10000
  const rho20KgM3 = Math.round((d20Relative * 1000 + Number.EPSILON) * 10) / 10
  const alcohol = interpolateEthanolAlcohol(rho20KgM3)
  const fcv =
    rho20KgM3 === 0 ? 1 : Number((rhoObservedKgM3 / rho20KgM3).toFixed(4))

  return {
    rho20KgM3,
    massPercent: alcohol.massPercent,
    volumePercent: alcohol.volumePercent,
    fcv,
  }
}

/** °INPM a partir da massa específica a 20 °C (tabela alcoométrica). */
export function calculateEthanolInpmFromD20KgM3(d20KgM3: number): number {
  return interpolateEthanolAlcohol(d20KgM3).massPercent
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
  'etanol-premium': {
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

function isGasolineProduct(productKey: FuelProductKey) {
  return productAlcoholKind(productKey) === 'gasoline'
}

function isDieselProduct(productKey: FuelProductKey) {
  return productKey.startsWith('diesel-')
}

/** Etanol Comum, Aditivado, Premium e qualquer novo tipo com alcoholKind ethanol. */
function isEthanolProduct(productKey: FuelProductKey) {
  return productAlcoholKind(productKey) === 'ethanol'
}

function assayTemperatureRange(productKey: FuelProductKey) {
  if (isGasolineProduct(productKey)) return GASOLINE_DENSITY_ASSAY_TEMPERATURE_C
  if (isEthanolProduct(productKey)) return DENSITY_ASSAY_TEMPERATURE_C
  if (isDieselProduct(productKey)) return DIESEL_DENSITY_ASSAY_TEMPERATURE_C
  return DENSITY_ASSAY_TEMPERATURE_C
}

/**
 * Converte densidade observada da gasolina para 20 °C (Tabela I ANP 894).
 * Retorna d20 em g/cm³ com 4 casas.
 */
export function calculateGasolineDensity20C(dObsRelative: number, temperatureC: number): number {
  return convertObservedDensityTo20C(dObsRelative, temperatureC)
}

/**
 * Converte densidade observada do óleo diesel para 20 °C (Tabela I ANP 894).
 * Retorna d20 em g/cm³ com 4 casas.
 */
export function calculateDieselDensity20C(dObsRelative: number, temperatureC: number): number {
  return convertObservedDensityTo20C(dObsRelative, temperatureC)
}

function validateAssayInputs(
  productKey: FuelProductKey,
  dtKgM3: number,
  temperatureC: number,
): string | null {
  const tempRange = assayTemperatureRange(productKey)
  if (temperatureC < tempRange.min || temperatureC > tempRange.max) {
    return `Temperatura ${temperatureC.toFixed(1)} °C fora da faixa do ensaio (${tempRange.min} a ${tempRange.max} °C).`
  }

  if (productKey === 'gnv') return null

  const range = OBSERVED_DENSITY_RANGE_KG_M3[productKey]
  if (dtKgM3 < range.min || dtKgM3 > range.max) {
    return `Massa específica observada ${dtKgM3.toFixed(1)} kg/m³ fora da faixa do densímetro (${range.min} a ${range.max} kg/m³).`
  }

  return null
}

/**
 * Converte densidade observada para 20 °C.
 * Gasolina e diesel: Tabela I (Res. ANP nº 894/2022), densímetro de vidro.
 * Etanol: γ = 0,85 kg/m³/°C + tabela alcoométrica (°INPM / % v/v / FCV).
 *
 * Temperatura/Dt fora da faixa do ensaio → sempre Inapto (nunca Apto).
 * Gasolina: teor manual 31–33%. Etanol: teor °INPM calculado da densidade.
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

  const isGasoline = isGasolineProduct(productKey)
  const isDiesel = isDieselProduct(productKey)
  const isEthanol = isEthanolProduct(productKey)

  let rounded: number
  let d20Formatted: string
  let formulaLabel: string
  let alcoholFormatted: string | null = null

  if (isGasoline || isDiesel) {
    const dObsRelative = dtKgM3 / 1000
    const d20Relative = convertObservedDensityTo20C(dObsRelative, temperatureC)
    rounded = Number((d20Relative * 1000).toFixed(1))
    d20Formatted = rounded.toFixed(1)
    formulaLabel = `Tabela I ANP 894: Dt ${dObsRelative.toFixed(3)} @ ${temperatureC.toFixed(1)} °C → D20 ${d20Relative.toFixed(4)}`
  } else if (isEthanol) {
    const ethanol = convertHydratedEthanol(temperatureC, dtKgM3)
    rounded = ethanol.rho20KgM3
    d20Formatted = ethanol.rho20KgM3.toFixed(1)
    alcoholFormatted = ethanol.massPercent.toFixed(2)
    formulaLabel = `D20 = ${dtKgM3.toFixed(1)} + 0,85 × (${temperatureC.toFixed(1)} − 20); ${ethanol.massPercent.toFixed(2)}% m/m; ${ethanol.volumePercent.toFixed(2)}% v/v; FCV ${ethanol.fcv.toFixed(4)}`
  } else {
    const d20KgM3 = dtKgM3 + gamma * (temperatureC - 20)
    rounded = Number(d20KgM3.toFixed(1))
    d20Formatted = rounded.toFixed(1)
    formulaLabel = `D20 = ${dtKgM3.toFixed(1)} + ${gamma.toFixed(2)} × (${temperatureC.toFixed(1)} − 20)`
  }

  const limits = FUEL_DENSITY_LIMITS_KG_M3[productKey]
  const limitLabel = limits ? formatLimitLabel(limits) : null

  let alcohol: {
    status: DensityConformity | null
    limitLabel: string
    reason: string | null
  } | null = null

  if (isEthanol && alcoholFormatted) {
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
      d20Formatted,
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
    d20Formatted,
    status,
    limitLabel: conformity.limitLabel ?? limitLabel,
    formulaLabel,
    statusReason: combineStatusReasons(conformity.reason, alcohol?.reason),
    statusLabel: buildFuelStatusLabel({ densityOk, alcoholOk }),
    alcoholFormatted,
  }
}
