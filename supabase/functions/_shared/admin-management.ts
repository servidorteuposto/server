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

/** Extrai instanceId/token do WHATSAPP_WEBHOOK_URL e consulta /status + /me na Z-API. */
export function parseZApiDueTimestamp(due: unknown): string | null {
  const n = typeof due === 'number' ? due : Number(due)
  if (!Number.isFinite(n) || n <= 0) return null
  // Partner API às vezes manda ms; /me costuma mandar segundos.
  const ms = n > 1e12 ? n : n * 1000
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

export async function fetchZApiStatus() {
  const empty = {
    configured: false as const,
    connected: false,
    smartphone_connected: null as boolean | null,
    message: 'WHATSAPP_WEBHOOK_URL não configurada.',
    detail: null as string | null,
    checked_at: new Date().toISOString(),
    due_on: null as string | null,
    days_left: null as number | null,
    payment_status: null as string | null,
    instance_name: null as string | null,
    warn_7d: false,
    warn_2d: false,
    expired: false,
  }

  const webhookUrl = Deno.env.get('WHATSAPP_WEBHOOK_URL')
  const apiKey = Deno.env.get('WHATSAPP_API_KEY')

  if (!webhookUrl) return empty

  const match = webhookUrl.match(/\/instances\/([^/]+)\/token\/([^/]+)/i)
  if (!match) {
    return {
      ...empty,
      message: 'URL Z-API inválida (esperado .../instances/{id}/token/{token}/...).',
    }
  }

  const [, instanceId, instanceToken] = match
  const headers = {
    ...(apiKey
      ? {
          'Client-Token': apiKey,
          Authorization: `Bearer ${apiKey}`,
        }
      : {}),
  }
  const statusUrl = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/status`
  const meUrl = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/me`

  try {
    const [statusRes, meRes] = await Promise.all([
      fetch(statusUrl, { method: 'GET', headers }),
      fetch(meUrl, { method: 'GET', headers }),
    ])

    let connected = false
    let smartphoneConnected: boolean | null = null
    let detail: string | null = null
    let message = 'Instância Z-API consultada.'

    if (statusRes.ok) {
      const data = (await statusRes.json()) as {
        connected?: boolean
        smartphoneConnected?: boolean
        error?: string
      }
      connected = Boolean(data.connected)
      smartphoneConnected =
        typeof data.smartphoneConnected === 'boolean' ? data.smartphoneConnected : null
      detail = typeof data.error === 'string' ? data.error : null
      message = connected
        ? 'Instância Z-API conectada ao WhatsApp.'
        : 'Instância Z-API desconectada.'
    } else {
      const text = (await statusRes.text()).slice(0, 200)
      message = `Falha ao consultar status Z-API (HTTP ${statusRes.status}).`
      detail = text || null
    }

    let dueOn: string | null = null
    let paymentStatus: string | null = null
    let instanceName: string | null = null

    if (meRes.ok) {
      const me = (await meRes.json()) as {
        due?: number
        paymentStatus?: string
        name?: string
        connected?: boolean
      }
      dueOn = parseZApiDueTimestamp(me.due)
      paymentStatus = typeof me.paymentStatus === 'string' ? me.paymentStatus : null
      instanceName = typeof me.name === 'string' ? me.name : null
      // Se /status falhou mas /me respondeu, usa connected do /me.
      if (!statusRes.ok && typeof me.connected === 'boolean') {
        connected = me.connected
        message = connected
          ? 'Instância Z-API conectada ao WhatsApp.'
          : 'Instância Z-API desconectada.'
      }
    } else if (!statusRes.ok) {
      const text = (await meRes.text()).slice(0, 200)
      message = `Falha ao consultar Z-API (HTTP ${statusRes.status}/${meRes.status}).`
      detail = text || detail
    }

    const daysLeft = daysUntilDate(dueOn)

    return {
      configured: true as const,
      connected,
      smartphone_connected: smartphoneConnected,
      message,
      detail,
      checked_at: new Date().toISOString(),
      due_on: dueOn,
      days_left: daysLeft,
      payment_status: paymentStatus,
      instance_name: instanceName,
      warn_7d: daysLeft === 7,
      warn_2d: daysLeft != null && daysLeft <= 2 && daysLeft >= 0,
      expired: daysLeft != null && daysLeft < 0,
    }
  } catch (error) {
    console.error('fetchZApiStatus', error)
    return {
      ...empty,
      configured: true as const,
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

/** Remetente padrão dos alertas de infraestrutura. */
const DEFAULT_FROM = 'Teu Posto <noreply@appteuposto.com.br>'
const DEFAULT_REPLY_TO = 'Teu Posto Suporte <suporte@appteuposto.com.br>'

export const ALERT_REASON_LABELS: Record<string, string> = {
  supabase_db: 'Banco de dados perto do limite (≤10% restante)',
  supabase_storage: 'Storage perto do limite (≤10% restante)',
  resend_daily: 'Cota diária de e-mail perto do limite',
  resend_monthly: 'Cota mensal de e-mail perto do limite',
  domain_7d: 'Domínio vence em 7 dias',
  domain_2d: 'Domínio vence em 2 dias ou menos',
  domain_expired: 'Domínio expirado',
  zapi_disconnected: 'Z-API desconectada do WhatsApp',
  zapi_due_7d: 'Z-API vence em 7 dias',
  zapi_due_2d: 'Z-API vence em 2 dias ou menos',
  zapi_expired: 'Z-API vencida / assinatura expirada',
}

export function alertEmailSubject(key: string) {
  const label = ALERT_REASON_LABELS[key] ?? key
  return `Teu Posto — alerta: ${label}`
}

export function alertTextToHtml(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withBold = escaped.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
  return [
    '<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111;">',
    '<p style="margin:0 0 12px;"><strong>Alerta de infraestrutura — Teu Posto</strong></p>',
    `<p style="margin:0;white-space:pre-wrap;">${withBold.replace(/\n/g, '<br>')}</p>`,
    '<p style="margin:16px 0 0;color:#555;font-size:13px;">Abra o menu <strong>Gerenciamento</strong> no site para revisar.</p>',
    '</div>',
  ].join('')
}

export async function sendResendEmail(options: {
  to: string
  subject: string
  html: string
  from?: string
}): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from =
    options.from ??
    Deno.env.get('AUTH_EMAIL_FROM') ??
    Deno.env.get('SECURITY_EMAIL_FROM') ??
    DEFAULT_FROM
  const replyTo =
    Deno.env.get('SUPPORT_EMAIL_REPLY_TO') ??
    Deno.env.get('SUPPORT_EMAIL') ??
    DEFAULT_REPLY_TO

  if (!resendKey) {
    console.warn('RESEND_API_KEY not configured, skipping email')
    return false
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      reply_to: replyTo,
    }),
  })

  if (!response.ok) {
    console.error('Failed to send email', await response.text())
    return false
  }

  return true
}

