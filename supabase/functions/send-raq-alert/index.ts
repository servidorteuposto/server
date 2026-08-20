import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  isMetaWhatsAppConfigured,
  normalizeWaPhone,
  sendWhatsAppTemplate,
} from '../_shared/meta-whatsapp.ts'
import { raqForaTemplate, type RaqOutOfSpecItem } from '../_shared/whatsapp-templates.ts'
import { isSaoPauloBusinessHours } from '../_shared/business-hours.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIME_ZONE = 'America/Sao_Paulo'
const CATEGORY = 'raq_out_of_spec'
const SEND_DELAY_MS = 800
const MAX_SENDS = 12

type PostoRow = {
  id: string
  telefone: string | null
  aviso_whatsapp_1: string | null
  aviso_whatsapp_2: string | null
  aviso_whatsapp_3: string | null
  aviso_whatsapp_4: string | null
  aviso_whatsapp_5: string | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function saoPauloTodayKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) return new Date().toISOString().slice(0, 10)
  return `${year}-${month}-${day}`
}

function formatSaoPauloDate(iso: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(iso))
  const day = parts.find((part) => part.type === 'day')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const year = parts.find((part) => part.type === 'year')?.value
  if (!day || !month || !year) return iso.slice(0, 10)
  return `${day}/${month}/${year}`
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

function milestoneFor(productKey: string) {
  return `fora:${productKey}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Método não permitido.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ ok: false, message: 'Configuração do servidor incompleta.' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
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
    if (userError || !user) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const reportId = typeof body?.report_id === 'string' ? body.report_id.trim() : ''
    if (!reportId) {
      return jsonResponse({ ok: false, message: 'Informe o relatório.' }, 400)
    }

    const { data: postoRow } = await admin
      .from('postos')
      .select(
        'id, telefone, aviso_whatsapp_1, aviso_whatsapp_2, aviso_whatsapp_3, aviso_whatsapp_4, aviso_whatsapp_5',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (!postoRow?.id) {
      return jsonResponse({ ok: false, message: 'Posto não encontrado.' }, 403)
    }

    const posto = postoRow as PostoRow

    const { data: report, error: reportError } = await admin
      .from('fuel_analysis_reports')
      .select('id, posto_id, razao_social, cnpj, endereco, submitted_at')
      .eq('id', reportId)
      .eq('posto_id', posto.id)
      .maybeSingle()

    if (reportError) throw reportError
    if (!report) {
      return jsonResponse({ ok: false, message: 'Relatório não encontrado.' }, 404)
    }

    await admin
      .from('whatsapp_reminder_queue')
      .delete()
      .eq('posto_id', posto.id)
      .eq('category', 'raq')
      .eq('reference_id', 'periodic')

    const { data: itemRows, error: itemsError } = await admin
      .from('fuel_analysis_items')
      .select(
        'product_key, aspecto, cor, temperatura_observada, massa_especifica_observada, massa_especifica_convertida, densidade_status, photo_captured_at',
      )
      .eq('report_id', reportId)
      .eq('densidade_status', 'inapto')

    if (itemsError) throw itemsError

    const failed = (itemRows ?? []) as Array<RaqOutOfSpecItem & { photo_captured_at?: string | null }>
    if (!failed.length) {
      return jsonResponse({ ok: true, skipped: 'no_failed_items' })
    }

    const phones = collectAvisoPhones(posto)
    if (!phones.length) {
      return jsonResponse({ ok: true, skipped: 'no_phones', template: 'aviso_raq_fora' })
    }

    const todayKey = saoPauloTodayKey()
    const metaConfigured = isMetaWhatsAppConfigured()
    let apiCalls = 0
    let deliveredJobs = 0
    let queuedJobs = 0

    for (const item of failed) {
      const milestone = milestoneFor(item.product_key)
      const { data: already } = await admin
        .from('whatsapp_reminder_sends')
        .select('id')
        .eq('posto_id', posto.id)
        .eq('category', CATEGORY)
        .eq('reference_id', reportId)
        .eq('milestone', milestone)
        .maybeSingle()

      if (already?.id) continue

      const dataVerificacao = formatSaoPauloDate(
        String(item.photo_captured_at || report.submitted_at || new Date().toISOString()),
      )
      const tpl = raqForaTemplate({
        nome: report.razao_social,
        cnpj: report.cnpj,
        endereco: report.endereco,
        data: dataVerificacao,
        item,
      })

      async function enqueueRetry(lastError: string) {
        queuedJobs += 1
        await admin.from('whatsapp_reminder_queue').upsert(
          {
            posto_id: posto.id,
            category: CATEGORY,
            reference_id: reportId,
            milestone,
            message: tpl.summary,
            template_name: tpl.name,
            template_params: tpl.bodyParams,
            phones,
            due_on: todayKey,
            last_error: lastError,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'posto_id,category,reference_id,milestone' },
        )
      }

      if (!isSaoPauloBusinessHours()) {
        await enqueueRetry('outside_business_hours')
        continue
      }

      if (!metaConfigured || apiCalls >= MAX_SENDS) {
        await enqueueRetry(metaConfigured ? 'rate_limit_batch' : 'meta_not_configured')
        continue
      }

      let delivered = 0
      for (const [index, phone] of phones.entries()) {
        if (apiCalls >= MAX_SENDS) break
        if (apiCalls > 0 || index > 0) await sleep(SEND_DELAY_MS)
        const sent = await sendWhatsAppTemplate({
          to: phone,
          name: tpl.name,
          language: tpl.language,
          bodyParams: tpl.bodyParams,
        })
        apiCalls += 1
        if (sent) delivered += 1
      }

      if (delivered > 0) {
        deliveredJobs += 1
        const { error: markError } = await admin.from('whatsapp_reminder_sends').insert({
          posto_id: posto.id,
          category: CATEGORY,
          reference_id: reportId,
          milestone,
          sent_on: todayKey,
        })
        if (markError && !String(markError.message ?? '').includes('duplicate')) {
          console.error('send-raq-alert markSent failed', markError)
        }
        await admin
          .from('whatsapp_reminder_queue')
          .delete()
          .eq('posto_id', posto.id)
          .eq('category', CATEGORY)
          .eq('reference_id', reportId)
          .eq('milestone', milestone)
      } else {
        await enqueueRetry('whatsapp_send_failed')
      }
    }

    return jsonResponse({
      ok: true,
      template: 'aviso_raq_fora',
      failed_products: failed.length,
      targets: phones.length,
      delivered_jobs: deliveredJobs,
      queued_jobs: queuedJobs,
    })
  } catch (error) {
    console.error('send-raq-alert error', error)
    return jsonResponse({ ok: false, message: 'Erro ao enviar aviso de RAQ.' }, 500)
  }
})
