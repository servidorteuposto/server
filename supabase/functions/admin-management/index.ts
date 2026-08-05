import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  ADMIN_CNPJ_DIGITS,
  ADMIN_EMAIL,
  alertAlreadySentToday,
  collectAdminAlertPhones,
  daysUntilDate,
  domainAlertMessage,
  extractVercelBandwidthBytes,
  fetchVercelUsage,
  formatBytes,
  isAdminAccount,
  isNearLimit,
  normalizeQuotas,
  onlyDigits,
  resourceAlertMessage,
  saoPauloTodayKey,
  sendWhatsApp,
  usagePercent,
  type ManagementSettings,
} from '../_shared/admin-management.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const POSTO_LIST_SELECT =
  'id, nome, cnpj, email, telefone, endereco, cep, logradouro, numero, complemento, bairro, cidade, uf, aviso_whatsapp_1, aviso_whatsapp_2, aviso_whatsapp_3, aviso_whatsapp_4, subscription_status, subscription_ends_at, created_at'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isAdminPosto(row: { cnpj?: string | null; email?: string | null }) {
  return (
    onlyDigits(row.cnpj ?? '') === ADMIN_CNPJ_DIGITS ||
    String(row.email ?? '').trim().toLowerCase() === ADMIN_EMAIL
  )
}

function formatPostoAddress(row: Record<string, unknown>) {
  const parts = [
    row.logradouro,
    row.numero,
    row.complemento,
    row.bairro,
    row.cidade,
    row.uf,
    row.cep,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)

  if (parts.length) return parts.join(', ')
  if (typeof row.endereco === 'string' && row.endereco.trim()) return row.endereco.trim()
  return '—'
}