export async function sendAdminAlertEmail(key: string, message: string) {
  return sendResendEmail({
    to: ADMIN_EMAIL,
    subject: alertEmailSubject(key),
    html: alertTextToHtml(message),
  })
}

export function zapiDisconnectedMessage(seed: string) {
  const variants = [
    '🚨 *Z-API desconectada — Teu Posto*\n\nA instância WhatsApp está offline.\nReconecte no painel Z-API para retomar os avisos.',
    '❗ *WhatsApp admin offline*\n\nZ-API sem conexão. Os lembretes automáticos ficam pausados até religar.',
    '🛑 *Alerta de infraestrutura*\n\nInstância Z-API desconectada.\nAbra o Gerenciamento / Z-API e reconecte.',
    '📢 *Teu Posto Admin*\n\nA API do WhatsApp (Z-API) está desconectada agora.',
    '⚠️ *Conexão WhatsApp perdida*\n\nReconecte a Z-API para voltar a enviar avisos.',
    '🔔 *Monitoramento*\n\nZ-API: status desconectado. Verifique o celular e a sessão.',
    '📣 *Aviso automático*\n\nWhatsApp via Z-API offline — ação necessária no Gerenciamento.',
    '🧰 *Manutenção*\n\nSem Z-API conectada, alertas e lembretes não saem.',
    '📡 *Status Z-API*\n\nDesconectada. Religue a instância o quanto antes.',
    '🧨 *Canal WhatsApp indisponível*\n\nZ-API offline. Reconecte para normalizar os envios.',
  ]
  return variants[pickVariantIndex(seed, variants.length)]
}

