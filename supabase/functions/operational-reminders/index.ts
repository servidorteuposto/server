import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  isMetaWhatsAppConfigured,
  normalizeWaPhone,
  sendWhatsAppTemplate,
} from '../_shared/meta-whatsapp.ts'
import {
  assinaturaTemplate,
  docTemplate,
  drenagemTemplate,
  metrologiaTemplate,
  raqTemplate,
  type TemplatePayload,
} from '../_shared/whatsapp-templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-operational-cron-secret, x-drainage-cron-secret',
}

const TIME_ZONE = 'America/Sao_Paulo'
const DOC_MILESTONES = [30, 15, 7, 1, 0] as const
const SUBSCRIPTION_MILESTONES = [7, 2] as const
const METROLOGY_INTERVAL_DAYS = 15
const DRAINAGE_INTERVAL_DAYS = 7
const RAQ_INTERVAL_DAYS = 2
/** ~6 msgs/min */
const SEND_DELAY_MS = 10_000
const MAX_SENDS_PER_RUN = Number(Deno.env.get('OPERATIONAL_MAX_SENDS') ?? '40')

type PostoRow = {
  id: string
  nome: string
  cnpj: string | null
  endereco: string | null
  telefone: string | null
  aviso_whatsapp_1: string | null
  aviso_whatsapp_2: string | null
  aviso_whatsapp_3: string | null
  aviso_whatsapp_4: string | null
  aviso_whatsapp_5: string | null
  subscription_status: string | null
  subscription_ends_at: string | null
  billing_mode: string | null
}