async function loadSettings(admin: ReturnType<typeof createClient>): Promise<ManagementSettings> {
  const { data, error } = await admin.from('admin_management_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw error
  const row = data ?? {
    id: 1,
    alert_whatsapp_1: null,
    alert_whatsapp_2: null,
    domain_expires_on: null,
    quotas: {},
    last_alerts: {},
    updated_at: null,
    updated_by: null,
  }
  return {
    ...row,
    quotas: normalizeQuotas(row.quotas),
    last_alerts:
      row.last_alerts && typeof row.last_alerts === 'object'
        ? (row.last_alerts as Record<string, string>)
        : {},
  } as ManagementSettings
}

async function runAlertCheck(admin: ReturnType<typeof createClient>) {
  const settings = await loadSettings(admin)
  const phones = collectAdminAlertPhones(settings)
  const sent: string[] = []
  const skipped: string[] = []

  const { data: metrics, error: metricsError } = await admin.rpc('admin_management_metrics')
  if (metricsError) throw metricsError

  const dbBytes = Number(metrics?.db_bytes ?? 0)
  const storageBytes = Number(metrics?.storage_bytes ?? 0)
  const quotas = settings.quotas
  const lastAlerts = { ...settings.last_alerts }
  const today = saoPauloTodayKey()

  async function maybeSend(
    key: string,
    shouldSend: boolean,
    message: string,
  ) {
    if (!shouldSend) {
      skipped.push(`${key}:ok`)
      return
    }
    if (alertAlreadySentToday(lastAlerts, key)) {
      skipped.push(`${key}:already_sent`)
      return
    }
    if (!phones.length) {
      skipped.push(`${key}:no_phones`)
      return
    }
    const results = await Promise.all(phones.map((p) => sendWhatsApp(p, message)))
    if (results.some(Boolean)) {
      lastAlerts[key] = today
      sent.push(key)
    } else {
      skipped.push(`${key}:send_failed`)
    }
  }

  await maybeSend(
    'supabase_db',
    isNearLimit(dbBytes, quotas.db_bytes),
    resourceAlertMessage('supabase_db', dbBytes, quotas.db_bytes, `${today}:db:${dbBytes}`),
  )
  await maybeSend(
    'supabase_storage',
    isNearLimit(storageBytes, quotas.storage_bytes),
    resourceAlertMessage(
      'supabase_storage',
      storageBytes,
      quotas.storage_bytes,
      `${today}:storage:${storageBytes}`,
    ),
  )

  const vercel = await fetchVercelUsage()
  const bandwidth = extractVercelBandwidthBytes(vercel.configured ? vercel.usage : null)
  if (bandwidth != null) {
    await maybeSend(
      'vercel_bandwidth',
      isNearLimit(bandwidth, quotas.vercel_bandwidth_bytes),
      resourceAlertMessage(
        'vercel_bandwidth',
        bandwidth,
        quotas.vercel_bandwidth_bytes,
        `${today}:vercel:${bandwidth}`,
      ),
    )
  } else {
    skipped.push('vercel_bandwidth:no_data')
  }

  const daysLeft = daysUntilDate(settings.domain_expires_on)
  if (daysLeft != null && settings.domain_expires_on) {
    if (daysLeft === 7) {
      await maybeSend(
        'domain_7d',
        true,
        domainAlertMessage(daysLeft, settings.domain_expires_on, `${today}:domain7`),
      )
    } else if (daysLeft <= 2 && daysLeft >= 0) {
      await maybeSend(
        'domain_2d',
        true,
        domainAlertMessage(daysLeft, settings.domain_expires_on, `${today}:domain2:${daysLeft}`),
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

  return { sent, skipped, phones: phones.length, last_alerts: lastAlerts }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Método não permitido.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ ok: false, message: 'Configuração do servidor incompleta.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const accessToken = authHeader.slice('Bearer '.length).trim()
    if (!accessToken || accessToken === anonKey) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(accessToken)

    if (userError || !user || !isAdminAccount(user)) {
      return jsonResponse({ ok: false, message: 'Acesso restrito ao administrador.' }, 403)
    }

    const body = await req.json()
    const action = body?.action

    if (action === 'get_dashboard') {
      const settings = await loadSettings(admin)

      const [{ data: metrics, error: metricsError }, { data: postos, error: postosError }, vercel] =
        await Promise.all([
          admin.rpc('admin_management_metrics'),
          admin
            .from('postos')
            .select(
              'id, nome, cnpj, email, telefone, subscription_status, subscription_ends_at, created_at',
            )
            .order('created_at', { ascending: false }),
          fetchVercelUsage(),
        ])

      if (metricsError) {
        return jsonResponse({ ok: false, message: metricsError.message }, 500)
      }
      if (postosError) {
        return jsonResponse({ ok: false, message: postosError.message }, 500)
      }

      const accounts = (postos ?? []).filter((row) => !isAdminPosto(row))
      const active = accounts.filter((p) => p.subscription_status === 'active')
      const inactive = accounts.filter((p) => p.subscription_status !== 'active')

      const quotas = settings.quotas
      const dbBytes = Number(metrics?.db_bytes ?? 0)
      const storageBytes = Number(metrics?.storage_bytes ?? 0)
      const bandwidth = extractVercelBandwidthBytes(vercel.configured ? vercel.usage : null)

      const supabasePanel = {
        today: metrics?.today ?? saoPauloTodayKey(),
        db: {
          used_bytes: dbBytes,
          quota_bytes: quotas.db_bytes,
          percent: usagePercent(dbBytes, quotas.db_bytes),
          near_limit: isNearLimit(dbBytes, quotas.db_bytes),
          used_label: formatBytes(dbBytes),
          quota_label: formatBytes(quotas.db_bytes),
        },
        storage: {
          used_bytes: storageBytes,
          quota_bytes: quotas.storage_bytes,
          percent: usagePercent(storageBytes, quotas.storage_bytes),
          near_limit: isNearLimit(storageBytes, quotas.storage_bytes),
          used_label: formatBytes(storageBytes),
          quota_label: formatBytes(quotas.storage_bytes),
          buckets: metrics?.buckets ?? [],
        },
        tables: metrics?.tables ?? [],
        flow_today: metrics?.flow_today ?? {},
      }

      const daysLeft = daysUntilDate(settings.domain_expires_on)

      return jsonResponse({
        ok: true,
        generated_at: new Date().toISOString(),
        settings: {
          alert_whatsapp_1: settings.alert_whatsapp_1,
          alert_whatsapp_2: settings.alert_whatsapp_2,
          domain_expires_on: settings.domain_expires_on,
          quotas: settings.quotas,
          last_alerts: settings.last_alerts,
          updated_at: settings.updated_at,
        },
        postos: {
          total: accounts.length,
          active: active.length,
          inactive: inactive.length,
        },
        supabase: supabasePanel,
        vercel: {
          ...vercel,
          bandwidth_bytes: bandwidth,
          bandwidth_percent:
            bandwidth != null ? usagePercent(bandwidth, quotas.vercel_bandwidth_bytes) : null,
          bandwidth_near_limit:
            bandwidth != null ? isNearLimit(bandwidth, quotas.vercel_bandwidth_bytes) : false,
          bandwidth_quota_bytes: quotas.vercel_bandwidth_bytes,
          bandwidth_used_label: bandwidth != null ? formatBytes(bandwidth) : null,
          bandwidth_quota_label: formatBytes(quotas.vercel_bandwidth_bytes),
        },
        access: {
          security_alerts_today: Number(metrics?.flow_today?.security_alerts ?? 0),
          registration_attempts_today: Number(metrics?.flow_today?.registration_attempts ?? 0),
          support_tickets_today: Number(metrics?.flow_today?.support_tickets ?? 0),
          mp_payments_today: Number(metrics?.flow_today?.mp_payments ?? 0),
          whatsapp_reminders_today: Number(metrics?.flow_today?.whatsapp_reminder_sends ?? 0),
          whatsapp_account_locked_today: Number(
            metrics?.flow_today?.whatsapp_account_locked ??
              metrics?.flow_today?.security_alerts ??
              0,
          ),
          whatsapp_sends_today: Number(
            metrics?.flow_today?.whatsapp_sends_total ??
              Number(metrics?.flow_today?.whatsapp_reminder_sends ?? 0) +
                Number(metrics?.flow_today?.security_alerts ?? 0),
          ),
          active_postos: active.length,
        },
        domain: {
          expires_on: settings.domain_expires_on,
          days_left: daysLeft,
          warn_7d: daysLeft === 7,
          warn_2d: daysLeft != null && daysLeft <= 2 && daysLeft >= 0,
          expired: daysLeft != null && daysLeft < 0,
        },
      })
    }

    if (action === 'list_postos') {
      const filter = body?.filter === 'active' || body?.filter === 'inactive' ? body.filter : 'all'

      const { data, error } = await admin
        .from('postos')
        .select(POSTO_LIST_SELECT)
        .order('nome', { ascending: true })

      if (error) {
        return jsonResponse({ ok: false, message: error.message }, 500)
      }

      let rows = (data ?? []).filter((row) => !isAdminPosto(row))
      if (filter === 'active') {
        rows = rows.filter((r) => r.subscription_status === 'active')
      } else if (filter === 'inactive') {
        rows = rows.filter((r) => r.subscription_status !== 'active')
      }

      const postos = rows.map((row) => ({
        id: row.id,
        nome: row.nome,
        cnpj: row.cnpj,
        email: row.email,
        telefone: row.telefone,
        endereco: formatPostoAddress(row as Record<string, unknown>),
        avisos: [
          row.aviso_whatsapp_1,
          row.aviso_whatsapp_2,
          row.aviso_whatsapp_3,
          row.aviso_whatsapp_4,
        ].filter(Boolean),
        subscription_status: row.subscription_status,
        subscription_ends_at: row.subscription_ends_at,
        created_at: row.created_at,
      }))

      return jsonResponse({ ok: true, filter, postos })
    }

    if (action === 'save_settings') {
      const alert1 =
        typeof body?.alert_whatsapp_1 === 'string' ? onlyDigits(body.alert_whatsapp_1) : ''
      const alert2 =
        typeof body?.alert_whatsapp_2 === 'string' ? onlyDigits(body.alert_whatsapp_2) : ''
      const domain =
        typeof body?.domain_expires_on === 'string' && body.domain_expires_on.trim()
          ? body.domain_expires_on.trim().slice(0, 10)
          : null

      const quotas = normalizeQuotas({
        ...(body?.quotas && typeof body.quotas === 'object' ? body.quotas : {}),
      })

      // Aceita quotas em GB se enviadas pela UI
      if (body?.quotas_gb && typeof body.quotas_gb === 'object') {
        const g = body.quotas_gb as Record<string, unknown>
        if (Number(g.db_gb) > 0) quotas.db_bytes = Math.round(Number(g.db_gb) * 1024 ** 3)
        if (Number(g.storage_gb) > 0) {
          quotas.storage_bytes = Math.round(Number(g.storage_gb) * 1024 ** 3)
        }
        if (Number(g.vercel_bandwidth_gb) > 0) {
          quotas.vercel_bandwidth_bytes = Math.round(Number(g.vercel_bandwidth_gb) * 1024 ** 3)
        }
      }

      const { data, error } = await admin
        .from('admin_management_settings')
        .upsert({
          id: 1,
          alert_whatsapp_1: alert1 || null,
          alert_whatsapp_2: alert2 || null,
          domain_expires_on: domain,
          quotas,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .select('*')
        .single()

      if (error) {
        return jsonResponse({ ok: false, message: error.message }, 500)
      }

      return jsonResponse({
        ok: true,
        settings: {
          ...data,
          quotas: normalizeQuotas(data.quotas),
        },
      })
    }

    if (action === 'run_alert_check') {
      const result = await runAlertCheck(admin)
      return jsonResponse({ ok: true, ...result })
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('admin-management error', error)
    return jsonResponse({ ok: false, message: 'Erro interno do Gerenciamento.' }, 500)
  }
})