export function zapiDueAlertMessage(daysLeft: number, dueOn: string, seed: string) {
  const when = dueOn.slice(0, 10).split('-').reverse().join('/')
  if (daysLeft < 0) {
    const variants = [
      `🚨 *Z-API vencida — Teu Posto*\n\nAssinatura expirou em *${when}*.\nRenove no painel Z-API para manter os avisos.`,
      `❗ *Instância Z-API expirada*\n\nVenceu em *${when}*. Renove a assinatura agora.`,
      `🛑 *WhatsApp sem plano ativo*\n\nZ-API vencida desde *${when}*.`,
      `📢 *Teu Posto Admin*\n\nPlano Z-API expirado (*${when}*). Renove para retomar envios.`,
      `⚠️ *Renovação Z-API atrasada*\n\nVencimento: *${when}*. Regularize no painel Z-API.`,
      `🔔 *Alerta de assinatura*\n\nZ-API fora da validade desde *${when}*.`,
      `📣 *Infraestrutura*\n\nInstância Z-API vencida (*${when}*).`,
      `🧰 *Manutenção*\n\nSem plano Z-API ativo (venceu *${when}*).`,
      `📡 *Status de pagamento*\n\nZ-API expirada em *${when}*.`,
      `🧨 *Ação necessária*\n\nRenove a Z-API — vencida em *${when}*.`,
    ]
    return variants[pickVariantIndex(seed, variants.length)]
  }

  if (daysLeft <= 2) {
    const variants = [
      `🚨 *Z-API — renovação urgente*\n\nFaltam *${daysLeft} dia(s)* (vence em ${when}).\nRenove no painel Z-API.`,
      `❗ *Assinatura Z-API quase no fim*\n\nVencimento: *${when}* (${daysLeft} dia(s)).`,
      `🛑 *Alerta Z-API*\n\nRestam *${daysLeft} dia(s)* até ${when}.`,
      `📢 *Teu Posto — Z-API*\n\nPrazo crítico: *${daysLeft} dia(s)* até ${when}.`,
      `⚠️ *Renovação pendente*\n\nZ-API vence em *${when}* (*${daysLeft} dia(s)*).`,
      `🔑 *Plano Z-API em risco*\n\nSó *${daysLeft} dia(s)* até ${when}.`,
      `📆 *Contador Z-API*\n\n${daysLeft} dia(s) restantes · ${when}.`,
      `🔔 *Lembrete urgente*\n\nZ-API: *${daysLeft} dia(s)* (${when}).`,
      `📣 *Admin — Z-API*\n\nVence em ${when}. Restam *${daysLeft} dia(s)*.`,
      `🧨 *Últimos dias*\n\nZ-API expira em *${when}* (${daysLeft} dia(s)).`,
    ]
    return variants[pickVariantIndex(seed, variants.length)]
  }

  const variants = [
    `📅 *Z-API — 1 semana*\n\nVence em *${when}* (faltam *${daysLeft} dias*).\nPrograme a renovação no painel Z-API.`,
    `🔔 *Lembrete de Z-API*\n\nExpira em ${when} · *${daysLeft} dias* restantes.`,
    `📢 *Gerenciamento*\n\nAssinatura Z-API próxima do fim: *${daysLeft} dias* (${when}).`,
    `⚠️ *Renovação em breve*\n\nZ-API vence em ${when} (*${daysLeft} dias*).`,
    `📆 *Aviso antecipado*\n\nFaltam *${daysLeft} dias* para a Z-API (${when}).`,
    `🛠️ *Infraestrutura*\n\nLembrete: renovar Z-API até ${when} (${daysLeft} dias).`,
    `📣 *Teu Posto Admin*\n\nZ-API: ${when} · ${daysLeft} dias restantes.`,
    `📌 *Checklist*\n\nItem: renovar Z-API (*${daysLeft} dias* · ${when}).`,
    `🗓️ *Calendário*\n\nZ-API em *${daysLeft} dias* (${when}).`,
    `✅ *Previna interrupção*\n\nRenove a Z-API antes de ${when} (${daysLeft} dias).`,
  ]
  return variants[pickVariantIndex(seed, variants.length)]
}

export type AttentionReason = { code: string; label: string }

// Cliente service_role (createClient) — tipagem frouxa para Deno Edge.
// deno-lint-ignore no-explicit-any
export type ManagementAlertClient = any

