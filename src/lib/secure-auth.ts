import { supabase } from './supabase'
import type { SecureLoginResult, SecureRegisterResult } from './secure-auth.types'

export type { SecureLoginResult, SecureRegisterResult } from './secure-auth.types'

async function parseFunctionPayload<T>(data: T | null, error: unknown): Promise<T | null> {
  if (data) return data

  if (!error || typeof error !== 'object' || !('context' in error)) {
    return null
  }

  const context = (error as { context?: unknown }).context

  if (context instanceof Response) {
    try {
      return (await context.json()) as T
    } catch {
      return null
    }
  }

  if (context && typeof context === 'object' && 'json' in context && typeof context.json === 'function') {
    try {
      return (await context.json()) as T
    } catch {
      return null
    }
  }

  if (context && typeof context === 'object' && 'body' in context) {
    const body = (context as { body?: unknown }).body
    if (typeof body === 'string') {
      try {
        return JSON.parse(body) as T
      } catch {
        return null
      }
    }
    if (body && typeof body === 'object') {
      return body as T
    }
  }

  return null
}

async function invokeSecureAuth<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('secure-auth', { body })
  const payload = await parseFunctionPayload<T>(data as T | null, error)
  return { payload, invokeFailed: !payload && Boolean(error) }
}

type SecureAuthLoginPayload = {
  ok: boolean
  code?: string
  message?: string
  posto?: {
    nome: string
    cnpj: string
    telefone: string
    email: string
  }
  attempts_left?: number
  session?: { access_token: string; refresh_token: string }
}

export async function secureLogin(identifier: string, password: string): Promise<SecureLoginResult> {
  const { payload, invokeFailed } = await invokeSecureAuth<SecureAuthLoginPayload>({
    action: 'login',
    identifier: identifier.trim(),
    password,
  })

  if (invokeFailed || !payload) {
    return {
      ok: false,
      code: 'network',
      message:
        'Serviço de autenticação indisponível. Verifique se a Edge Function secure-auth está publicada no Supabase.',
    }
  }

  if (!payload.ok) {
    return {
      ok: false,
      code: (payload.code as SecureLoginResult extends { ok: false } ? SecureLoginResult['code'] : never) ?? 'network',
      message: payload.message ?? 'Não foi possível realizar o login.',
      posto: payload.posto,
      attempts_left: payload.attempts_left,
    }
  }

  if (!payload.session) {
    return { ok: false, code: 'network', message: 'Não foi possível iniciar a sessão. Tente novamente.' }
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  })

  if (sessionError) {
    return { ok: false, code: 'network', message: 'Não foi possível iniciar a sessão. Tente novamente.' }
  }

  return { ok: true }
}

export async function secureRegister(input: {
  email: string
  password: string
  postoName: string
  cnpj: string
  phone: string
  website?: string
}): Promise<SecureRegisterResult> {
  const { payload, invokeFailed } = await invokeSecureAuth<SecureRegisterResult>({
    action: 'register',
    ...input,
  })

  if (invokeFailed || !payload) {
    return { ok: false, code: 'network', message: 'Não foi possível concluir o cadastro. Tente novamente.' }
  }

  return payload
}

export async function secureActivatePayment(cnpj: string) {
  const { payload, invokeFailed } = await invokeSecureAuth<{ ok: boolean; message?: string }>({
    action: 'activate_payment',
    cnpj,
  })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message ?? 'payment_activation_failed')
  }
}

export async function clearLoginLockout(identifier: string) {
  await supabase.functions.invoke('secure-auth', {
    body: { action: 'clear_lockout', identifier },
  })
}
