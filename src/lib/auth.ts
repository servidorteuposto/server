import { supabase } from './supabase'
import { cnpjDigits, looksLikeEmail } from './cnpj'

/** CNPJ seed do admin (aceito mesmo sem dígito verificador válido). */
export const ADMIN_CNPJ_DIGITS = '99999999000199'
export const ADMIN_EMAIL = 'servidorteuposto@gmail.com'

export async function resolveEmailFromIdentifier(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim()

  if (looksLikeEmail(trimmed)) {
    return trimmed
  }

  const { data, error } = await supabase.rpc('get_email_by_cnpj', { p_cnpj: trimmed })

  if (error) {
    throw error
  }

  return data
}

export async function requestPasswordResetByIdentifier(identifier: string) {
  const trimmed = identifier.trim()
  let email: string | null = null

  if (looksLikeEmail(trimmed)) {
    email = trimmed.toLowerCase()
  } else {
    const { data, error: lookupError } = await supabase.rpc('get_email_by_cnpj', {
      p_cnpj: trimmed,
    })

    if (lookupError) {
      throw lookupError
    }

    email = data
  }

  if (!email) {
    return { sent: false as const }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })

  if (error) {
    throw error
  }

  return { sent: true as const }
}

/** @deprecated Prefer requestPasswordResetByIdentifier */
export async function requestPasswordResetByCnpj(cnpj: string) {
  return requestPasswordResetByIdentifier(cnpj)
}

export function isAdminIdentifier(identifier: string) {
  const trimmed = identifier.trim().toLowerCase()
  if (looksLikeEmail(trimmed)) {
    return trimmed === ADMIN_EMAIL
  }
  return cnpjDigits(identifier) === ADMIN_CNPJ_DIGITS
}
