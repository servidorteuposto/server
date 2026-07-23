import { formatCnpj, cnpjDigits, isValidCnpj } from '../lib/cnpj'
import { formatCpf, stripCpf, validateCpf } from './work-safety'

export type FuelProductKey =
  | 'gasolina-comum'
  | 'gasolina-aditivada'
  | 'gasolina-premium'
  | 'etanol-comum'
  | 'etanol-aditivado'
  | 'diesel-s10-comum'
  | 'diesel-s10-aditivado'
  | 'diesel-s500-comum'
  | 'diesel-s500-aditivado'
  | 'gnv'

export type FuelProduct = {
  key: Exclude<FuelProductKey, 'gnv'>
  label: string
  /** Manual (gasolina) ou automático via densidade (etanol). */
  alcoholKind: 'none' | 'gasoline' | 'ethanol'
}

export const FUEL_PRODUCTS: FuelProduct[] = [
  { key: 'gasolina-comum', label: 'Gasolina Comum', alcoholKind: 'gasoline' },
  { key: 'gasolina-aditivada', label: 'Gasolina Aditivada', alcoholKind: 'gasoline' },
  { key: 'gasolina-premium', label: 'Gasolina Premium', alcoholKind: 'gasoline' },
  { key: 'etanol-comum', label: 'Etanol Comum', alcoholKind: 'ethanol' },
  { key: 'etanol-aditivado', label: 'Etanol Aditivado', alcoholKind: 'ethanol' },
  { key: 'diesel-s10-comum', label: 'Diesel S-10 Comum', alcoholKind: 'none' },
  { key: 'diesel-s10-aditivado', label: 'Diesel S-10 Aditivado', alcoholKind: 'none' },
  { key: 'diesel-s500-comum', label: 'Diesel S-500 Comum', alcoholKind: 'none' },
  { key: 'diesel-s500-aditivado', label: 'Diesel S-500 Aditivado', alcoholKind: 'none' },
]

export const FUEL_PRODUCT_LABELS: Record<FuelProductKey, string> = {
  ...Object.fromEntries(FUEL_PRODUCTS.map((product) => [product.key, product.label])),
  gnv: 'Gás Natural Veicular',
} as Record<FuelProductKey, string>

export const FUEL_ANALYSES_STORAGE_BUCKET = 'fuel-analyses'
export const FUEL_ANALYSES_MAX_FILE_BYTES = 10 * 1024 * 1024

/** Volumes padrão do RAQ (litros). */
export const RAQ_VOLUME_PRESETS = [
  1000, 2000, 2500, 5000, 7500, 10000, 12500, 15000, 20000,
] as const

export const RAQ_VOLUME_CUSTOM_OPTION = 'custom'

export function formatRaqVolumeLabel(liters: number) {
  return `${new Intl.NumberFormat('pt-BR').format(liters)} L`
}

export function isRaqVolumePreset(value: string) {
  const normalized = Number(value.replace(/\./g, '').replace(',', '.'))
  if (Number.isNaN(normalized)) return false
  return (RAQ_VOLUME_PRESETS as readonly number[]).includes(normalized)
}

export function isFuelProductKey(value: string): value is FuelProductKey {
  return FUEL_PRODUCTS.some((product) => product.key === value)
}

export function productHasAlcoholContent(key: FuelProductKey) {
  const kind = FUEL_PRODUCTS.find((product) => product.key === key)?.alcoholKind
  return kind === 'gasoline' || kind === 'ethanol'
}

export function productAlcoholKind(key: FuelProductKey) {
  return FUEL_PRODUCTS.find((product) => product.key === key)?.alcoholKind ?? 'none'
}

export function formatDateTimePtBr(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date)
}

export function formatCoords(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

export function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
}

export function isPdfOrImageFile(file: File) {
  return (
    file.type === 'application/pdf' ||
    /\.pdf$/i.test(file.name) ||
    isImageFile(file)
  )
}

export function validateTransporterCnpj(value: string) {
  const digits = cnpjDigits(value)
  if (!digits) return 'Informe o CNPJ do transportador.'
  if (!isValidCnpj(digits)) return 'Informe um CNPJ válido do transportador.'
  return null
}

export function validateDistributorCnpj(value: string) {
  const digits = cnpjDigits(value)
  if (!digits) return 'Informe o CNPJ do distribuidor.'
  if (!isValidCnpj(digits)) return 'Informe um CNPJ válido do distribuidor.'
  return null
}

export {
  formatCnpj,
  cnpjDigits,
  isValidCnpj,
  formatCpf,
  stripCpf,
  validateCpf,
}
