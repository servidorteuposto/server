import { supabase } from './supabase'
import { looksLikeEmail } from './cnpj'

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

export async function requestPasswordResetByCnpj(cnpj: string) {
  const { data: email, error: lookupError } = await supabase.rpc('get_email_by_cnpj', {
    p_cnpj: cnpj,
  })

  if (lookupError) {
    throw lookupError
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
