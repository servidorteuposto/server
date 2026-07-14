import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-drainage-cron-secret',
}

const DRAINAGE_INTERVAL_DAYS = 7
const TIME_ZONE = 'America/Sao_Paulo'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
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

function formatDateKeyPtBr(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('SECURITY_EMAIL_FROM') ?? 'avisos@teuposto.com.br'
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
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!response.ok) {
    console.error('Failed to send drainage email', await response.text())
    return false
  }
  return true
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
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      phone: onlyDigits(phone),
      message,
    }),
  })

  if (!response.ok) {
    console.error('Failed to send drainage WhatsApp', await response.text())
    return false
  }
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('DRAINAGE_CRON_SECRET')
    const providedSecret = req.headers.get('x-drainage-cron-secret')
    if (cronSecret && providedSecret !== cronSecret) {
      return jsonResponse({ ok: false, message: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: 'Missing Supabase credentials' }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const todayKey = toSaoPauloDateKey(new Date())
    if (!todayKey) {
      return jsonResponse({ ok: false, message: 'Invalid today date' }, 500)
    }

    const { data: tanks, error: tanksError } = await supabase
      .from('diesel_tanks')
      .select('id, name, posto_id, is_active')
      .eq('is_active', true)

    if (tanksError) throw tanksError

    const tankRows = tanks ?? []
    if (!tankRows.length) {
      return jsonResponse({ ok: true, checked: 0, sent: 0 })
    }

    const postoIds = [...new Set(tankRows.map((tank) => tank.posto_id))]
    const tankIds = tankRows.map((tank) => tank.id)

    const [{ data: postos, error: postosError }, { data: reports, error: reportsError }] =
      await Promise.all([
        supabase.from('postos').select('id, nome, email, telefone').in('id', postoIds),
        supabase
          .from('diesel_drainage_reports')
          .select('tank_id, drained_at')
          .in('tank_id', tankIds)
          .order('drained_at', { ascending: false }),
      ])

    if (postosError) throw postosError
    if (reportsError) throw reportsError

    const postoById = new Map((postos ?? []).map((posto) => [posto.id, posto]))
    const lastByTank = new Map<string, string>()
    for (const report of reports ?? []) {
      if (!lastByTank.has(report.tank_id)) {
        lastByTank.set(report.tank_id, report.drained_at)
      }
    }

    let sent = 0
    const details: Array<Record<string, unknown>> = []

    for (const tank of tankRows) {
      const lastDrainedAt = lastByTank.get(tank.id)
      if (!lastDrainedAt) continue

      const lastKey = toSaoPauloDateKey(lastDrainedAt)
      if (!lastKey) continue

      const dueDate = addDaysToDateKey(lastKey, DRAINAGE_INTERVAL_DAYS)
      const warnDate = addDaysToDateKey(dueDate, -1)

      let kind: 'day_before' | 'due_day' | null = null
      if (todayKey === warnDate) kind = 'day_before'
      if (todayKey === dueDate) kind = 'due_day'
      if (!kind) continue

      const { data: existing } = await supabase
        .from('diesel_drainage_reminders')
        .select('id')
        .eq('tank_id', tank.id)
        .eq('due_date', dueDate)
        .eq('kind', kind)
        .maybeSingle()

      if (existing?.id) {
        details.push({ tank_id: tank.id, kind, skipped: 'already_sent' })
        continue
      }

      const posto = postoById.get(tank.posto_id)
      if (!posto) continue

      const subject =
        kind === 'day_before'
          ? `Aviso: drenagem do tanque ${tank.name} vence amanhã`
          : `Aviso: drenagem do tanque ${tank.name} vence hoje`

      const bodyText =
        kind === 'day_before'
          ? `Olá, ${posto.nome}! Amanhã (${formatDateKeyPtBr(dueDate)}) completa 1 semana da última drenagem do tanque "${tank.name}". Prepare o lançamento no teu posto.`
          : `Olá, ${posto.nome}! Hoje (${formatDateKeyPtBr(dueDate)}) completa 1 semana da última drenagem do tanque "${tank.name}". Lance o relatório no teu posto.`

      const emailHtml = `
        <p>Olá, <strong>${posto.nome}</strong>,</p>
        <p>${bodyText}</p>
        <p>A drenagem de tanques de óleo diesel deve ser registrada semanalmente.</p>
      `

      const [emailSent, whatsappSent] = await Promise.all([
        posto.email ? sendEmail(posto.email, subject, emailHtml) : Promise.resolve(false),
        posto.telefone ? sendWhatsApp(posto.telefone, bodyText) : Promise.resolve(false),
      ])

      const { error: insertError } = await supabase.from('diesel_drainage_reminders').insert({
        posto_id: tank.posto_id,
        tank_id: tank.id,
        due_date: dueDate,
        kind,
        email_sent: emailSent,
        whatsapp_sent: whatsappSent,
      })

      if (insertError) {
        console.error('Failed to persist reminder', insertError)
        details.push({ tank_id: tank.id, kind, error: insertError.message })
        continue
      }

      sent += 1
      details.push({
        tank_id: tank.id,
        kind,
        email_sent: emailSent,
        whatsapp_sent: whatsappSent,
      })
    }

    return jsonResponse({
      ok: true,
      today: todayKey,
      checked: tankRows.length,
      sent,
      details,
    })
  } catch (error) {
    console.error('diesel-drainage-reminders error', error)
    return jsonResponse({ ok: false, message: 'Erro ao processar avisos de drenagem.' }, 500)
  }
})
