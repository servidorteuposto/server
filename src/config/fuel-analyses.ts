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
  key: FuelProductKey
  label: string
  hasAlcoholContent: boolean
}

export const FUEL_PRODUCTS: FuelProduct[] = [
  { key: 'gasolina-comum', label: 'Gasolina Comum', hasAlcoholContent: true },
  { key: 'gasolina-aditivada', label: 'Gasolina Aditivada', hasAlcoholContent: true },
  { key: 'gasolina-premium', label: 'Gasolina Premium', hasAlcoholContent: true },
  { key: 'etanol-comum', label: 'Etanol Comum', hasAlcoholContent: false },
  { key: 'etanol-aditivado', label: 'Etanol Aditivado', hasAlcoholContent: false },
  { key: 'diesel-s10-comum', label: 'Diesel S-10 Comum', hasAlcoholContent: false },
  { key: 'diesel-s10-aditivado', label: 'Diesel S-10 Aditivado', hasAlcoholContent: false },
  { key: 'diesel-s500-comum', label: 'Diesel S-500 Comum', hasAlcoholContent: false },
  { key: 'diesel-s500-aditivado', label: 'Diesel S-500 Aditivado', hasAlcoholContent: false },
  { key: 'gnv', label: 'Gás Natural Veicular', hasAlcoholContent: false },
]

export const FUEL_PRODUCT_LABELS: Record<FuelProductKey, string> = Object.fromEntries(
  FUEL_PRODUCTS.map((product) => [product.key, product.label]),
) as Record<FuelProductKey, string>

export const FUEL_ANALYSES_STORAGE_BUCKET = 'fuel-analyses'
export const FUEL_ANALYSES_MAX_FILE_BYTES = 10 * 1024 * 1024

export function isFuelProductKey(value: string): value is FuelProductKey {
  return FUEL_PRODUCTS.some((product) => product.key === value)
}

export function productHasAlcoholContent(key: FuelProductKey) {
  return FUEL_PRODUCTS.find((product) => product.key === key)?.hasAlcoholContent ?? false
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
