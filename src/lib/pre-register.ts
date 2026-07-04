import { cnpjDigits } from './cnpj'

const STORAGE_KEY = 'teuposto:preRegistrations'

export interface PreRegistration {
  postoName: string
  email: string
  phone: string
  reachedPayment: boolean
  updatedAt: string
}

function readAll(): Record<string, PreRegistration> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, PreRegistration>
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, PreRegistration>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function savePreRegistration(
  cnpj: string,
  data: Pick<PreRegistration, 'postoName' | 'email' | 'phone'> & { reachedPayment?: boolean },
) {
  const key = cnpjDigits(cnpj)
  if (key.length !== 14) return

  const all = readAll()
  all[key] = {
    postoName: data.postoName,
    email: data.email,
    phone: data.phone,
    reachedPayment: data.reachedPayment ?? true,
    updatedAt: new Date().toISOString(),
  }
  writeAll(all)
}

export function getPreRegistration(cnpj: string): PreRegistration | null {
  const key = cnpjDigits(cnpj)
  if (key.length !== 14) return null
  return readAll()[key] ?? null
}

export function clearPreRegistration(cnpj: string) {
  const key = cnpjDigits(cnpj)
  if (!key) return

  const all = readAll()
  delete all[key]
  writeAll(all)
}

export function isUserAlreadyRegisteredError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('user already exists') ||
    normalized.includes('já está cadastrado') ||
    normalized.includes('já registrado')
  )
}
