import { supabase } from './supabase'

export type ManagementQuotas = {
  db_bytes: number
  storage_bytes: number
  vercel_bandwidth_bytes: number
}

export type ManagementSettings = {
  alert_whatsapp_1: string | null
  alert_whatsapp_2: string | null
  domain_expires_on: string | null
  quotas: ManagementQuotas
  last_alerts: Record<string, string>
  updated_at: string | null
}

export type UsageBar = {
  used_bytes: number
  quota_bytes: number
  percent: number
  near_limit: boolean
  used_label: string
  quota_label: string
}

export type ManagementDashboard = {
  generated_at: string
  settings: ManagementSettings
  postos: { total: number; active: number; inactive: number }
  supabase: {
    today: string
    db: UsageBar
    storage: UsageBar & {
      buckets: Array<{ bucket: string; bytes: number; objects: number }>
    }
    tables: Array<{ schema: string; name: string; bytes: number }>
    flow_today: Record<string, number>
  }
  vercel: {
    configured: boolean
    message?: string
    project?: { id?: unknown; name?: unknown; framework?: unknown; updatedAt?: unknown } | null
    bandwidth_bytes: number | null
    bandwidth_percent: number | null
    bandwidth_near_limit: boolean
    bandwidth_quota_bytes: number
    bandwidth_used_label: string | null
    bandwidth_quota_label: string
    usage_error?: string | null
  }
  access: {
    security_alerts_today: number
    registration_attempts_today: number
    support_tickets_today: number
    mp_payments_today: number
    whatsapp_reminders_today: number
    active_postos: number
  }
  domain: {
    expires_on: string | null
    days_left: number | null
    warn_7d: boolean
    warn_2d: boolean
    expired: boolean
  }
}

export type ManagementPosto = {
  id: string
  nome: string
  cnpj: string
  email: string | null
  telefone: string | null
  endereco: string
  avisos: string[]
  subscription_status: string
  subscription_ends_at: string | null
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

async function invokeManagement<T>(body: Record<string, unknown>) {
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

  const { data, error } = await supabase.functions.invoke('admin-management', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const payload = await parsePayload<T>(data as T | null, error)
  return { payload, invokeFailed: !payload && Boolean(error) }
}

export async function getManagementDashboard(): Promise<ManagementDashboard> {
  const { payload, invokeFailed } = await invokeManagement<
    ManagementDashboard & { ok: boolean; message?: string }
  >({ action: 'get_dashboard' })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível carregar o Gerenciamento.')
  }

  return payload
}

export async function listManagementPostos(
  filter: 'active' | 'inactive' | 'all',
): Promise<ManagementPosto[]> {
  const { payload, invokeFailed } = await invokeManagement<{
    ok: boolean
    message?: string
    postos?: ManagementPosto[]
  }>({ action: 'list_postos', filter })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível listar os postos.')
  }

  return payload.postos ?? []
}

export async function saveManagementSettings(input: {
  alert_whatsapp_1: string
  alert_whatsapp_2: string
  domain_expires_on: string
  quotas_gb: { db_gb: number; storage_gb: number; vercel_bandwidth_gb: number }
}) {
  const { payload, invokeFailed } = await invokeManagement<{
    ok: boolean
    message?: string
    settings?: ManagementSettings
  }>({
    action: 'save_settings',
    ...input,
  })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível salvar as configurações.')
  }

  return payload.settings
}

export async function runManagementAlertCheck() {
  const { payload, invokeFailed } = await invokeManagement<{
    ok: boolean
    message?: string
    sent?: string[]
    skipped?: string[]
  }>({ action: 'run_alert_check' })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível executar a verificação de alertas.')
  }

  return payload
}

export function bytesToGb(bytes: number) {
  return Math.round((bytes / 1024 ** 3) * 100) / 100
}

export const FLOW_LABELS: Record<string, string> = {
  postos: 'Novos postos',
  regulatory_documents: 'Docs regulatórios',
  work_safety_documents: 'Docs segurança',
  fuel_analysis_reports: 'Análises / RAQ',
  diesel_drainage_reports: 'Drenagens',
  nozzle_metrology_verifications: 'Metrologia',
  support_tickets: 'Chamados',
  mp_payments: 'Pagamentos MP',
  security_alerts: 'Alertas de segurança',
  registration_attempts: 'Tentativas de cadastro',
  whatsapp_reminder_sends: 'Avisos WhatsApp',
}
