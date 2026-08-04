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
/** ~6 msgs/min — dentro da faixa 5–10/min pedida */
const SEND_DELAY_MS = 10_000
const MAX_SENDS_PER_RUN = Number(Deno.env.get('OPERATIONAL_MAX_SENDS') ?? '40')

type PostoRow = {
  id: string
  nome: string
  cnpj: string | null
  telefone: string | null
  aviso_whatsapp_1: string | null
  aviso_whatsapp_2: string | null
  aviso_whatsapp_3: string | null
  aviso_whatsapp_4: string | null
  subscription_status: string | null
}

type OutboundJob = {
  phones: string[]
  message: string
  meta: Record<string, unknown>
  onSuccess: () => Promise<void>
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

function formatCnpj(value: string | null | undefined) {
  const digits = onlyDigits(value ?? '')
  if (digits.length !== 14) return value?.trim() || 'não informado'
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function postoHeader(nome: string, cnpj: string | null | undefined) {
  return [`🏪 *Posto:* ${nome}`, `🧾 *CNPJ:* ${formatCnpj(cnpj)}`].join('\n')
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

function pickVariantIndex(seed: string, count = 10) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % count
}

function pick<T>(variants: T[], seed: string): T {
  return variants[pickVariantIndex(seed, variants.length)]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

/** Processa a fila com delay de 10s entre cada envio à API (nunca em rajada). */
async function flushQueue(jobs: OutboundJob[]) {
  const details: Array<Record<string, unknown>> = []
  let apiCalls = 0
  let jobsSent = 0
  let deferred = 0

  for (const job of jobs) {
    if (apiCalls >= MAX_SENDS_PER_RUN) {
      deferred += 1
      details.push({ ...job.meta, skipped: 'rate_limit_batch', deferred: true })
      continue
    }

    let ok = false
    for (const phone of job.phones) {
      if (apiCalls >= MAX_SENDS_PER_RUN) break
      if (apiCalls > 0) await sleep(SEND_DELAY_MS)
      const delivered = await sendWhatsApp(phone, job.message)
      apiCalls += 1
      if (delivered) ok = true
    }

    if (ok) {
      await job.onSuccess()
      jobsSent += 1
      details.push({ ...job.meta, sent: true })
    } else if (apiCalls >= MAX_SENDS_PER_RUN && !ok) {
      deferred += 1
      details.push({ ...job.meta, skipped: 'rate_limit_batch', deferred: true })
    } else {
      details.push({ ...job.meta, sent: false })
    }
  }

  return { details, apiCalls, jobsSent, deferred }
}

function docMessage(
  posto: PostoRow,
  title: string,
  daysLeft: number,
  expiresKey: string,
  seed: string,
) {
  const when = formatDateKeyPtBr(expiresKey)
  const header = postoHeader(posto.nome, posto.cnpj)
  const dayLabel = daysLeft === 1 ? '1 dia' : `${daysLeft} dias`

  if (daysLeft === 0) {
    return pick(
      [
        [
          '🚨 *VALIDADE EXPIRADA — Teu Posto*',
          '',
          header,
          '',
          `O documento *_${title}_* *venceu hoje* (${when}).`,
          '',
          'A validade está expirada. Renove e atualize o anexo no Teu Posto o quanto antes.',
        ].join('\n'),
        [
          '⚠️ *Documento vencido*',
          '',
          header,
          '',
          `Atenção: *_${title}_* expirou em *${when}*.`,
          '',
          'Regularize a renovação e registre o novo arquivo no sistema.',
        ].join('\n'),
        [
          '🛑 *Prazo estourado — Teu Posto*',
          '',
          header,
          '',
          `*_${title}_* está com validade *expirada* (hoje, ${when}).`,
          '',
          'Não deixe pendência regulatória aberta — renove já.',
        ].join('\n'),
        [
          '📢 *Aviso urgente de validade*',
          '',
          header,
          '',
          `O item *_${title}_* venceu nesta data (${when}).`,
          '',
          'Atualize o documento no Teu Posto após a renovação.',
        ].join('\n'),
        [
          '🔴 *Conformidade em risco*',
          '',
          header,
          '',
          `*_${title}_* perdeu a validade hoje (${when}).`,
          '',
          'Faça a renovação e anexe o comprovante no app.',
        ].join('\n'),
        [
          '⏳ *Vencimento do dia*',
          '',
          header,
          '',
          `Hoje (${when}) o documento *_${title}_* chegou ao fim da validade.`,
          '',
          'Priorize a renovação para manter a operação em dia.',
        ].join('\n'),
        [
          '📋 *Checklist Teu Posto*',
          '',
          header,
          '',
          `Pendente crítico: *_${title}_* vencido em ${when}.`,
          '',
          'Renove e lance o novo anexo no sistema.',
        ].join('\n'),
        [
          '🚨 *Alerta regulatório*',
          '',
          header,
          '',
          `*_${title}_* está vencido (data: ${when}).`,
          '',
          'Ação imediata: renovar e atualizar no Teu Posto.',
        ].join('\n'),
        [
          '❗ *Documento fora da validade*',
          '',
          header,
          '',
          `Confirmamos o vencimento de *_${title}_* em ${when}.`,
          '',
          'Evite autuação: regularize e registre no app.',
        ].join('\n'),
        [
          '📌 *Lembrete Teu Posto — vencido*',
          '',
          header,
          '',
          `*_${title}_* expirou hoje (${when}).`,
          '',
          'Assim que renovar, atualize o arquivo no Teu Posto.',
        ].join('\n'),
      ],
      seed,
    )
  }

  const urgency =
    daysLeft === 1
      ? 'ÚLTIMO DIA'
      : daysLeft <= 7
        ? 'URGENTE'
        : daysLeft <= 15
          ? 'IMPORTANTE'
          : 'LEMBRETE'

  return pick(
    [
      [
        `⏰ *${urgency} — Teu Posto*`,
        '',
        header,
        '',
        `O documento *_${title}_* vence em *${dayLabel}* (${when}).`,
        '',
        'Organize a renovação e atualize o arquivo no sistema.',
      ].join('\n'),
      [
        `📅 *Prazo se aproximando*`,
        '',
        header,
        '',
        `Faltam *${dayLabel}* para *_${title}_* (vence em ${when}).`,
        '',
        'Não deixe para a última hora — prepare a renovação.',
      ].join('\n'),
      [
        `📋 *Aviso de vencimento — Teu Posto*`,
        '',
        header,
        '',
        `*_${title}_* tem validade até *${when}* (*${dayLabel}* restantes).`,
        '',
        'Renove e anexe o novo documento no Teu Posto.',
      ].join('\n'),
      [
        `🔔 *Lembrete operacional*`,
        '',
        header,
        '',
        `Em *${dayLabel}* vence *_${title}_* (${when}).`,
        '',
        'Mantenha a conformidade: renove e registre no app.',
      ].join('\n'),
      [
        `📌 *Documento com prazo curto*`,
        '',
        header,
        '',
        `Atenção ao item *_${title}_*: faltam *${dayLabel}* (${when}).`,
        '',
        'Atualize o anexo assim que a renovação sair.',
      ].join('\n'),
      [
        `🗓️ *Calendário Teu Posto*`,
        '',
        header,
        '',
        `Próximo vencimento: *_${title}_* em *${when}* (*${dayLabel}*).`,
        '',
        'Antecipe a renovação para evitar operação irregular.',
      ].join('\n'),
      [
        `⚠️ *${urgency}*`,
        '',
        header,
        '',
        `*_${title}_* vence dia *${when}* — restam *${dayLabel}*.`,
        '',
        'Cuide da renovação e lance no Teu Posto.',
      ].join('\n'),
      [
        `📣 *Comunicado do Teu Posto*`,
        '',
        header,
        '',
        `Lembrete: *_${title}_* chega ao fim da validade em *${dayLabel}* (${when}).`,
        '',
        'Após renovar, atualize o arquivo no sistema.',
      ].join('\n'),
      [
        `🧾 *Controle de documentos*`,
        '',
        header,
        '',
        `Status: *_${title}_* vence em *${dayLabel}* (${when}).`,
        '',
        'Planeje a renovação e mantenha o histórico em dia.',
      ].join('\n'),
      [
        `✅ *Previna pendências*`,
        '',
        header,
        '',
        `Faltam *${dayLabel}* para o vencimento de *_${title}_* (${when}).`,
        '',
        'Renove com antecedência e registre no Teu Posto.',
      ].join('\n'),
    ],
    seed,
  )
}

function metrologyMessage(posto: PostoRow, dueKey: string, seed: string) {
  const header = postoHeader(posto.nome, posto.cnpj)
  const when = formatDateKeyPtBr(dueKey)
  return pick(
    [
      [
        '🔧 *METROLOGIA EM DIA?* — Teu Posto',
        '',
        header,
        '',
        'Já se passaram *15 dias* desde a última verificação metrológica.',
        `📅 Prazo de hoje: *${when}*`,
        '',
        'Faça uma nova metrologia dos bicos e registre no Teu Posto.',
      ].join('\n'),
      [
        '📏 *Lembrete de metrologia*',
        '',
        header,
        '',
        `Completou o ciclo de *15 dias*. Data de referência: *${when}*.`,
        '',
        'Verifique os bicos e lance a medição no sistema.',
      ].join('\n'),
      [
        '🛠️ *Rotina metrológica*',
        '',
        header,
        '',
        'Hora de nova verificação dos bicos (intervalo de 15 dias).',
        `Marcado para *${when}*.`,
        '',
        'Registre o resultado no Teu Posto.',
      ].join('\n'),
      [
        '⛽ *Bicos sob controle*',
        '',
        header,
        '',
        `Passaram *15 dias* da última metrologia. Hoje: *${when}*.`,
        '',
        'Realize a verificação e atualize o histórico no app.',
      ].join('\n'),
      [
        '📌 *Aviso Teu Posto — metrologia*',
        '',
        header,
        '',
        'O intervalo de 15 dias foi atingido.',
        `Faça a metrologia e registre até *${when}* no sistema.`,
      ].join('\n'),
      [
        '🔔 *Checklist operacional*',
        '',
        header,
        '',
        `Item do dia: *metrologia dos bicos* (${when}).`,
        '',
        'Após medir, lance no Teu Posto para manter a conformidade.',
      ].join('\n'),
      [
        '🧪 *Precisão dos bicos*',
        '',
        header,
        '',
        'Lembrete quinzenal: nova verificação metrológica.',
        `Data: *${when}*. Registre no Teu Posto.`,
      ].join('\n'),
      [
        '📋 *Pendência de metrologia*',
        '',
        header,
        '',
        `Hoje (*${when}*) vence o ciclo de 15 dias da última medição.`,
        '',
        'Execute e anote no sistema.',
      ].join('\n'),
      [
        '✅ *Mantenha a medição em dia*',
        '',
        header,
        '',
        'Já faz 15 dias da última metrologia.',
        `Refaça a verificação e lance no Teu Posto (*${when}*).`,
      ].join('\n'),
      [
        '📆 *Ciclo de 15 dias*',
        '',
        header,
        '',
        `Chegou a data (*${when}*) para nova metrologia dos bicos.`,
        '',
        'Faça a checagem e registre no app.',
      ].join('\n'),
    ],
    seed,
  )
}

function drainageMessage(posto: PostoRow, tankName: string, dueKey: string, seed: string) {
  const header = postoHeader(posto.nome, posto.cnpj)
  const when = formatDateKeyPtBr(dueKey)
  return pick(
    [
      [
        '🛢️ *DRENAGEM SEMANAL* — Teu Posto',
        '',
        header,
        '',
        `Completou *7 dias* desde a última drenagem do tanque *_${tankName}_*.`,
        `📅 Vence hoje: *${when}*`,
        '',
        'Realize a drenagem e lance o relatório no sistema.',
      ].join('\n'),
      [
        '💧 *Lembrete de drenagem*',
        '',
        header,
        '',
        `Tanque *_${tankName}_*: ciclo semanal vencendo em *${when}*.`,
        '',
        'Faça a drenagem e registre no Teu Posto.',
      ].join('\n'),
      [
        '🛢️ *Rotina do tanque*',
        '',
        header,
        '',
        `Já se passaram 7 dias da drenagem de *_${tankName}_*.`,
        `Data: *${when}*. Lance o relatório após executar.`,
      ].join('\n'),
      [
        '📌 *Aviso operacional — drenagem*',
        '',
        header,
        '',
        `Pendente: drenagem do tanque *_${tankName}_* (hoje, ${when}).`,
        '',
        'Execute e atualize o histórico no app.',
      ].join('\n'),
      [
        '🔔 *Checklist semanal*',
        '',
        header,
        '',
        `Item: drenagem de *_${tankName}_* — vencimento *${when}*.`,
        '',
        'Não pule a rotina: drene e registre.',
      ].join('\n'),
      [
        '⚠️ *Prazo de drenagem*',
        '',
        header,
        '',
        `O tanque *_${tankName}_* completa 7 dias sem drenagem em *${when}*.`,
        '',
        'Realize o procedimento e lance no Teu Posto.',
      ].join('\n'),
      [
        '📋 *Controle de tanques*',
        '',
        header,
        '',
        `*_${tankName}_* precisa de drenagem (ciclo de 7 dias — ${when}).`,
        '',
        'Após concluir, registre o relatório.',
      ].join('\n'),
      [
        '✅ *Mantenha a drenagem em dia*',
        '',
        header,
        '',
        `Lembrete: tanque *_${tankName}_*, data *${when}*.`,
        '',
        'Drene e anote no Teu Posto.',
      ].join('\n'),
      [
        '🗓️ *Ciclo de 7 dias*',
        '',
        header,
        '',
        `Chegou o dia da drenagem de *_${tankName}_* (${when}).`,
        '',
        'Execute e lance o relatório no sistema.',
      ].join('\n'),
      [
        '📣 *Comunicado Teu Posto*',
        '',
        header,
        '',
        `Drenagem pendente no tanque *_${tankName}_* — *${when}*.`,
        '',
        'Faça agora e registre no app para manter o histórico.',
      ].join('\n'),
    ],
    seed,
  )
}

function raqMessage(posto: PostoRow, seed: string) {
  const header = postoHeader(posto.nome, posto.cnpj)
  return pick(
    [
      [
        '🧪 *HORA DO RAQ!* — Teu Posto',
        '',
        header,
        '',
        'Lembrete a cada *2 dias*: registre o *RAQ* (análise de qualidade) no Teu Posto.',
        '',
        'Mantenha o histórico em dia.',
      ].join('\n'),
      [
        '⛽ *Qualidade do combustível*',
        '',
        header,
        '',
        'Chegou o lembrete periódico do *RAQ*.',
        '',
        'Lance a análise de qualidade no sistema.',
      ].join('\n'),
      [
        '📌 *Rotina RAQ*',
        '',
        header,
        '',
        'Aviso fixo (a cada 2 dias): hora de registrar o *RAQ*.',
        '',
        'Abra o Teu Posto e faça o lançamento.',
      ].join('\n'),
      [
        '🔔 *Checklist de qualidade*',
        '',
        header,
        '',
        'Não esqueça o *RAQ* de hoje.',
        '',
        'Registre a análise no Teu Posto para manter a conformidade.',
      ].join('\n'),
      [
        '🧴 *Análise de qualidade*',
        '',
        header,
        '',
        'Lembrete Teu Posto: execute e registre o *RAQ*.',
        '',
        'Intervalo padrão: a cada 2 dias.',
      ].join('\n'),
      [
        '📋 *Pendência leve — RAQ*',
        '',
        header,
        '',
        'Hora de atualizar o histórico de *RAQ*.',
        '',
        'Lance no app assim que concluir a análise.',
      ].join('\n'),
      [
        '✅ *Mantenha o RAQ em dia*',
        '',
        header,
        '',
        'Lembrete periódico: registre o *RAQ* no Teu Posto.',
        '',
        'Qualidade do combustível não espera.',
      ].join('\n'),
      [
        '📣 *Comunicado operacional*',
        '',
        header,
        '',
        'Ciclo de 2 dias: novo registro de *RAQ*.',
        '',
        'Faça o lançamento no sistema.',
      ].join('\n'),
      [
        '🗓️ *Agenda Teu Posto*',
        '',
        header,
        '',
        'Item recorrente: *RAQ* (análise de qualidade).',
        '',
        'Registre no app e mantenha o histórico limpo.',
      ].join('\n'),
      [
        '🧪 *Controle RAQ*',
        '',
        header,
        '',
        'Aviso do Teu Posto: hora do *RAQ*.',
        '',
        'Execute a análise e lance no sistema.',
      ].join('\n'),
    ],
    seed,
  )
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
        'id, nome, cnpj, telefone, aviso_whatsapp_1, aviso_whatsapp_2, aviso_whatsapp_3, aviso_whatsapp_4, subscription_status',
      )
      .eq('subscription_status', 'active')

    if (postosError) throw postosError

    const activePostos = (postos ?? []).filter((p) => collectAvisoPhones(p as PostoRow).length > 0)
    const postoIds = activePostos.map((p) => p.id)
    const queue: OutboundJob[] = []

    if (!postoIds.length) {
      return jsonResponse({ ok: true, today: todayKey, sent: 0, checked_postos: 0, details: [] })
    }

    const postoById = new Map(activePostos.map((p) => [p.id, p as PostoRow]))

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
      if (await alreadySent(admin, doc.posto_id, doc.category, doc.id, milestone)) continue

      const posto = postoById.get(doc.posto_id)
      if (!posto) continue
      const phones = collectAvisoPhones(posto)
      const seed = `${doc.posto_id}:${doc.category}:${doc.id}:${milestone}:${todayKey}`
      queue.push({
        phones,
        message: docMessage(posto, doc.title, daysLeft, doc.expires_at, seed),
        meta: { type: doc.category, id: doc.id, milestone },
        onSuccess: () => markSent(admin, doc.posto_id, doc.category, doc.id, milestone, todayKey).then(() => {}),
      })
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
      if (dueKey !== todayKey) continue

      const milestone = `due:${dueKey}`
      if (await alreadySent(admin, posto.id, 'metrology', 'posto', milestone)) continue

      const phones = collectAvisoPhones(posto as PostoRow)
      const seed = `${posto.id}:metrology:${milestone}`
      queue.push({
        phones,
        message: metrologyMessage(posto as PostoRow, dueKey, seed),
        meta: { type: 'metrology', posto_id: posto.id },
        onSuccess: () => markSent(admin, posto.id, 'metrology', 'posto', milestone, todayKey).then(() => {}),
      })
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
        if (dueKey !== todayKey) continue

        const milestone = `due:${dueKey}`
        if (await alreadySent(admin, tank.posto_id, 'drainage', tank.id, milestone)) continue

        const posto = postoById.get(tank.posto_id)
        if (!posto) continue
        const phones = collectAvisoPhones(posto)
        const seed = `${tank.posto_id}:drainage:${tank.id}:${milestone}`
        queue.push({
          phones,
          message: drainageMessage(posto, tank.name, dueKey, seed),
          meta: { type: 'drainage', tank_id: tank.id },
          onSuccess: () =>
            markSent(admin, tank.posto_id, 'drainage', tank.id, milestone, todayKey).then(() => {}),
        })
      }
    }

    // --- RAQ ---
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
        if (daysBetweenKeys(lastKey, todayKey) < RAQ_INTERVAL_DAYS) continue
      }

      const milestone = `day:${todayKey}`
      if (await alreadySent(admin, posto.id, 'raq', 'periodic', milestone)) continue

      const phones = collectAvisoPhones(posto as PostoRow)
      const seed = `${posto.id}:raq:${milestone}`
      queue.push({
        phones,
        message: raqMessage(posto as PostoRow, seed),
        meta: { type: 'raq', posto_id: posto.id },
        onSuccess: () => markSent(admin, posto.id, 'raq', 'periodic', milestone, todayKey).then(() => {}),
      })
    }

    const flush = await flushQueue(queue)

    return jsonResponse({
      ok: true,
      today: todayKey,
      checked_postos: activePostos.length,
      queued: queue.length,
      sent: flush.jobsSent,
      api_calls: flush.apiCalls,
      deferred: flush.deferred,
      send_delay_ms: SEND_DELAY_MS,
      max_sends_per_run: MAX_SENDS_PER_RUN,
      details: flush.details,
    })
  } catch (error) {
    console.error('operational-reminders error', error)
    return jsonResponse({ ok: false, message: 'Erro ao processar lembretes operacionais.' }, 500)
  }
})
