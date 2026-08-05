/** Helpers compartilhados: métricas, quotas e WhatsApp do painel Gerenciamento */

export const ADMIN_CNPJ_DIGITS = '99999999000199'
export const ADMIN_EMAIL = 'servidorteuposto@gmail.com'
export const WARN_REMAINING_RATIO = 0.1 // alerta quando resta ≤ 10%

export type ManagementQuotas = {
  db_bytes: number
  storage_bytes: number
  vercel_bandwidth_bytes: number
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
  db_bytes: 8 * 1024 ** 3,
  storage_bytes: 100 * 1024 ** 3,
  vercel_bandwidth_bytes: 100 * 1024 ** 3,
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function isAdminAccount(user: {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}) {
  if (user.app_metadata?.role === 'admin') return true
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
    vercel_bandwidth_bytes:
      Number(obj.vercel_bandwidth_bytes) > 0
        ? Number(obj.vercel_bandwidth_bytes)
        : DEFAULT_QUOTAS.vercel_bandwidth_bytes,
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
  kind: 'supabase_db' | 'supabase_storage' | 'vercel_bandwidth',
  used: number,
  quota: number,
  seed: string,
) {
  const pct = usagePercent(used, quota)
  const usedLabel = formatBytes(used)
  const quotaLabel = formatBytes(quota)
  const labels = {
    supabase_db: 'Banco de dados (Supabase)',
    supabase_storage: 'Storage / buckets (Supabase)',
    vercel_bandwidth: 'Bandwidth (Vercel)',
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

export async function fetchVercelUsage() {
  const token = Deno.env.get('VERCEL_TOKEN')
  const projectId = Deno.env.get('VERCEL_PROJECT_ID')
  const teamId = Deno.env.get('VERCEL_TEAM_ID')

  if (!token) {
    return {
      configured: false as const,
      message: 'Configure o secret VERCEL_TOKEN para ver limites da Vercel.',
    }
  }

  const qs = new URLSearchParams()
  if (teamId) qs.set('teamId', teamId)

  try {
    const projectUrl = projectId
      ? `https://api.vercel.com/v9/projects/${projectId}?${qs}`
      : null

    const projectRes = projectUrl
      ? await fetch(projectUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })
      : null

    let project: Record<string, unknown> | null = null
    if (projectRes?.ok) {
      project = (await projectRes.json()) as Record<string, unknown>
    }

    // Usage endpoint (billing period) — best effort
    const now = Date.now()
    const from = now - 30 * 24 * 60 * 60 * 1000
    const usageQs = new URLSearchParams({
      from: String(from),
      to: String(now),
    })
    if (teamId) usageQs.set('teamId', teamId)

    const usageRes = await fetch(`https://api.vercel.com/v4/usage?${usageQs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    let usage: unknown = null
    let usageError: string | null = null
    if (usageRes.ok) {
      usage = await usageRes.json()
    } else {
      usageError = `HTTP ${usageRes.status}: ${(await usageRes.text()).slice(0, 200)}`
    }

    return {
      configured: true as const,
      project: project
        ? {
            id: project.id,
            name: project.name,
            framework: project.framework,
            updatedAt: project.updatedAt,
          }
        : null,
      usage,
      usage_error: usageError,
      message: usageError
        ? 'Token ok, mas a API de usage retornou erro (plano/permissão).'
        : 'Dados da Vercel carregados.',
    }
  } catch (error) {
    console.error('fetchVercelUsage', error)
    return {
      configured: true as const,
      project: null,
      usage: null,
      usage_error: String(error),
      message: 'Falha ao consultar a API da Vercel.',
    }
  }
}

export function extractVercelBandwidthBytes(usage: unknown): number | null {
  if (!usage || typeof usage !== 'object') return null
  const root = usage as Record<string, unknown>
  // Formatos variam; tenta campos comuns
  const candidates = [
    root.bandwidth,
    root.totalBandwidth,
    (root.summary as Record<string, unknown> | undefined)?.bandwidth,
    (root.metrics as Record<string, unknown> | undefined)?.bandwidth,
  ]
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c
    if (c && typeof c === 'object') {
      const obj = c as Record<string, unknown>
      if (typeof obj.value === 'number') return obj.value
      if (typeof obj.total === 'number') return obj.total
    }
  }
  return null
}
