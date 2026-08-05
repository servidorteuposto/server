/** Helpers compartilhados: métricas, quotas e WhatsApp do painel Gerenciamento */

export const ADMIN_CNPJ_DIGITS = '99999999000199'
export const ADMIN_EMAIL = 'servidorteuposto@gmail.com'
export const WARN_REMAINING_RATIO = 0.1 // alerta quando resta ≤ 10%

export type ManagementQuotas = {
  db_bytes: number
  storage_bytes: number
  /** Cota diária Resend (free ≈ 100) */
  resend_daily: number
  /** Cota mensal Resend (free ≈ 3000) */
  resend_monthly: number
}

export type ManagementSettings = {
  id: number
  alert_whatsapp_1: string | null
  alert_whatsapp_2: string | null
  domain_expires_on: string | null
  quotas: ManagementQuotas
  last_alerts: Record<string, string>
  updated_at: string | null
  updated_by: string | null
}

export const DEFAULT_QUOTAS: ManagementQuotas = {
  db_bytes: 512 * 1024 ** 2, // 0.5 GB free
  storage_bytes: 1 * 1024 ** 3, // 1 GB free
  resend_daily: 100,
  resend_monthly: 3000,
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function isAdminAccount(user: {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}) {
  return String(user.email ?? '')
    .trim()
    .toLowerCase() === ADMIN_EMAIL
}

export function toZApiPhone(phone: string) {
  let digits = onlyDigits(phone)
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function normalizeQuotas(raw: unknown): ManagementQuotas {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    db_bytes: Number(obj.db_bytes) > 0 ? Number(obj.db_bytes) : DEFAULT_QUOTAS.db_bytes,
    storage_bytes:
      Number(obj.storage_bytes) > 0 ? Number(obj.storage_bytes) : DEFAULT_QUOTAS.storage_bytes,
    resend_daily:
      Number(obj.resend_daily) > 0 ? Number(obj.resend_daily) : DEFAULT_QUOTAS.resend_daily,
    resend_monthly:
      Number(obj.resend_monthly) > 0 ? Number(obj.resend_monthly) : DEFAULT_QUOTAS.resend_monthly,
  }
}

export function usagePercent(used: number, quota: number) {
  if (!quota || quota <= 0) return 0
  return Math.min(100, Math.round((used / quota) * 1000) / 10)
}

export function remainingRatio(used: number, quota: number) {
  if (!quota || quota <= 0) return 1
  return Math.max(0, (quota - used) / quota)
}

export function isNearLimit(used: number, quota: number) {
  return remainingRatio(used, quota) <= WARN_REMAINING_RATIO
}

export function saoPauloTodayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function daysUntilDate(dateKey: string | null | undefined) {
  if (!dateKey) return null
  const today = saoPauloTodayKey()
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = dateKey.slice(0, 10).split('-').map(Number)
  const a = Date.UTC(y1, m1 - 1, d1)
  const b = Date.UTC(y2, m2 - 1, d2)
  return Math.round((b - a) / 86_400_000)
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function pickVariantIndex(seed: string, count = 10) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % count
}

export async function sendWhatsApp(phone: string, message: string) {
  const webhookUrl = Deno.env.get('WHATSAPP_WEBHOOK_URL')
  const apiKey = Deno.env.get('WHATSAPP_API_KEY')
  if (!webhookUrl) {
    console.warn('WHATSAPP_WEBHOOK_URL not configured')
    return false
  }

  const normalized = toZApiPhone(phone)
  if (normalized.length < 12) return false

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey
        ? {
            'Client-Token': apiKey,
            Authorization: `Bearer ${apiKey}`,
          }
        : {}),
    },
    body: JSON.stringify({ phone: normalized, message }),
  })

  if (!response.ok) {
    console.error('WhatsApp send failed', normalized, await response.text())
    return false
  }
  return true
}

