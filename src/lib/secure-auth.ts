import { supabase } from './supabase'
import type { SecureLoginResult, SecureRegisterResult } from './secure-auth.types'

export type { SecureLoginResult, SecureRegisterResult } from './secure-auth.types'

export async function secureLogin(identifier: string, password: string): Promise<SecureLoginResult> {
  const { data, error } = await supabase.functions.invoke('secure-auth', {
    body: { action: 'login', identifier: identifier.trim(), password },
  })

  if (error) {
    return { ok: false, code: 'network', message: 'Não foi possível realizar o login. Tente novamente.' }
  }

  if (!data?.ok) {
    return {
      ok: false,
      code: data.code ?? 'network',
      message: data.message ?? 'Não foi possível realizar o login.',
      posto: data.posto,
      attempts_left: data.attempts_left,
    }
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })

  if (sessionError) {
    return { ok: false, code: 'network', message: 'Não foi possível iniciar a sessão. Tente novamente.' }
  }

  return { ok: true }
}

export async function secureRegister(payload: {
  email: string
  password: string
  postoName: string
  cnpj: string
  phone: string
  website?: string
}): Promise<SecureRegisterResult> {
  const { data, error } = await supabase.functions.invoke('secure-auth', {
    body: { action: 'register', ...payload },
  })

  if (error) {
    return { ok: false, code: 'network', message: 'Não foi possível concluir o cadastro. Tente novamente.' }
  }

  return data as SecureRegisterResult
}

export async function secureActivatePayment(cnpj: string) {
  const { data, error } = await supabase.functions.invoke('secure-auth', {
    body: { action: 'activate_payment', cnpj },
  })

  if (error || !data?.ok) {
    throw new Error(data?.message ?? 'payment_activation_failed')
  }
}

export async function clearLoginLockout(identifier: string) {
  await supabase.functions.invoke('secure-auth', {
    body: { action: 'clear_lockout', identifier },
  })
}
