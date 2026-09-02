import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  isMetaWhatsAppConfigured,
  normalizeWaPhone,
  sendWhatsAppTemplateDetailed,
} from '../_shared/meta-whatsapp.ts'
import { docTemplate } from '../_shared/whatsapp-templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIME_ZONE = 'America/Sao_Paulo'
const CATEGORY = 'regulatory_doc'
const MILESTONE = 'd0'
const SEND_DELAY_MS = 800

type PostoRow = {
  id: string
  nome: string
  cnpj: string | null
  endereco: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
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

function daysBetweenKeys(fromKey: string, toKey: string) {
  const [y1, m1, d1] = fromKey.split('-').map(Number)
  const [y2, m2, d2] = toKey.split('-').map(Number)
  const a = Date.UTC(y1, m1 - 1, d1)
  const b = Date.UTC(y2, m2 - 1, d2)
  return Math.round((b - a) / 86_400_000)
}

function formatPostoAddress(posto: PostoRow) {
  const parts = [
    posto.logradouro,
    posto.numero,
    posto.complemento,
    posto.bairro,
    posto.cidade,
    posto.uf,
    posto.cep,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
  if (parts.length) return parts.join(', ')
  if (typeof posto.endereco === 'string' && posto.endereco.trim()) return posto.endereco.trim()
  return ''
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
    const documentId = typeof body?.document_id === 'string' ? body.document_id.trim() : ''
    if (!documentId) {
      return jsonResponse({ ok: false, message: 'Informe o documento.' }, 400)
    }

    const { data: postoRow } = await admin
      .from('postos')
      .select(
        'id, nome, cnpj, endereco, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, aviso_whatsapp_1, aviso_whatsapp_2, aviso_whatsapp_3, aviso_whatsapp_4, aviso_whatsapp_5',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (!postoRow?.id) {
      return jsonResponse({ ok: false, message: 'Posto não encontrado.' }, 403)
    }

    const posto = postoRow as PostoRow

    const { data: document, error: documentError } = await admin
      .from('regulatory_documents')
      .select('id, posto_id, title, expires_at, storage_path')
      .eq('id', documentId)
      .eq('posto_id', posto.id)
      .maybeSingle()

    if (documentError) throw documentError
    if (!document) {
      return jsonResponse({ ok: false, message: 'Documento não encontrado.' }, 404)
    }

    if (!document.expires_at || !document.storage_path) {
      return jsonResponse({ ok: true, skipped: 'no_expiry_or_file' })
    }

    const expiresKey = String(document.expires_at).slice(0, 10)
    const todayKey = saoPauloTodayKey()
    const daysLeft = daysBetweenKeys(todayKey, expiresKey)

    if (daysLeft >= 0) {
      return jsonResponse({ ok: true, skipped: 'not_expired' })
    }

    const { data: already } = await admin
      .from('whatsapp_reminder_sends')
      .select('id')
      .eq('posto_id', posto.id)
      .eq('category', CATEGORY)
      .eq('reference_id', documentId)
      .eq('milestone', MILESTONE)
      .maybeSingle()

    if (already?.id) {
      return jsonResponse({ ok: true, skipped: 'already_sent' })
    }

    const phones = collectAvisoPhones(posto)
    if (!phones.length) {
      return jsonResponse({ ok: true, skipped: 'no_phones', template: 'aviso_doc_vencido' })
    }

    const tpl = docTemplate({
      nome: posto.nome,
      cnpj: posto.cnpj,
      endereco: formatPostoAddress(posto),
      docTitle: document.title,
      daysLeft,
      expiresKey,
    })

    async function enqueueRetry(lastError: string) {
      await admin.from('whatsapp_reminder_queue').upsert(
        {
          posto_id: posto.id,
          category: CATEGORY,
          reference_id: documentId,
          milestone: MILESTONE,
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

    const metaConfigured = isMetaWhatsAppConfigured()
    if (!metaConfigured) {
      await enqueueRetry('meta_not_configured')
      return jsonResponse({
        ok: true,
        template: 'aviso_doc_vencido',
        queued: true,
        skipped: 'meta_not_configured',
      })
    }

    let delivered = 0
    let lastSendError = 'whatsapp_send_failed'
    for (const [index, phone] of phones.entries()) {
      if (index > 0) await sleep(SEND_DELAY_MS)
      const sent = await sendWhatsAppTemplateDetailed({
        to: phone,
        name: tpl.name,
        language: tpl.language,
        bodyParams: tpl.bodyParams,
      })
      if (sent.ok) delivered += 1
      else if (sent.error) lastSendError = sent.error
    }

    if (delivered > 0) {
      const { error: markError } = await admin.from('whatsapp_reminder_sends').insert({
        posto_id: posto.id,
        category: CATEGORY,
        reference_id: documentId,
        milestone: MILESTONE,
        sent_on: todayKey,
      })
      if (markError && !String(markError.message ?? '').includes('duplicate')) {
        console.error('send-doc-expired-alert markSent failed', markError)
      }
      await admin
        .from('whatsapp_reminder_queue')
        .delete()
        .eq('posto_id', posto.id)
        .eq('category', CATEGORY)
        .eq('reference_id', documentId)
        .eq('milestone', MILESTONE)

      return jsonResponse({
        ok: true,
        template: 'aviso_doc_vencido',
        delivered: true,
        targets: phones.length,
      })
    }

    await enqueueRetry(lastSendError)
    return jsonResponse({
      ok: true,
      template: 'aviso_doc_vencido',
      queued: true,
      targets: phones.length,
    })
  } catch (error) {
    console.error('send-doc-expired-alert error', error)
    return jsonResponse({ ok: false, message: 'Erro ao enviar aviso de documento vencido.' }, 500)
  }
})
