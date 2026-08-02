import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
}

const EXPECTED_PRICE = 99

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function mpHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

function isValidSubscriptionAmount(payment: Record<string, unknown>) {
  const amount = Number(payment.transaction_amount)
  if (!Number.isFinite(amount)) return false
  return Math.abs(amount - EXPECTED_PRICE) < 0.02
}

function isValidPreapprovalAmount(data: Record<string, unknown>) {
  const recurring = data.auto_recurring as { transaction_amount?: number } | undefined
  const amount = Number(recurring?.transaction_amount ?? data.transaction_amount)
  if (!Number.isFinite(amount)) return false
  return Math.abs(amount - EXPECTED_PRICE) < 0.02
}

function parsePostoId(externalReference: unknown): string | null {
  const value = String(externalReference ?? '')
  const match = value.match(/^posto:([0-9a-f-]{36})$/i)
  return match?.[1] ?? null
}

function mapMethod(payment: Record<string, unknown>): string {
  const meta = (payment.metadata ?? {}) as Record<string, unknown>
  if (
    meta.method === 'pix' ||
    meta.method === 'boleto' ||
    meta.method === 'card_once' ||
    meta.method === 'card_recurring'
  ) {
    return String(meta.method)
  }
  const paymentType = String(payment.payment_type_id ?? '')
  const paymentMethod = String(payment.payment_method_id ?? '')
  if (paymentMethod === 'pix' || paymentType === 'bank_transfer') return 'pix'
  if (paymentType === 'ticket' || paymentMethod.includes('bol')) return 'boleto'
  if (String(payment.operation_type ?? '') === 'recurring_payment') return 'card_recurring'
  return 'card_once'
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Valida x-signature do Mercado Pago (secret da tela Webhooks).
 * Se o secret não estiver configurado, segue (ainda reconsultamos a API do MP).
 * Se o header x-signature vier, exige validação quando o secret existe.
 */
async function verifyMercadoPagoSignature(req: Request, dataId: string) {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  const legacyQuery =
    req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret')

  // Compat: secret simples na query (legado)
  if (secret && legacyQuery) {
    return legacyQuery === secret
  }

  const xSignature = req.headers.get('x-signature')
  if (!secret) {
    // Sem secret: aceita, pois o status real sempre vem da API do MP com Access Token.
    return true
  }

  if (!xSignature) {
    // notification_url às vezes chega sem x-signature; API fetch ainda protege.
    return true
  }

  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [k, ...rest] = part.trim().split('=')
      return [k, rest.join('=')]
    }),
  )
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const requestId = req.headers.get('x-request-id') ?? ''
  const id = String(dataId ?? '').toLowerCase()
  const manifestParts: string[] = []
  if (id) manifestParts.push(`id:${id}`)
  if (requestId) manifestParts.push(`request-id:${requestId}`)
  manifestParts.push(`ts:${ts}`)
  const manifest = `${manifestParts.join(';')};`

  const expected = await hmacSha256Hex(secret, manifest)
  return timingSafeEqualHex(expected, v1)
}

async function processApprovedPayment(
  admin: ReturnType<typeof createClient>,
  payment: Record<string, unknown>,
) {
  const paymentId = String(payment.id)
  const status = String(payment.status ?? '')
  const metaPostoId = String(
    (payment.metadata as Record<string, unknown> | undefined)?.posto_id ?? '',
  ).trim()
  let resolvedPostoId = parsePostoId(payment.external_reference) ?? (metaPostoId || null)

  if (!resolvedPostoId) {
    const { data: existing } = await admin
      .from('mp_payments')
      .select('posto_id, cnpj')
      .eq('mp_payment_id', paymentId)
      .maybeSingle()
    resolvedPostoId = existing?.posto_id ?? null
  }

  if (!resolvedPostoId) {
    console.error('Webhook payment without posto', paymentId)
    return { ok: false, message: 'posto_not_found' }
  }

  const method = mapMethod(payment)
  const billingMode = method === 'card_recurring' ? 'recurring' : 'one_time'
  const cnpjDigits = onlyDigits(
    String(
      (payment.payer as { identification?: { number?: string } } | undefined)?.identification
        ?.number ?? '',
    ),
  )

  await admin.from('mp_payments').upsert(
    {
      posto_id: resolvedPostoId,
      cnpj: cnpjDigits || 'unknown',
      mp_payment_id: paymentId,
      method,
      status,
      external_reference: String(payment.external_reference ?? `posto:${resolvedPostoId}`),
      amount_cents: Math.round(Number(payment.transaction_amount ?? 99) * 100),
      raw: payment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'mp_payment_id' },
  )

  if (status !== 'approved') {
    return { ok: true, activated: false, status }
  }

  if (!isValidSubscriptionAmount(payment)) {
    console.error('Rejected webhook activation: unexpected amount', paymentId, payment.transaction_amount)
    return { ok: false, message: 'invalid_amount', activated: false }
  }

  const { data, error } = await admin.rpc('activate_or_extend_subscription', {
    p_posto_id: resolvedPostoId,
    p_billing_mode: billingMode,
    p_mp_payment_id: paymentId,
    p_mp_preapproval_id: null,
  })

  if (error) {
    console.error('activate_or_extend_subscription failed', error)
    return { ok: false, message: error.message }
  }

  return { ok: true, activated: true, result: data }
}

