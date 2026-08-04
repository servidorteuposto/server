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

type PasswordResetPayload = {
  ok?: boolean
  sent?: boolean
  message?: string
}

async function parseFunctionPayload<T>(data: T | null, error: unknown): Promise<T | null> {
  if (data) return data
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (context instanceof Response) {
    try {
      return (await context.json()) as T
    } catch {
      return null
    }
  }
  return null
}

/** Envia recuperação pelo Resend (template Teu Posto), não pelo mailer padrão do Supabase. */
export async function requestPasswordResetByIdentifier(identifier: string) {
  const { data, error } = await supabase.functions.invoke('secure-auth', {
    body: {
      action: 'request_password_reset',
      identifier: identifier.trim(),
      redirectTo: `${window.location.origin}/?type=recovery`,
    },
  })

  const payload = await parseFunctionPayload<PasswordResetPayload>(data as PasswordResetPayload | null, error)

  if (!payload) {
    throw new Error('password_reset_unavailable')
  }

  if (!payload.ok) {
    throw new Error(payload.message || 'password_reset_failed')
  }

  return { sent: Boolean(payload.sent) as boolean }
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