type ReminderJob = {
  posto_id: string
  category: string
  reference_id: string
  milestone: string
  phones: string[]
  message: string
  template_name: string
  template_params: string[]
  due_on: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function collectAvisoPhones(posto: PostoRow) {
  const avisos = [
    posto.aviso_whatsapp_1,
    posto.aviso_whatsapp_2,
    posto.aviso_whatsapp_3,
    posto.aviso_whatsapp_4,
    posto.aviso_whatsapp_5,
  ]
  const candidates = avisos.some(Boolean) ? avisos : [posto.telefone]
  const unique = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = normalizeWaPhone(candidate)
    if (normalized.length >= 12 && normalized.length <= 15) unique.add(normalized)
  }
  return [...unique]
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toSaoPauloDateKey(value: string | Date = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`
}

function daysBetweenKeys(fromKey: string, toKey: string) {
  const [y1, m1, d1] = fromKey.split('-').map(Number)
  const [y2, m2, d2] = toKey.split('-').map(Number)
  const a = Date.UTC(y1, m1 - 1, d1)
  const b = Date.UTC(y2, m2 - 1, d2)
  return Math.round((b - a) / 86_400_000)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jobFromTemplate(
  base: Omit<ReminderJob, 'message' | 'template_name' | 'template_params'>,
  tpl: TemplatePayload,
): ReminderJob {
  return {
    ...base,
    message: tpl.summary,
    template_name: tpl.name,
    template_params: tpl.bodyParams,
  }
}

async function alreadySent(
  admin: ReturnType<typeof createClient>,
  postoId: string,
  category: string,
  referenceId: string,
  milestone: string,
) {
  const { data } = await admin
    .from('whatsapp_reminder_sends')
    .select('id')
    .eq('posto_id', postoId)
    .eq('category', category)
    .eq('reference_id', referenceId)
    .eq('milestone', milestone)
    .maybeSingle()
  return Boolean(data?.id)
}

async function markSent(
  admin: ReturnType<typeof createClient>,
  postoId: string,
  category: string,
  referenceId: string,
  milestone: string,
  sentOn: string,
) {
  const { error } = await admin.from('whatsapp_reminder_sends').insert({
    posto_id: postoId,
    category,
    reference_id: referenceId,
    milestone,
    sent_on: sentOn,
  })
  if (error && !String(error.message ?? '').includes('duplicate')) {
    console.error('markSent failed', error)
    return false
  }
  return true
}

async function enqueueReminder(
  admin: ReturnType<typeof createClient>,
  job: ReminderJob,
) {
  if (
    await alreadySent(admin, job.posto_id, job.category, job.reference_id, job.milestone)
  ) {
    return false
  }

  const now = new Date().toISOString()
  const { error } = await admin.from('whatsapp_reminder_queue').upsert(
    {
      posto_id: job.posto_id,
      category: job.category,
      reference_id: job.reference_id,
      milestone: job.milestone,
      message: job.message,
      template_name: job.template_name,
      template_params: job.template_params,
      phones: job.phones,
      due_on: job.due_on,
      updated_at: now,
    },
    { onConflict: 'posto_id,category,reference_id,milestone' },
  )

  if (error) {
    console.error('enqueueReminder failed', error)
    return false
  }
  return true
}

async function hasPendingRaq(
  admin: ReturnType<typeof createClient>,
  postoId: string,
) {
  const { data } = await admin
    .from('whatsapp_reminder_queue')
    .select('id')
    .eq('posto_id', postoId)
    .eq('category', 'raq')
    .limit(1)
    .maybeSingle()
  return Boolean(data?.id)
}

/** Envia pendências da fila via Meta templates; só marca enviado após sucesso. */
async function flushReminderQueue(admin: ReturnType<typeof createClient>, todayKey: string) {
  const details: Array<Record<string, unknown>> = []
  let apiCalls = 0
  let jobsSent = 0
  let deferred = 0
  const metaConfigured = isMetaWhatsAppConfigured()

  if (!metaConfigured) {
    const { count } = await admin
      .from('whatsapp_reminder_queue')
      .select('id', { count: 'exact', head: true })

    return {
      details: [
        {
          skipped: 'meta_not_configured',
          pending: count ?? 0,
        },
      ],
      apiCalls: 0,
      jobsSent: 0,
      deferred: count ?? 0,
      meta_configured: false,
      pending_left: count ?? 0,
    }
  }

  const { data: pending, error: pendingError } = await admin
    .from('whatsapp_reminder_queue')
    .select(
      'id, posto_id, category, reference_id, milestone, message, template_name, template_params, phones, due_on, attempts',
    )
    .order('due_on', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(Math.max(MAX_SENDS_PER_RUN * 2, 40))

  if (pendingError) throw pendingError

  const rows = pending ?? []

  for (const row of rows) {
    if (apiCalls >= MAX_SENDS_PER_RUN) {
      deferred += 1
      details.push({
        id: row.id,
        category: row.category,
        milestone: row.milestone,
        skipped: 'rate_limit_batch',
        deferred: true,
      })
      continue
    }

    if (
      await alreadySent(
        admin,
        row.posto_id,
        row.category,
        row.reference_id,
        row.milestone,
      )
    ) {
      await admin.from('whatsapp_reminder_queue').delete().eq('id', row.id)
      details.push({ id: row.id, category: row.category, skipped: 'already_sent' })
      continue
    }

    const templateName =
      typeof row.template_name === 'string' ? row.template_name.trim() : ''
    if (!templateName) {
      await admin
        .from('whatsapp_reminder_queue')
        .update({
          attempts: Number(row.attempts ?? 0) + 1,
          last_error: 'missing_template_name',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      details.push({
        id: row.id,
        category: row.category,
        sent: false,
        error: 'missing_template_name',
      })
      continue
    }

    const phones = Array.isArray(row.phones) ? row.phones.filter(Boolean) : []
    if (!phones.length) {
      await admin
        .from('whatsapp_reminder_queue')
        .update({
          attempts: Number(row.attempts ?? 0) + 1,
          last_error: 'no_phones',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      details.push({ id: row.id, category: row.category, sent: false, error: 'no_phones' })
      continue
    }

    const bodyParams = Array.isArray(row.template_params)
      ? row.template_params.map((value: unknown) => String(value ?? ''))
      : []

    let ok = false
    let lastError: string | null = null
    for (const phone of phones) {
      if (apiCalls >= MAX_SENDS_PER_RUN) break
      if (apiCalls > 0) await sleep(SEND_DELAY_MS)
      const delivered = await sendWhatsAppTemplate({
        to: String(phone),
        name: templateName,
        bodyParams,
      })
      apiCalls += 1
      if (delivered) ok = true
      else lastError = 'whatsapp_send_failed'
    }

    if (ok) {
      await markSent(
        admin,
        row.posto_id,
        row.category,
        row.reference_id,
        row.milestone,
        todayKey,
      )
      await admin.from('whatsapp_reminder_queue').delete().eq('id', row.id)
      jobsSent += 1
      details.push({
        id: row.id,
        category: row.category,
        reference_id: row.reference_id,
        milestone: row.milestone,
        template_name: templateName,
        due_on: row.due_on,
        sent: true,
        catch_up: row.due_on !== todayKey,
      })
    } else {
      await admin
        .from('whatsapp_reminder_queue')
        .update({
          attempts: Number(row.attempts ?? 0) + 1,
          last_error: lastError ?? 'send_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      deferred += 1
      details.push({
        id: row.id,
        category: row.category,
        sent: false,
        deferred: true,
        error: lastError,
      })
    }
  }

  const { count: pendingLeft } = await admin
    .from('whatsapp_reminder_queue')
    .select('id', { count: 'exact', head: true })

  return {
    details,
    apiCalls,
    jobsSent,
    deferred,
    meta_configured: true,
    pending_left: pendingLeft ?? 0,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret =
      Deno.env.get('OPERATIONAL_CRON_SECRET') ?? Deno.env.get('DRAINAGE_CRON_SECRET')
    const provided =
      req.headers.get('x-operational-cron-secret') ??
      req.headers.get('x-drainage-cron-secret')
    if (!cronSecret || provided !== cronSecret) {
      return jsonResponse({ ok: false, message: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: 'Missing Supabase credentials' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const todayKey = toSaoPauloDateKey(new Date())
    if (!todayKey) {
      return jsonResponse({ ok: false, message: 'Invalid today date' }, 500)
    }

    const { data: postos, error: postosError } = await admin
      .from('postos')
      .select(
        'id, nome, cnpj, endereco, telefone, aviso_whatsapp_1, aviso_whatsapp_2, aviso_whatsapp_3, aviso_whatsapp_4, aviso_whatsapp_5, subscription_status, subscription_ends_at, billing_mode',
      )
      .eq('subscription_status', 'active')

    if (postosError) throw postosError

    const activePostos = (postos ?? []).filter((p) => collectAvisoPhones(p as PostoRow).length > 0)
    const postoIds = activePostos.map((p) => p.id)
    let enqueued = 0

    if (!postoIds.length) {
      const flushEmpty = await flushReminderQueue(admin, todayKey)
      return jsonResponse({
        ok: true,
        today: todayKey,
        sent: flushEmpty.jobsSent,
        checked_postos: 0,
        enqueued: 0,
        deferred: flushEmpty.deferred,
        pending_left: flushEmpty.pending_left,
        meta_configured: flushEmpty.meta_configured,
        details: flushEmpty.details,
      })
    }

    const postoById = new Map(activePostos.map((p) => [p.id, p as PostoRow]))

    // --- Renovação de plano (7 e 2 dias antes) ---
    for (const raw of activePostos) {
      const posto = raw as PostoRow
      if (!posto.subscription_ends_at) continue
      const endsKey = toSaoPauloDateKey(posto.subscription_ends_at)
      if (!endsKey) continue

      const daysLeft = daysBetweenKeys(todayKey, endsKey)
      if (!(SUBSCRIPTION_MILESTONES as readonly number[]).includes(daysLeft)) continue

      const milestone = `d${daysLeft}`
      const phones = collectAvisoPhones(posto)
      const tpl = assinaturaTemplate({
        nome: posto.nome,
        cnpj: posto.cnpj,
        daysLeft,
        endsKey,
      })
      const ok = await enqueueReminder(
        admin,
        jobFromTemplate(
          {
            posto_id: posto.id,
            category: 'subscription',
            reference_id: endsKey,
            milestone,
            phones,
            due_on: todayKey,
          },
          tpl,
        ),
      )
      if (ok) enqueued += 1
    }

    // --- Documentos regulatórios + laudos ---
    const [{ data: regulatory }, { data: workSafety }] = await Promise.all([
      admin
        .from('regulatory_documents')
        .select('id, posto_id, title, expires_at')
        .in('posto_id', postoIds)
        .not('expires_at', 'is', null),
      admin
        .from('work_safety_documents')
        .select('id, posto_id, title, expires_at')
        .in('posto_id', postoIds)
        .not('expires_at', 'is', null),
    ])

    const docJobs = [
      ...(regulatory ?? []).map((d) => ({
        category: 'regulatory_doc' as const,
        id: d.id,
        posto_id: d.posto_id,
        title: d.title,
        expires_at: String(d.expires_at).slice(0, 10),
      })),
      ...(workSafety ?? []).map((d) => ({
        category: 'work_safety_doc' as const,
        id: d.id,
        posto_id: d.posto_id,
        title: d.title,
        expires_at: String(d.expires_at).slice(0, 10),
      })),
    ]

    for (const doc of docJobs) {
      const daysLeft = daysBetweenKeys(todayKey, doc.expires_at)
      if (!(DOC_MILESTONES as readonly number[]).includes(daysLeft)) continue

      const milestone = `d${daysLeft}`
      const posto = postoById.get(doc.posto_id)
      if (!posto) continue
      const phones = collectAvisoPhones(posto)
      const tpl = docTemplate({
        nome: posto.nome,
        docTitle: doc.title,
        daysLeft,
        expiresKey: doc.expires_at,
      })
      const ok = await enqueueReminder(
        admin,
        jobFromTemplate(
          {
            posto_id: doc.posto_id,
            category: doc.category,
            reference_id: doc.id,
            milestone,
            phones,
            due_on: todayKey,
          },
          tpl,
        ),
      )
      if (ok) enqueued += 1
    }

    // --- Metrologia ---
    const { data: metroRows } = await admin
      .from('nozzle_metrology_verifications')
      .select('posto_id, verified_at')
      .in('posto_id', postoIds)
      .order('verified_at', { ascending: false })

    const lastMetro = new Map<string, string>()
    for (const row of metroRows ?? []) {
      if (!lastMetro.has(row.posto_id)) lastMetro.set(row.posto_id, row.verified_at)
    }

    for (const posto of activePostos) {
      const lastAt = lastMetro.get(posto.id)
      if (!lastAt) continue
      const lastKey = toSaoPauloDateKey(lastAt)
      if (!lastKey) continue
      const dueKey = addDaysToDateKey(lastKey, METROLOGY_INTERVAL_DAYS)
      if (dueKey > todayKey) continue

      const milestone = `due:${dueKey}`
      const phones = collectAvisoPhones(posto as PostoRow)
      const tpl = metrologiaTemplate({ nome: (posto as PostoRow).nome, dueKey })
      const ok = await enqueueReminder(
        admin,
        jobFromTemplate(
          {
            posto_id: posto.id,
            category: 'metrology',
            reference_id: 'posto',
            milestone,
            phones,
            due_on: dueKey,
          },
          tpl,
        ),
      )
      if (ok) enqueued += 1
    }

    // --- Drenagem ---
    const { data: tanks } = await admin
      .from('diesel_tanks')
      .select('id, name, posto_id, is_active')
      .eq('is_active', true)
      .in('posto_id', postoIds)

    const tankRows = tanks ?? []
    if (tankRows.length) {
      const tankIds = tankRows.map((t) => t.id)
      const { data: drainReports } = await admin
        .from('diesel_drainage_reports')
        .select('tank_id, drained_at')
        .in('tank_id', tankIds)
        .order('drained_at', { ascending: false })

      const lastDrain = new Map<string, string>()
      for (const report of drainReports ?? []) {
        if (!lastDrain.has(report.tank_id)) lastDrain.set(report.tank_id, report.drained_at)
      }

      for (const tank of tankRows) {
        const lastAt = lastDrain.get(tank.id)
        if (!lastAt) continue
        const lastKey = toSaoPauloDateKey(lastAt)
        if (!lastKey) continue
        const dueKey = addDaysToDateKey(lastKey, DRAINAGE_INTERVAL_DAYS)
        if (dueKey > todayKey) continue

        const milestone = `due:${dueKey}`
        const posto = postoById.get(tank.posto_id)
        if (!posto) continue
        const phones = collectAvisoPhones(posto)
        const tpl = drenagemTemplate({
          nome: posto.nome,
          tankName: tank.name,
          dueKey,
        })
        const ok = await enqueueReminder(
          admin,
          jobFromTemplate(
            {
              posto_id: tank.posto_id,
              category: 'drainage',
              reference_id: tank.id,
              milestone,
              phones,
              due_on: dueKey,
            },
            tpl,
          ),
        )
        if (ok) enqueued += 1
      }
    }

    // --- RAQ ---
    for (const posto of activePostos) {
      if (await hasPendingRaq(admin, posto.id)) continue

      const { data: lastRaq } = await admin
        .from('whatsapp_reminder_sends')
        .select('sent_on')
        .eq('posto_id', posto.id)
        .eq('category', 'raq')
        .order('sent_on', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastRaq?.sent_on) {
        const lastKey = String(lastRaq.sent_on).slice(0, 10)
        if (daysBetweenKeys(lastKey, todayKey) < RAQ_INTERVAL_DAYS) continue
      }

      const milestone = `day:${todayKey}`
      const row = posto as PostoRow
      const phones = collectAvisoPhones(row)
      const tpl = raqTemplate({
        nome: row.nome,
        cnpj: row.cnpj,
        endereco: row.endereco,
      })
      const ok = await enqueueReminder(
        admin,
        jobFromTemplate(
          {
            posto_id: posto.id,
            category: 'raq',
            reference_id: 'periodic',
            milestone,
            phones,
            due_on: todayKey,
          },
          tpl,
        ),
      )
      if (ok) enqueued += 1
    }

    const flush = await flushReminderQueue(admin, todayKey)

    return jsonResponse({
      ok: true,
      today: todayKey,
      checked_postos: activePostos.length,
      enqueued,
      queued: enqueued,
      sent: flush.jobsSent,
      api_calls: flush.apiCalls,
      deferred: flush.deferred,
      pending_left: flush.pending_left,
      meta_configured: flush.meta_configured,
      send_delay_ms: SEND_DELAY_MS,
      max_sends_per_run: MAX_SENDS_PER_RUN,
      details: flush.details,
    })
  } catch (error) {
    console.error('operational-reminders error', error)
    return jsonResponse({ ok: false, message: 'Erro ao processar lembretes operacionais.' }, 500)
  }
})