async function processPreapproval(
  admin: ReturnType<typeof createClient>,
  accessToken: string,
  preapprovalId: string,
) {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: mpHeaders(accessToken),
  })
  const data = await response.json()
  if (!response.ok) {
    console.error('Failed to fetch preapproval', data)
    return { ok: false, message: 'preapproval_fetch_failed' }
  }

  const postoId = parsePostoId(data.external_reference)
  if (!postoId) {
    return { ok: false, message: 'posto_not_found' }
  }

  await admin
    .from('postos')
    .update({
      mp_preapproval_id: String(data.id),
      billing_mode: 'recurring',
      updated_at: new Date().toISOString(),
    })
    .eq('id', postoId)

  await admin.from('mp_payments').upsert(
    {
      posto_id: postoId,
      cnpj: 'unknown',
      mp_payment_id: `preapproval_${data.id}`,
      method: 'card_recurring',
      status: String(data.status ?? 'pending'),
      external_reference: String(data.external_reference ?? `posto:${postoId}`),
      amount_cents: 9900,
      raw: data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'mp_payment_id' },
  )

  if (data.status === 'authorized') {
    if (!isValidPreapprovalAmount(data)) {
      console.error('Rejected preapproval activation: unexpected amount', data.id)
      return { ok: false, message: 'invalid_amount', activated: false }
    }
    const { data: result, error } = await admin.rpc('activate_or_extend_subscription', {
      p_posto_id: postoId,
      p_billing_mode: 'recurring',
      p_mp_payment_id: null,
      p_mp_preapproval_id: String(data.id),
    })
    if (error) {
      console.error('activate from preapproval failed', error)
      return { ok: false, message: error.message }
    }
    return { ok: true, activated: true, result }
  }

  return { ok: true, activated: false, status: data.status }
}

async function processMerchantOrder(
  admin: ReturnType<typeof createClient>,
  accessToken: string,
  orderId: string,
) {
  const response = await fetch(`https://api.mercadopago.com/merchant_orders/${orderId}`, {
    headers: mpHeaders(accessToken),
  })
  const order = await response.json()
  if (!response.ok) {
    console.error('Failed to fetch merchant order', order)
    return { ok: false, message: 'merchant_order_fetch_failed' }
  }

  const payments = Array.isArray(order.payments) ? order.payments : []
  const approved = payments.find((p: { status?: string }) => p.status === 'approved')
  const target = approved ?? payments[0]
  if (!target?.id) {
    return { ok: true, ignored: true, reason: 'no_payments_in_order' }
  }

  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${target.id}`, {
    headers: mpHeaders(accessToken),
  })
  const payment = await payRes.json()
  if (!payRes.ok) {
    return { ok: false, message: 'payment_fetch_failed' }
  }
  return processApprovedPayment(admin, payment)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // MP faz GET de validação em alguns fluxos
  if (req.method === 'GET' || req.method === 'HEAD') {
    return jsonResponse({ ok: true })
  }

  try {
    const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!accessToken || !supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: 'Configuração incompleta.' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const url = new URL(req.url)
    let topic =
      url.searchParams.get('topic') ??
      url.searchParams.get('type') ??
      ''
    let resourceId =
      url.searchParams.get('id') ??
      url.searchParams.get('data.id') ??
      url.searchParams.get('data_id') ??
      ''

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({} as Record<string, unknown>))
      topic = String(body?.type ?? body?.topic ?? topic ?? '')
      const data = body?.data as { id?: string | number } | undefined
      resourceId = String(data?.id ?? body?.id ?? resourceId ?? '')
      if (!topic && body?.action) topic = String(body.action)
    }

    if (!(await verifyMercadoPagoSignature(req, resourceId))) {
      return jsonResponse({ ok: false, message: 'Unauthorized' }, 401)
    }

    topic = topic.toLowerCase()

    if (!resourceId) {
      // Responde 200 para o MP não retentar em ping vazio
      return jsonResponse({ ok: true, ignored: true, reason: 'missing_id' })
    }

    if (topic.includes('merchant_order') || topic === 'topic_merchant_order_wh') {
      const result = await processMerchantOrder(admin, accessToken, resourceId)
      return jsonResponse(result)
    }

    if (
      topic.includes('authorized_payment') ||
      topic === 'subscription_authorized_payment'
    ) {
      // Cobrança recorrente: authorized_payments aponta para invoice; buscar payment vinculado
      const invRes = await fetch(
        `https://api.mercadopago.com/authorized_payments/${resourceId}`,
        { headers: mpHeaders(accessToken) },
      )
      const invoice = await invRes.json()
      if (invRes.ok && invoice?.payment?.id) {
        const payRes = await fetch(
          `https://api.mercadopago.com/v1/payments/${invoice.payment.id}`,
          { headers: mpHeaders(accessToken) },
        )
        const payment = await payRes.json()
        if (payRes.ok) {
          return jsonResponse(await processApprovedPayment(admin, payment))
        }
      }
      // fallback: tratar id como payment
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
        headers: mpHeaders(accessToken),
      })
      const payment = await payRes.json()
      if (payRes.ok) {
        return jsonResponse(await processApprovedPayment(admin, payment))
      }
      return jsonResponse({ ok: true, ignored: true, reason: 'authorized_payment_unresolved' })
    }

    if (topic.includes('payment') || topic === 'payment') {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
        headers: mpHeaders(accessToken),
      })
      const payment = await response.json()
      if (!response.ok) {
        console.error('Failed to fetch payment', payment)
        return jsonResponse({ ok: false, message: 'payment_fetch_failed' }, 400)
      }
      return jsonResponse(await processApprovedPayment(admin, payment))
    }

    if (
      topic.includes('subscription') ||
      topic.includes('preapproval') ||
      topic === 'subscription_preapproval'
    ) {
      return jsonResponse(await processPreapproval(admin, accessToken, resourceId))
    }

    return jsonResponse({ ok: true, ignored: true, topic })
  } catch (error) {
    console.error('mercadopago-webhook error', error)
    return jsonResponse({ ok: false, message: 'Erro interno no webhook.' }, 500)
  }
})
