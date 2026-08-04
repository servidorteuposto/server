import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-operational-cron-secret, x-drainage-cron-secret',
}

const TIME_ZONE = 'America/Sao_Paulo'
const DOC_MILESTONES = [30, 15, 7, 1, 0] as const
const METROLOGY_INTERVAL_DAYS = 15
const DRAINAGE_INTERVAL_DAYS = 7
const RAQ_INTERVAL_DAYS = 2

type PostoRow = {
  id: string
  nome: string
  telefone: string | null
  aviso_whatsapp_1: string | null
  aviso_whatsapp_2: string | null
  aviso_whatsapp_3: string | null
  aviso_whatsapp_4: string | null
  subscription_status: string | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function toZApiPhone(phone: string) {
  let digits = onlyDigits(phone)
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function collectAvisoPhones(posto: PostoRow) {
  const avisos = [
    posto.aviso_whatsapp_1,
    posto.aviso_whatsapp_2,
    posto.aviso_whatsapp_3,
    posto.aviso_whatsapp_4,
  ]
  const candidates = avisos.some(Boolean) ? avisos : [posto.telefone]
  const unique = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = toZApiPhone(candidate)
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

function formatDateKeyPtBr(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

async function sendWhatsApp(phone: string, message: string) {
  const webhookUrl = Deno.env.get('WHATSAPP_WEBHOOK_URL')
  const apiKey = Deno.env.get('WHATSAPP_API_KEY')
  if (!webhookUrl) {
    console.warn('WHATSAPP_WEBHOOK_URL not configured, skipping WhatsApp')
    return false
  }

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
    body: JSON.stringify({
      phone: toZApiPhone(phone),
      message,
    }),
  })

  if (!response.ok) {
    console.error('Failed to send WhatsApp', phone, await response.text())
    return false
  }
  return true
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

async function broadcast(
  phones: string[],
  message: string,
) {
  if (!phones.length) return false
  const results = await Promise.all(phones.map((p) => sendWhatsApp(p, message)))
  return results.some(Boolean)
}

function docMessage(
  postoName: string,
  title: string,
  daysLeft: number,
  expiresKey: string,
) {
  const when = formatDateKeyPtBr(expiresKey)
  if (daysLeft === 0) {
    return [
      '🚨 *VALIDADE EXPIRADA — Teu Posto*',
      '',
      `Olá, *${postoName}*!`,
      '',
      `O documento *_${title}_* *venceu hoje* (${when}).`,
      '',
      '⚠️ A *validade está expirada*. Renove o documento e atualize o anexo no Teu Posto o quanto antes para manter a conformidade.',
      '',
      '_Não deixe pendências regulatórias acumularem!_',
    ].join('\n')
  }

  const urgency =
    daysLeft === 1
      ? '🔥 *ÚLTIMO DIA*'
      : daysLeft <= 7
        ? '⏰ *ATENÇÃO URGENTE*'
        : daysLeft <= 15
          ? '📌 *Lembrete importante*'
          : '📋 *Aviso de vencimento*'

  return [
    `${urgency} — Teu Posto`,
    '',
    `Olá, *${postoName}*!`,
    '',
    `O documento *_${title}_* vence em *${daysLeft} dia${daysLeft === 1 ? '' : 's'}* (${when}).`,
    '',
    'Organize a renovação e atualize o arquivo no sistema para não correr risco de operação irregular.',
    '',
    '_Teu Posto cuida do prazo — você cuida da renovação._',
  ].join('\n')
}

function metrologyMessage(postoName: string, dueKey: string) {
  return [
    '🔧 *METROLOGIA EM DIA?* — Teu Posto',
    '',
    `Olá, *${postoName}*!`,
    '',
    `Já se passaram *15 dias* desde a última verificação metrológica.`,
    `📅 Prazo de hoje: *${formatDateKeyPtBr(dueKey)}*`,
    '',
    'Faça uma *nova metrologia dos bicos* e registre no Teu Posto agora.',
    '',
    '_Medição em dia = posto em conformidade._ ✅',
  ].join('\n')
}

function drainageMessage(postoName: string, tankName: string, dueKey: string) {
  return [
    '🛢️ *DRENAGEM SEMANAL* — Teu Posto',
    '',
    `Olá, *${postoName}*!`,
    '',
    `Completou *7 dias* desde a última drenagem do tanque *_${tankName}_*.`,
    `📅 Vence hoje: *${formatDateKeyPtBr(dueKey)}*`,
    '',
    'Realize a drenagem e *lance o relatório* no sistema.',
    '',
    '_Rotina semanal que evita dor de cabeça depois._',
  ].join('\n')
}

function raqMessage(postoName: string) {
  return [
    '🧪 *HORA DO RAQ!* — Teu Posto',
    '',
    `Olá, *${postoName}*!`,
    '',
    'Lembrete fixo a cada *2 dias*: registre o *RAQ* (análise de qualidade) no Teu Posto.',
    '',
    'Mesmo que tenha lançado ontem, a rotina continua — *mantenha o histórico em dia*.',
    '',
    '_Qualidade do combustível não espera._ ⛽',
  ].join('\n')
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
    if (cronSecret && provided !== cronSecret) {
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
        'id, nome, telefone, aviso_whatsapp_1, aviso_whatsapp_2, aviso_whatsapp_3, aviso_whatsapp_4, subscription_status',
      )
      .eq('subscription_status', 'active')

    if (postosError) throw postosError

    const activePostos = (postos ?? []).filter((p) => collectAvisoPhones(p as PostoRow).length > 0)
    const postoIds = activePostos.map((p) => p.id)
    const details: Array<Record<string, unknown>> = []
    let sent = 0

    if (!postoIds.length) {
      return jsonResponse({ ok: true, today: todayKey, sent: 0, checked_postos: 0, details: [] })
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

    const docJobs: Array<{
      category: 'regulatory_doc' | 'work_safety_doc'
      id: string
      posto_id: string
      title: string
      expires_at: string
    }> = [
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

    const postoById = new Map(activePostos.map((p) => [p.id, p as PostoRow]))

    for (const doc of docJobs) {
      const daysLeft = daysBetweenKeys(todayKey, doc.expires_at)
      if (!(DOC_MILESTONES as readonly number[]).includes(daysLeft)) continue

      const milestone = `d${daysLeft}`
      if (await alreadySent(admin, doc.posto_id, doc.category, doc.id, milestone)) {
        details.push({ type: doc.category, id: doc.id, skipped: 'already_sent', milestone })
        continue
      }

      const posto = postoById.get(doc.posto_id)
      if (!posto) continue
      const phones = collectAvisoPhones(posto)
      const message = docMessage(posto.nome, doc.title, daysLeft, doc.expires_at)
      const ok = await broadcast(phones, message)
      if (ok) {
        await markSent(admin, doc.posto_id, doc.category, doc.id, milestone, todayKey)
        sent += 1
        details.push({ type: doc.category, id: doc.id, milestone, sent: true })
      } else {
        details.push({ type: doc.category, id: doc.id, milestone, sent: false })
      }
    }

    // --- Metrologia (15 dias desde a última) ---
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
      if (dueKey !== todayKey) continue

      const milestone = `due:${dueKey}`
      if (await alreadySent(admin, posto.id, 'metrology', 'posto', milestone)) {
        details.push({ type: 'metrology', posto_id: posto.id, skipped: 'already_sent' })
        continue
      }

      const phones = collectAvisoPhones(posto as PostoRow)
      const ok = await broadcast(phones, metrologyMessage(posto.nome, dueKey))
      if (ok) {
        await markSent(admin, posto.id, 'metrology', 'posto', milestone, todayKey)
        sent += 1
        details.push({ type: 'metrology', posto_id: posto.id, sent: true })
      } else {
        details.push({ type: 'metrology', posto_id: posto.id, sent: false })
      }
    }

    // --- Drenagem (7 dias por tanque, só no dia do vencimento, 1x) ---
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
        if (dueKey !== todayKey) continue

        const milestone = `due:${dueKey}`
        if (await alreadySent(admin, tank.posto_id, 'drainage', tank.id, milestone)) {
          details.push({ type: 'drainage', tank_id: tank.id, skipped: 'already_sent' })
          continue
        }

        const posto = postoById.get(tank.posto_id)
        if (!posto) continue
        const phones = collectAvisoPhones(posto)
        const ok = await broadcast(
          phones,
          drainageMessage(posto.nome, tank.name, dueKey),
        )
        if (ok) {
          await markSent(admin, tank.posto_id, 'drainage', tank.id, milestone, todayKey)
          sent += 1
          details.push({ type: 'drainage', tank_id: tank.id, sent: true })
        } else {
          details.push({ type: 'drainage', tank_id: tank.id, sent: false })
        }
      }
    }

    // --- RAQ a cada 2 dias (independente de lançamentos) ---
    for (const posto of activePostos) {
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
        if (daysBetweenKeys(lastKey, todayKey) < RAQ_INTERVAL_DAYS) {
          details.push({ type: 'raq', posto_id: posto.id, skipped: 'too_soon' })
          continue
        }
      }

      const milestone = `day:${todayKey}`
      if (await alreadySent(admin, posto.id, 'raq', 'periodic', milestone)) {
        details.push({ type: 'raq', posto_id: posto.id, skipped: 'already_sent' })
        continue
      }

      const phones = collectAvisoPhones(posto as PostoRow)
      const ok = await broadcast(phones, raqMessage(posto.nome))
      if (ok) {
        await markSent(admin, posto.id, 'raq', 'periodic', milestone, todayKey)
        sent += 1
        details.push({ type: 'raq', posto_id: posto.id, sent: true })
      } else {
        details.push({ type: 'raq', posto_id: posto.id, sent: false })
      }
    }

    return jsonResponse({
      ok: true,
      today: todayKey,
      checked_postos: activePostos.length,
      sent,
      details,
    })
  } catch (error) {
    console.error('operational-reminders error', error)
    return jsonResponse({ ok: false, message: 'Erro ao processar lembretes operacionais.' }, 500)
  }
})
