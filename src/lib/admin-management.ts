import { supabase } from './supabase'

export type ManagementQuotas = {
  db_bytes: number
  storage_bytes: number
  resend_daily: number
  resend_monthly: number
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

export type ResendQuotaBar = {
  used: number | null
  quota: number
  percent: number | null
  near_limit: boolean
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
  zapi: {
    configured: boolean
    connected: boolean
    smartphone_connected: boolean | null
    message: string
    detail: string | null
    checked_at: string
  }
  resend: {
    configured: boolean
    message?: string
    domains: Array<{ name: string; status: string }>
    recent: Array<{
      id: string
      to: string
      subject: string
      created_at: string
      last_event: string
    }>
    emails_today: number
    daily: ResendQuotaBar
    monthly: ResendQuotaBar
  }
  access: {
    security_alerts_today: number
    registration_attempts_today: number
    support_tickets_today: number
    mp_payments_today: number
    whatsapp_reminders_today: number
    whatsapp_account_locked_today: number
    whatsapp_sends_today: number
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

export type SecureFileMeta = {
  id: string
  title: string
  original_filename: string
  mime_type: 'application/pdf' | 'text/plain' | string
  size_bytes: number
  created_at: string
  locked_until: string | null
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

export async function listSecureFiles(): Promise<SecureFileMeta[]> {
  const { payload, invokeFailed } = await invokeManagement<{
    ok: boolean
    message?: string
    files?: SecureFileMeta[]
  }>({ action: 'list_secure_files' })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível listar os documentos seguros.')
  }

  return payload.files ?? []
}

export async function uploadSecureFile(input: {
  title: string
  password: string
  file: File
}): Promise<SecureFileMeta> {
  const content_base64 = await fileToBase64(input.file)
  const { payload, invokeFailed } = await invokeManagement<{
    ok: boolean
    message?: string
    file?: SecureFileMeta
  }>({
    action: 'upload_secure_file',
    title: input.title,
    password: input.password,
    filename: input.file.name,
    mime_type: input.file.type,
    content_base64,
  })

  if (invokeFailed || !payload?.ok || !payload.file) {
    throw new Error(payload?.message || 'Não foi possível anexar o arquivo.')
  }

  return payload.file
}

export async function unlockSecureFile(input: {
  fileId: string
  password: string
  mode: 'view' | 'download'
}) {
  const { payload, invokeFailed } = await invokeManagement<{
    ok: boolean
    message?: string
    url?: string
    mime_type?: string
    filename?: string
    title?: string
  }>({
    action: 'unlock_secure_file',
    file_id: input.fileId,
    password: input.password,
    mode: input.mode,
  })

  if (invokeFailed || !payload?.ok || !payload.url) {
    throw new Error(payload?.message || 'Senha incorreta ou arquivo indisponível.')
  }

  return {
    url: payload.url,
    mime_type: payload.mime_type ?? 'application/octet-stream',
    filename: payload.filename ?? 'arquivo',
    title: payload.title ?? 'Documento',
  }
}

export async function deleteSecureFile(fileId: string, password: string) {
  const { payload, invokeFailed } = await invokeManagement<{
    ok: boolean
    message?: string
  }>({ action: 'delete_secure_file', file_id: fileId, password })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível excluir o arquivo.')
  }
}

export function formatSecureFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
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
  quotas_gb: {
    db_gb: number
    storage_gb: number
    resend_daily: number
    resend_monthly: number
  }
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

export type ManagementAttention = {
  needs_attention: boolean
  reasons: Array<{ code: string; label: string }>
  zapi?: {
    configured: boolean
    connected: boolean
    message: string
  }
}

export async function getManagementAttention(): Promise<ManagementAttention> {
  const { payload, invokeFailed } = await invokeManagement<
    ManagementAttention & { ok: boolean; message?: string }
  >({ action: 'get_attention' })

  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível verificar alertas do Gerenciamento.')
  }

  return {
    needs_attention: Boolean(payload.needs_attention),
    reasons: payload.reasons ?? [],
    zapi: payload.zapi,
  }
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
  security_alerts: 'Conta bloqueada (WhatsApp)',
  registration_attempts: 'Tentativas de cadastro',
  whatsapp_reminder_sends: 'Lembretes operacionais WhatsApp',
  whatsapp_account_locked: 'Conta bloqueada (WhatsApp)',
  whatsapp_sends_total: 'Total WhatsApp (dia)',
}
