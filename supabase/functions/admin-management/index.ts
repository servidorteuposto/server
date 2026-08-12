import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  ADMIN_CNPJ_DIGITS,
  ADMIN_EMAIL,
  collectAttentionReasons,
  daysUntilDate,
  fetchResendStats,
  formatBytes,
  isAdminAccount,
  isMetaWhatsAppConfigured,
  isNearLimit,
  isResendDailyNearLimit,
  normalizeQuotas,
  onlyDigits,
  processManagementAlerts,
  saoPauloTodayKey,
  usagePercent,
  type ManagementSettings,
} from '../_shared/admin-management.ts'
import {
  deleteR2Object,
  isR2Configured,
  listR2UsageByPrefix,
  objectKey,
  presignR2Url,
  putR2Object,
} from '../_shared/r2.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const POSTO_LIST_SELECT =
  'id, nome, cnpj, email, telefone, endereco, cep, logradouro, numero, complemento, bairro, cidade, uf, aviso_whatsapp_1, aviso_whatsapp_2, aviso_whatsapp_3, aviso_whatsapp_4, aviso_whatsapp_5, subscription_status, subscription_ends_at, created_at'

const SECURE_BUCKET = 'admin-secure-files'
const SECURE_MAX_BYTES = 10 * 1024 * 1024
const SECURE_ALLOWED_MIME = new Set(['application/pdf', 'text/plain'])
const UNLOCK_URL_SECONDS = 120
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$100000$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`
}

async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const salt = base64ToBytes(parts[2])
  const expected = parts[3]
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return bytesToBase64(new Uint8Array(bits)) === expected
}

function detectMime(filename: string, provided?: string) {
  const lower = filename.toLowerCase()
  if (provided && SECURE_ALLOWED_MIME.has(provided)) return provided
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.txt')) return 'text/plain'
  return null
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
  return processManagementAlerts(admin)
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

      const [
        { data: metrics, error: metricsError },
        { data: postos, error: postosError },
        resend,
      ] = await Promise.all([
        admin.rpc('admin_management_metrics'),
        admin
          .from('postos')
          .select(
            'id, nome, cnpj, email, telefone, subscription_status, subscription_ends_at, created_at',
          )
          .order('created_at', { ascending: false }),
        fetchResendStats(),
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
      let storageBytes = Number(metrics?.storage_bytes ?? 0)
      let storageBuckets = (metrics?.buckets ?? []) as Array<{
        bucket: string
        bytes: number
        objects: number
      }>
      if (isR2Configured()) {
        try {
          const r2Usage = await listR2UsageByPrefix()
          storageBytes = r2Usage.storage_bytes
          storageBuckets = r2Usage.buckets
        } catch (error) {
          console.error('r2 usage list failed', error)
        }
      }
      const dailyUsed = resend.daily_used ?? resend.emails_today
      const monthlyUsed = resend.monthly_used

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
          buckets: storageBuckets,
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
        whatsapp: {
          configured: isMetaWhatsAppConfigured(),
          provider: 'meta',
        },
        resend: {
          configured: resend.configured,
          message: resend.message,
          domains: resend.domains,
          recent: resend.recent,
          emails_today: resend.emails_today,
          daily: {
            used: dailyUsed,
            quota: quotas.resend_daily,
            percent: dailyUsed != null ? usagePercent(dailyUsed, quotas.resend_daily) : null,
            near_limit:
              dailyUsed != null ? isResendDailyNearLimit(dailyUsed, quotas.resend_daily) : false,
          },
          monthly: {
            used: monthlyUsed,
            quota: quotas.resend_monthly,
            percent:
              monthlyUsed != null ? usagePercent(monthlyUsed, quotas.resend_monthly) : null,
            near_limit:
              monthlyUsed != null ? isNearLimit(monthlyUsed, quotas.resend_monthly) : false,
          },
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
          row.aviso_whatsapp_5,
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

      // Aceita quotas em GB / e-mails se enviadas pela UI
      if (body?.quotas_gb && typeof body.quotas_gb === 'object') {
        const g = body.quotas_gb as Record<string, unknown>
        if (Number(g.db_gb) > 0) quotas.db_bytes = Math.round(Number(g.db_gb) * 1024 ** 3)
        if (Number(g.storage_gb) > 0) {
          quotas.storage_bytes = Math.round(Number(g.storage_gb) * 1024 ** 3)
        }
        if (Number(g.resend_daily) > 0) quotas.resend_daily = Math.round(Number(g.resend_daily))
        if (Number(g.resend_monthly) > 0) {
          quotas.resend_monthly = Math.round(Number(g.resend_monthly))
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

    if (action === 'get_attention') {
      const attention = await collectAttentionReasons(admin)
      return jsonResponse({
        ok: true,
        needs_attention: attention.needs_attention,
        reasons: attention.reasons,
        whatsapp: {
          configured: isMetaWhatsAppConfigured(),
          provider: 'meta',
        },
      })
    }

    if (action === 'run_alert_check') {
      const result = await runAlertCheck(admin)
      return jsonResponse({ ok: true, ...result })
    }

    if (action === 'list_secure_files') {
      const { data, error } = await admin
        .from('admin_secure_files')
        .select('id, title, original_filename, mime_type, size_bytes, created_at, locked_until')
        .order('created_at', { ascending: false })

      if (error) {
        return jsonResponse({ ok: false, message: error.message }, 500)
      }

      return jsonResponse({ ok: true, files: data ?? [] })
    }

    if (action === 'upload_secure_file') {
      const title = typeof body?.title === 'string' ? body.title.trim() : ''
      const password = typeof body?.password === 'string' ? body.password : ''
      const filename =
        typeof body?.filename === 'string' ? body.filename.trim() : 'arquivo'
      const contentBase64 =
        typeof body?.content_base64 === 'string' ? body.content_base64.replace(/^data:[^;]+;base64,/, '') : ''

      if (!title) {
        return jsonResponse({ ok: false, message: 'Informe um título.' }, 400)
      }
      if (password.length < 4) {
        return jsonResponse({ ok: false, message: 'A senha deve ter pelo menos 4 caracteres.' }, 400)
      }
      if (!contentBase64) {
        return jsonResponse({ ok: false, message: 'Arquivo inválido.' }, 400)
      }

      const mime = detectMime(filename, typeof body?.mime_type === 'string' ? body.mime_type : undefined)
      if (!mime) {
        return jsonResponse({ ok: false, message: 'Somente arquivos PDF ou TXT.' }, 400)
      }

      let bytes: Uint8Array
      try {
        bytes = base64ToBytes(contentBase64)
      } catch {
        return jsonResponse({ ok: false, message: 'Não foi possível ler o arquivo.' }, 400)
      }

      if (!bytes.length || bytes.length > SECURE_MAX_BYTES) {
        return jsonResponse({ ok: false, message: 'Arquivo deve ter até 10 MB.' }, 400)
      }

      const fileId = crypto.randomUUID()
      const ext = mime === 'application/pdf' ? 'pdf' : 'txt'
      const storagePath = `${user.id}/${fileId}.${ext}`
      const passwordHash = await hashPassword(password)

      try {
        await putR2Object(objectKey(SECURE_BUCKET, storagePath), bytes, mime)
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : 'Falha no upload R2.'
        return jsonResponse({ ok: false, message }, 500)
      }

      const { data: row, error: insertError } = await admin
        .from('admin_secure_files')
        .insert({
          id: fileId,
          title,
          original_filename: filename.slice(0, 240),
          mime_type: mime,
          size_bytes: bytes.length,
          storage_path: storagePath,
          password_hash: passwordHash,
          created_by: user.id,
        })
        .select('id, title, original_filename, mime_type, size_bytes, created_at, locked_until')
        .single()

      if (insertError) {
        await deleteR2Object(objectKey(SECURE_BUCKET, storagePath))
        return jsonResponse({ ok: false, message: insertError.message }, 500)
      }

      return jsonResponse({ ok: true, file: row })
    }

    if (action === 'unlock_secure_file') {
      const fileId = typeof body?.file_id === 'string' ? body.file_id : ''
      const password = typeof body?.password === 'string' ? body.password : ''
      const mode = body?.mode === 'download' ? 'download' : 'view'

      if (!fileId || !password) {
        return jsonResponse({ ok: false, message: 'Informe o arquivo e a senha.' }, 400)
      }

      const { data: file, error: fileError } = await admin
        .from('admin_secure_files')
        .select('*')
        .eq('id', fileId)
        .maybeSingle()

      if (fileError || !file) {
        return jsonResponse({ ok: false, message: 'Arquivo não encontrado.' }, 404)
      }

      if (file.locked_until && new Date(file.locked_until).getTime() > Date.now()) {
        return jsonResponse(
          {
            ok: false,
            message: 'Arquivo temporariamente bloqueado por tentativas inválidas. Tente mais tarde.',
          },
          423,
        )
      }

      const valid = await verifyPassword(password, file.password_hash)
      if (!valid) {
        const attempts = Number(file.failed_attempts ?? 0) + 1
        const patch: Record<string, unknown> = { failed_attempts: attempts }
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
          patch.failed_attempts = 0
        }
        await admin.from('admin_secure_files').update(patch).eq('id', fileId)
        return jsonResponse({ ok: false, message: 'Senha incorreta.' }, 401)
      }

      await admin
        .from('admin_secure_files')
        .update({ failed_attempts: 0, locked_until: null })
        .eq('id', fileId)

      let signedUrl: string
      try {
        signedUrl = await presignR2Url(
          'GET',
          objectKey(SECURE_BUCKET, file.storage_path),
          UNLOCK_URL_SECONDS,
        )
      } catch (signedError) {
        const message =
          signedError instanceof Error
            ? signedError.message
            : 'Não foi possível liberar o arquivo.'
        return jsonResponse({ ok: false, message }, 500)
      }

      return jsonResponse({
        ok: true,
        url: signedUrl,
        mode,
        mime_type: file.mime_type,
        filename: file.original_filename,
        title: file.title,
        expires_in: UNLOCK_URL_SECONDS,
      })
    }

    if (action === 'delete_secure_file') {
      const fileId = typeof body?.file_id === 'string' ? body.file_id : ''
      const password = typeof body?.password === 'string' ? body.password : ''
      if (!fileId) {
        return jsonResponse({ ok: false, message: 'Informe o arquivo.' }, 400)
      }
      if (!password) {
        return jsonResponse({ ok: false, message: 'Informe a senha para excluir.' }, 400)
      }

      const { data: file, error: fileError } = await admin
        .from('admin_secure_files')
        .select('*')
        .eq('id', fileId)
        .maybeSingle()

      if (fileError || !file) {
        return jsonResponse({ ok: false, message: 'Arquivo não encontrado.' }, 404)
      }

      if (file.locked_until && new Date(file.locked_until).getTime() > Date.now()) {
        return jsonResponse(
          {
            ok: false,
            message: 'Arquivo temporariamente bloqueado por tentativas inválidas. Tente mais tarde.',
          },
          423,
        )
      }

      const valid = await verifyPassword(password, file.password_hash)
      if (!valid) {
        const attempts = Number(file.failed_attempts ?? 0) + 1
        const patch: Record<string, unknown> = { failed_attempts: attempts }
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
          patch.failed_attempts = 0
        }
        await admin.from('admin_secure_files').update(patch).eq('id', fileId)
        return jsonResponse({ ok: false, message: 'Senha incorreta.' }, 401)
      }

      await deleteR2Object(objectKey(SECURE_BUCKET, file.storage_path))
      const { error: deleteError } = await admin.from('admin_secure_files').delete().eq('id', fileId)
      if (deleteError) {
        return jsonResponse({ ok: false, message: deleteError.message }, 500)
      }

      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('admin-management error', error)
    return jsonResponse({ ok: false, message: 'Erro interno do Gerenciamento.' }, 500)
  }
})
