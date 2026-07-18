export const POSTO_ASSETS_STORAGE_BUCKET = 'posto-assets'
export const POSTO_PHOTO_MAX_BYTES = 5 * 1024 * 1024

export type ViaCepAddress = {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  erro?: boolean
}

export function stripCep(value: string) {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function formatCep(value: string) {
  const digits = stripCep(value)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name)
}

export function buildEnderecoCompleto(parts: {
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
}) {
  const street = [parts.logradouro?.trim(), parts.numero?.trim()].filter(Boolean).join(', ')
  const withComplement = [street, parts.complemento?.trim()].filter(Boolean).join(' — ')
  const districtCity = [parts.bairro?.trim(), parts.cidade?.trim()].filter(Boolean).join(', ')
  const withUf = [districtCity, parts.uf?.trim()].filter(Boolean).join(' - ')
  const cep = parts.cep ? formatCep(parts.cep) : ''
  return [withComplement, withUf, cep ? `CEP ${cep}` : ''].filter(Boolean).join(' · ')
}

export async function fetchAddressByCep(cep: string): Promise<ViaCepAddress | null> {
  const digits = stripCep(cep)
  if (digits.length !== 8) return null

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
  if (!response.ok) throw new Error('viacep_failed')

  const data = (await response.json()) as ViaCepAddress
  if (data.erro) return null
  return data
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation_unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}
