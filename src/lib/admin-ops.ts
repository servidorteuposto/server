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
  const { data, error } = await supabase.functions.invoke('admin-ops', { body })
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

export function subscriptionStatusLabel(status: AdminAccount['subscription_status']) {
  if (status === 'active') return 'Ativo'
  if (status === 'expired') return 'Expirado'
  return 'Aguardando pagamento'
}
