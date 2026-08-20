import { supabase } from './supabase'
import { formatCnpj } from './cnpj'

export type AdminAccount = {
  id: string
  nome: string
  cnpj: string
  email: string | null
  telefone: string | null
  subscription_status: 'pending_payment' | 'active' | 'expired'
  subscription_ends_at: string | null
  user_id: string | null
  created_at: string
}

async function parsePayload<T>(data: T | null, error: unknown): Promise<T | null> {
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

async function invokeAdminOps<T>(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  let accessToken = session?.access_token
  if (!accessToken) {
    const refreshed = await supabase.auth.refreshSession()
    accessToken = refreshed.data.session?.access_token
  }

  if (!accessToken) {
    return { payload: null as T | null, invokeFailed: true }
  }

  const { data, error } = await supabase.functions.invoke('admin-ops', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const payload = await parsePayload<T>(data as T | null, error)
  return { payload, invokeFailed: !payload && Boolean(error) }
}

export async function listAdminAccounts(): Promise<AdminAccount[]> {
  const { payload, invokeFailed } = await invokeAdminOps<{
    ok: boolean
    message?: string
    accounts?: AdminAccount[]
  }>({ action: 'list_accounts' })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível carregar as contas.')
  }

  return payload.accounts ?? []
}

export async function unlockAdminAccount(postoId: string): Promise<AdminAccount> {
  const { payload, invokeFailed } = await invokeAdminOps<{
    ok: boolean
    message?: string
    account?: AdminAccount
  }>({ action: 'unlock_access', posto_id: postoId })

  if (invokeFailed || !payload?.ok || !payload.account) {
    throw new Error(payload?.message || 'Não foi possível liberar o acesso.')
  }

  return payload.account
}

export async function pauseAdminAccount(postoId: string): Promise<AdminAccount> {
  const { payload, invokeFailed } = await invokeAdminOps<{
    ok: boolean
    message?: string
    account?: AdminAccount
  }>({ action: 'pause_access', posto_id: postoId })

  if (invokeFailed || !payload?.ok || !payload.account) {
    throw new Error(payload?.message || 'Não foi possível pausar o acesso.')
  }

  return payload.account
}

export async function startAdminImpersonation(postoId: string) {
  const { payload, invokeFailed } = await invokeAdminOps<{
    ok: boolean
    message?: string
    token_hash?: string
    posto?: { id: string; nome: string; cnpj: string; email: string }
  }>({ action: 'impersonate', posto_id: postoId })

  if (invokeFailed || !payload?.ok || !payload.token_hash || !payload.posto) {
    throw new Error(payload?.message || 'Não foi possível entrar na conta.')
  }

  const label = `${payload.posto.nome} · CNPJ ${formatCnpj(payload.posto.cnpj)}`
  const url = `${window.location.origin}/impersonate?token=${encodeURIComponent(payload.token_hash)}&label=${encodeURIComponent(label)}`
  const popup = window.open(url, '_blank', 'noopener,noreferrer')
  if (!popup) {
    throw new Error('O navegador bloqueou a nova aba. Permita pop-ups e tente novamente.')
  }
}

export async function deleteAdminAccount(postoId: string) {
  const { payload, invokeFailed } = await invokeAdminOps<{
    ok: boolean
    message?: string
    posto_id?: string
  }>({ action: 'delete_account', posto_id: postoId })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível excluir a conta.')
  }

  return payload
}

export async function setAdminAccountPassword(postoId: string, password: string) {
  const { payload, invokeFailed } = await invokeAdminOps<{
    ok: boolean
    message?: string
    posto_id?: string
  }>({ action: 'set_password', posto_id: postoId, password })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível alterar a senha.')
  }

  return payload
}

export function subscriptionStatusLabel(status: AdminAccount['subscription_status']) {
  if (status === 'active') return 'Ativo'
  if (status === 'expired') return 'Inativo'
  return 'Aguardando pagamento'
}