/** Extrai instanceId/token do WHATSAPP_WEBHOOK_URL e consulta /status na Z-API. */
export async function fetchZApiStatus() {
  const webhookUrl = Deno.env.get('WHATSAPP_WEBHOOK_URL')
  const apiKey = Deno.env.get('WHATSAPP_API_KEY')

  if (!webhookUrl) {
    return {
      configured: false as const,
      connected: false,
      smartphone_connected: null as boolean | null,
      message: 'WHATSAPP_WEBHOOK_URL não configurada.',
      detail: null as string | null,
      checked_at: new Date().toISOString(),
    }
  }

  const match = webhookUrl.match(/\/instances\/([^/]+)\/token\/([^/]+)/i)
  if (!match) {
    return {
      configured: false as const,
      connected: false,
      smartphone_connected: null as boolean | null,
      message: 'URL Z-API inválida (esperado .../instances/{id}/token/{token}/...).',
      detail: null as string | null,
      checked_at: new Date().toISOString(),
    }
  }

  const [, instanceId, instanceToken] = match
  const statusUrl = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/status`

  try {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        ...(apiKey
          ? {
              'Client-Token': apiKey,
              Authorization: `Bearer ${apiKey}`,
            }
          : {}),
      },
    })

    if (!response.ok) {
      const text = (await response.text()).slice(0, 200)
      return {
        configured: true as const,
        connected: false,
        smartphone_connected: null as boolean | null,
        message: `Falha ao consultar Z-API (HTTP ${response.status}).`,
        detail: text || null,
        checked_at: new Date().toISOString(),
      }
    }

    const data = (await response.json()) as {
      connected?: boolean
      smartphoneConnected?: boolean
      error?: string
    }

    const connected = Boolean(data.connected)
    return {
      configured: true as const,
      connected,
      smartphone_connected:
        typeof data.smartphoneConnected === 'boolean' ? data.smartphoneConnected : null,
      message: connected
        ? 'Instância Z-API conectada ao WhatsApp.'
        : 'Instância Z-API desconectada.',
      detail: typeof data.error === 'string' ? data.error : null,
      checked_at: new Date().toISOString(),
    }
  } catch (error) {
    console.error('fetchZApiStatus', error)
    return {
      configured: true as const,
      connected: false,
      smartphone_connected: null as boolean | null,
      message: 'Erro ao consultar status da Z-API.',
      detail: String(error),
      checked_at: new Date().toISOString(),
    }
  }
}

export function collectAdminAlertPhones(settings: {
  alert_whatsapp_1?: string | null
  alert_whatsapp_2?: string | null
}) {
  const unique = new Set<string>()
  for (const raw of [settings.alert_whatsapp_1, settings.alert_whatsapp_2]) {
    if (!raw) continue
    const phone = toZApiPhone(raw)
    if (phone.length >= 12 && phone.length <= 15) unique.add(phone)
  }
  return [...unique]
}

export function alertAlreadySentToday(
  lastAlerts: Record<string, string> | null | undefined,
  key: string,
) {
  const last = lastAlerts?.[key]
  if (!last) return false
  return String(last).slice(0, 10) === saoPauloTodayKey()
}

export function resourceAlertMessage(
  kind: 'supabase_db' | 'supabase_storage' | 'resend_daily' | 'resend_monthly',
  used: number,
  quota: number,
  seed: string,
) {
  const pct = usagePercent(used, quota)
  const isEmail = kind === 'resend_daily' || kind === 'resend_monthly'
  const usedLabel = isEmail ? `${used} e-mails` : formatBytes(used)
  const quotaLabel = isEmail ? `${quota} e-mails` : formatBytes(quota)
  const labels = {
    supabase_db: 'Banco de dados (Supabase)',
    supabase_storage: 'Storage / buckets (Supabase)',
    resend_daily: 'Cota diária de e-mail (Resend)',
    resend_monthly: 'Cota mensal de e-mail (Resend)',
  } as const
  const label = labels[kind]

  const variants = [
    `⚠️ *Teu Posto — recurso quase esgotado*\n\n*${label}* está em *${pct}%* (${usedLabel} de ${quotaLabel}).\nRestam ≤10%. Considere aumentar o plano ou liberar espaço.`,
    `🚨 *Alerta de capacidade — Teu Posto*\n\n${label}: *${pct}%* usado (${usedLabel}/${quotaLabel}).\nAção recomendada: revisar uso ou upgrade.`,
    `📢 *Gerenciamento Teu Posto*\n\nAtenção: *${label}* perto do limite (*${pct}%*).\nUso: ${usedLabel} · Cota: ${quotaLabel}.`,
    `🛑 *Limite próximo*\n\n${label} em *${pct}%* (${usedLabel} de ${quotaLabel}).\nFaltam cerca de 10% ou menos.`,
    `📊 *Monitoramento*\n\n*${label}* · ${usedLabel} / ${quotaLabel} (*${pct}%*).\nVerifique o menu Gerenciamento.`,
    `❗ *Aviso de infraestrutura*\n\n${label} quase no teto da cota (*${pct}%*).\n${usedLabel} de ${quotaLabel}.`,
    `🔔 *Teu Posto Admin*\n\nRecurso crítico: *${label}* a *${pct}%*.\nLibere espaço ou amplie o plano.`,
    `📈 *Uso elevado*\n\n${label} chegou a *${pct}%* da cota (${usedLabel}/${quotaLabel}).`,
    `🧰 *Manutenção preventiva*\n\n*${label}* com pouco espaço restante (*${pct}%* usado).\nCota: ${quotaLabel}.`,
    `📣 *Alerta automático*\n\n${label}: ${usedLabel} de ${quotaLabel} (*${pct}%*).\nPainel: Gerenciamento no Teu Posto.`,
  ]
  return variants[pickVariantIndex(seed, variants.length)]
}

export function domainAlertMessage(daysLeft: number, expiresOn: string, seed: string) {
  const when = expiresOn.slice(0, 10).split('-').reverse().join('/')
  if (daysLeft <= 2) {
    const variants = [
      `🚨 *Domínio Teu Posto — renovação urgente*\n\nFaltam *${daysLeft} dia(s)* (vence em ${when}).\nRenove agora para não perder o domínio.`,
      `❗ *Domínio quase expirando*\n\nVencimento: *${when}* (${daysLeft} dia(s)).\nAção imediata necessária.`,
      `🛑 *Alerta de domínio*\n\nRestam *${daysLeft} dia(s)* para ${when}.\nRenove o registro do domínio.`,
      `📢 *Teu Posto — domínio*\n\nPrazo crítico: *${daysLeft} dia(s)* até ${when}.`,
      `⚠️ *Renovação pendente*\n\nDomínio vence em *${when}* (*${daysLeft} dia(s)*).`,
      `🔑 *Domínio em risco*\n\nSó *${daysLeft} dia(s)* até ${when}. Renove já.`,
      `📆 *Contador de domínio*\n\n${daysLeft} dia(s) restantes · ${when}.`,
      `🔔 *Lembrete urgente*\n\nDomínio Teu Posto: *${daysLeft} dia(s)* (${when}).`,
      `📣 *Admin — domínio*\n\nVence em ${when}. Restam *${daysLeft} dia(s)*.`,
      `🧨 *Últimos dias*\n\nDomínio expira em *${when}* (${daysLeft} dia(s)).`,
    ]
    return variants[pickVariantIndex(seed, variants.length)]
  }

  const variants = [
    `📅 *Domínio Teu Posto — 1 semana*\n\nVence em *${when}* (faltam *${daysLeft} dias*).\nPrograme a renovação.`,
    `🔔 *Lembrete de domínio*\n\nExpira em ${when} · *${daysLeft} dias* restantes.`,
    `📢 *Gerenciamento*\n\nDomínio próximo do fim: *${daysLeft} dias* (${when}).`,
    `⚠️ *Renovação em breve*\n\nDomínio vence em ${when} (*${daysLeft} dias*).`,
    `📆 *Aviso antecipado*\n\nFaltam *${daysLeft} dias* para o domínio (${when}).`,
    `🛠️ *Infraestrutura*\n\nLembrete: renovar domínio até ${when} (${daysLeft} dias).`,
    `📣 *Teu Posto Admin*\n\nDomínio: ${when} · ${daysLeft} dias restantes.`,
    `📌 *Checklist*\n\nItem: renovar domínio (*${daysLeft} dias* · ${when}).`,
    `🗓️ *Calendário*\n\nDomínio em *${daysLeft} dias* (${when}).`,
    `✅ *Previna indisponibilidade*\n\nRenove o domínio antes de ${when} (${daysLeft} dias).`,
  ]
  return variants[pickVariantIndex(seed, variants.length)]
}

export async function fetchResendStats() {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return {
      configured: false as const,
      message: 'Configure o secret RESEND_API_KEY para monitorar e-mails.',
      daily_used: null as number | null,
      monthly_used: null as number | null,
      recent: [] as Array<{ id: string; to: string; subject: string; created_at: string; last_event: string }>,
      domains: [] as Array<{ name: string; status: string }>,
      emails_today: 0,
    }
  }

  try {
    const headers = { Authorization: `Bearer ${apiKey}` }
    const [emailsRes, domainsRes] = await Promise.all([
      fetch('https://api.resend.com/emails?limit=100', { headers }),
      fetch('https://api.resend.com/domains', { headers }),
    ])

    const dailyHeader = emailsRes.headers.get('x-resend-daily-quota')
    const monthlyHeader = emailsRes.headers.get('x-resend-monthly-quota')
    const dailyUsed = dailyHeader != null && dailyHeader !== '' ? Number(dailyHeader) : null
    const monthlyUsed =
      monthlyHeader != null && monthlyHeader !== '' ? Number(monthlyHeader) : null

    let recent: Array<{
      id: string
      to: string
      subject: string
      created_at: string
      last_event: string
    }> = []
    let emailsToday = 0
    const today = saoPauloTodayKey()

    if (emailsRes.ok) {
      const payload = (await emailsRes.json()) as {
        data?: Array<{
          id?: string
          to?: string[] | string
          subject?: string
          created_at?: string
          last_event?: string
        }>
      }
      recent = (payload.data ?? []).slice(0, 3).map((row) => {
        const toRaw = Array.isArray(row.to) ? row.to.join(', ') : String(row.to ?? '—')
        return {
          id: String(row.id ?? ''),
          to: toRaw,
          subject: String(row.subject ?? '(sem assunto)'),
          created_at: String(row.created_at ?? ''),
          last_event: String(row.last_event ?? '—'),
        }
      })
      for (const row of payload.data ?? []) {
        const created = String(row.created_at ?? '')
        if (!created) continue
        const key = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(created))
        if (key === today) emailsToday += 1
      }
    }

    let domains: Array<{ name: string; status: string }> = []
    if (domainsRes.ok) {
      const payload = (await domainsRes.json()) as {
        data?: Array<{ name?: string; status?: string }>
      }
      domains = (payload.data ?? []).map((d) => ({
        name: String(d.name ?? '—'),
        status: String(d.status ?? 'unknown'),
      }))
    }

    const ok = emailsRes.ok
    return {
      configured: true as const,
      message: ok
        ? 'Resend conectado.'
        : `Falha ao listar e-mails (HTTP ${emailsRes.status}).`,
      daily_used: Number.isFinite(dailyUsed as number) ? dailyUsed : null,
      monthly_used: Number.isFinite(monthlyUsed as number) ? monthlyUsed : null,
      recent,
      domains,
      emails_today: emailsToday,
    }
  } catch (error) {
    console.error('fetchResendStats', error)
    return {
      configured: true as const,
      message: 'Falha ao consultar a API do Resend.',
      daily_used: null as number | null,
      monthly_used: null as number | null,
      recent: [],
      domains: [],
      emails_today: 0,
    }
  }
}