export async function loadManagementSettingsRow(admin: ManagementAlertClient) {
  const { data, error } = await admin
    .from('admin_management_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error

  const row = data ?? {}
  return {
    alert_whatsapp_1: (row.alert_whatsapp_1 as string | null) ?? null,
    alert_whatsapp_2: (row.alert_whatsapp_2 as string | null) ?? null,
    domain_expires_on: (row.domain_expires_on as string | null) ?? null,
    quotas: normalizeQuotas(row.quotas),
    last_alerts:
      row.last_alerts && typeof row.last_alerts === 'object'
        ? (row.last_alerts as Record<string, string>)
        : {},
  }
}

export async function collectAttentionReasons(admin: ManagementAlertClient): Promise<{
  needs_attention: boolean
  reasons: AttentionReason[]
  db_bytes: number
  storage_bytes: number
  quotas: ManagementQuotas
  domain_expires_on: string | null
  domain_days_left: number | null
  resend_daily_used: number | null
  resend_monthly_used: number | null
  zapi: Awaited<ReturnType<typeof fetchZApiStatus>>
  settings: Awaited<ReturnType<typeof loadManagementSettingsRow>>
}> {
  const settings = await loadManagementSettingsRow(admin)
  const [{ data: metrics, error: metricsError }, resend, zapi] = await Promise.all([
    admin.rpc('admin_management_metrics'),
    fetchResendStats(),
    fetchZApiStatus(),
  ])
  if (metricsError) throw metricsError

  const dbBytes = Number(metrics?.db_bytes ?? 0)
  const storageBytes = Number(metrics?.storage_bytes ?? 0)
  const dailyUsed = resend.daily_used ?? resend.emails_today
  const monthlyUsed = resend.monthly_used
  const daysLeft = daysUntilDate(settings.domain_expires_on)
  const reasons: AttentionReason[] = []

  if (zapi.configured && !zapi.connected) {
    reasons.push({
      code: 'zapi_disconnected',
      label: ALERT_REASON_LABELS.zapi_disconnected,
    })
  }
  if (zapi.due_on && zapi.days_left != null) {
    if (zapi.days_left < 0) {
      reasons.push({ code: 'zapi_expired', label: ALERT_REASON_LABELS.zapi_expired })
    } else if (zapi.days_left === 7) {
      reasons.push({ code: 'zapi_due_7d', label: ALERT_REASON_LABELS.zapi_due_7d })
    } else if (zapi.days_left <= 2) {
      reasons.push({ code: 'zapi_due_2d', label: ALERT_REASON_LABELS.zapi_due_2d })
    }
  }
  if (isNearLimit(dbBytes, settings.quotas.db_bytes)) {
    reasons.push({ code: 'supabase_db', label: ALERT_REASON_LABELS.supabase_db })
  }
  if (isNearLimit(storageBytes, settings.quotas.storage_bytes)) {
    reasons.push({ code: 'supabase_storage', label: ALERT_REASON_LABELS.supabase_storage })
  }
  if (dailyUsed != null && isNearLimit(dailyUsed, settings.quotas.resend_daily)) {
    reasons.push({ code: 'resend_daily', label: ALERT_REASON_LABELS.resend_daily })
  }
  if (monthlyUsed != null && isNearLimit(monthlyUsed, settings.quotas.resend_monthly)) {
    reasons.push({ code: 'resend_monthly', label: ALERT_REASON_LABELS.resend_monthly })
  }
  if (daysLeft != null && settings.domain_expires_on) {
    if (daysLeft < 0) {
      reasons.push({ code: 'domain_expired', label: ALERT_REASON_LABELS.domain_expired })
    } else if (daysLeft === 7) {
      reasons.push({ code: 'domain_7d', label: ALERT_REASON_LABELS.domain_7d })
    } else if (daysLeft <= 2) {
      reasons.push({ code: 'domain_2d', label: ALERT_REASON_LABELS.domain_2d })
    }
  }

  return {
    needs_attention: reasons.length > 0,
    reasons,
    db_bytes: dbBytes,
    storage_bytes: storageBytes,
    quotas: settings.quotas,
    domain_expires_on: settings.domain_expires_on,
    domain_days_left: daysLeft,
    resend_daily_used: dailyUsed,
    resend_monthly_used: monthlyUsed,
    zapi,
    settings,
  }
}

/** Envia WhatsApp (se aplicável) + e-mail ao admin, com dedupe diário via last_alerts. */
export async function processManagementAlerts(admin: ManagementAlertClient) {
  const attention = await collectAttentionReasons(admin)
  const phones = collectAdminAlertPhones(attention.settings)
  const sent: string[] = []
  const skipped: string[] = []
  const today = saoPauloTodayKey()
  const lastAlerts = { ...attention.settings.last_alerts }
  const {
    db_bytes: dbBytes,
    storage_bytes: storageBytes,
    quotas,
    domain_expires_on: domainExpires,
    domain_days_left: daysLeft,
    resend_daily_used: dailyUsed,
    resend_monthly_used: monthlyUsed,
    zapi,
  } = attention

  async function maybeNotify(
    key: string,
    shouldSend: boolean,
    message: string,
    options?: { whatsapp?: boolean },
  ) {
    const useWhatsApp = options?.whatsapp !== false
    if (!shouldSend) {
      skipped.push(`${key}:ok`)
      return
    }
    if (alertAlreadySentToday(lastAlerts, key)) {
      skipped.push(`${key}:already_sent`)
      return
    }

    let delivered = false

    if (useWhatsApp) {
      if (!phones.length) {
        skipped.push(`${key}:no_phones`)
      } else {
        const results = await Promise.all(phones.map((p) => sendWhatsApp(p, message)))
        if (results.some(Boolean)) delivered = true
        else skipped.push(`${key}:whatsapp_failed`)
      }
    }

    const emailOk = await sendAdminAlertEmail(key, message)
    if (emailOk) delivered = true
    else skipped.push(`${key}:email_failed`)

    if (delivered) {
      lastAlerts[key] = today
      sent.push(key)
    } else {
      skipped.push(`${key}:send_failed`)
    }
  }

  await maybeNotify(
    'zapi_disconnected',
    zapi.configured && !zapi.connected,
    zapiDisconnectedMessage(`${today}:zapi`),
    { whatsapp: false },
  )
  if (zapi.due_on && zapi.days_left != null) {
    if (zapi.days_left < 0) {
      await maybeNotify(
        'zapi_expired',
        true,
        zapiDueAlertMessage(zapi.days_left, zapi.due_on, `${today}:zapi:expired`),
        { whatsapp: zapi.connected },
      )
    } else if (zapi.days_left === 7) {
      await maybeNotify(
        'zapi_due_7d',
        true,
        zapiDueAlertMessage(zapi.days_left, zapi.due_on, `${today}:zapi:d7`),
        { whatsapp: zapi.connected },
      )
    } else if (zapi.days_left <= 2) {
      await maybeNotify(
        'zapi_due_2d',
        true,
        zapiDueAlertMessage(zapi.days_left, zapi.due_on, `${today}:zapi:d2`),
        { whatsapp: zapi.connected },
      )
    } else {
      skipped.push(`zapi_due:days_${zapi.days_left}`)
    }
  } else {
    skipped.push('zapi_due:not_available')
  }
  await maybeNotify(
    'supabase_db',
    isNearLimit(dbBytes, quotas.db_bytes),
    resourceAlertMessage('supabase_db', dbBytes, quotas.db_bytes, `${today}:db:${dbBytes}`),
  )
  await maybeNotify(
    'supabase_storage',
    isNearLimit(storageBytes, quotas.storage_bytes),
    resourceAlertMessage(
      'supabase_storage',
      storageBytes,
      quotas.storage_bytes,
      `${today}:storage:${storageBytes}`,
    ),
  )
  if (dailyUsed != null) {
    await maybeNotify(
      'resend_daily',
      isNearLimit(dailyUsed, quotas.resend_daily),
      resourceAlertMessage('resend_daily', dailyUsed, quotas.resend_daily, `${today}:resend:d`),
    )
  } else {
    skipped.push('resend_daily:no_data')
  }
  if (monthlyUsed != null) {
    await maybeNotify(
      'resend_monthly',
      isNearLimit(monthlyUsed, quotas.resend_monthly),
      resourceAlertMessage(
        'resend_monthly',
        monthlyUsed,
        quotas.resend_monthly,
        `${today}:resend:m`,
      ),
    )
  } else {
    skipped.push('resend_monthly:no_data')
  }

  if (daysLeft != null && domainExpires) {
    if (daysLeft < 0) {
      await maybeNotify(
        'domain_expired',
        true,
        domainAlertMessage(0, domainExpires, `${today}:domain:expired`),
      )
    } else if (daysLeft === 7) {
      await maybeNotify(
        'domain_7d',
        true,
        domainAlertMessage(daysLeft, domainExpires, `${today}:domain7`),
      )
    } else if (daysLeft <= 2) {
      await maybeNotify(
        'domain_2d',
        true,
        domainAlertMessage(daysLeft, domainExpires, `${today}:domain2:${daysLeft}`),
      )
    } else {
      skipped.push(`domain:days_${daysLeft}`)
    }
  } else {
    skipped.push('domain:not_set')
  }

  if (sent.length) {
    await admin
      .from('admin_management_settings')
      .update({ last_alerts: lastAlerts, updated_at: new Date().toISOString() })
      .eq('id', 1)
  }

  return {
    sent,
    skipped,
    phones: phones.length,
    last_alerts: lastAlerts,
    needs_attention: attention.needs_attention,
    reasons: attention.reasons,
  }
}
