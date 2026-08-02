import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://www.appteuposto.com.br'
const PRICE = 99
const PRICE_CENTS = 9900
const TITLE = 'Assinatura Teu Posto — 30 dias'
const MAX_CHECKOUTS_PER_WINDOW = 8
const CHECKOUT_WINDOW_MS = 30 * 60 * 1000

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function emailsMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Só libera assinatura com valor esperado (defesa contra payload adulterado). */
function isValidSubscriptionAmount(payment: Record<string, unknown>) {
  const amount = Number(payment.transaction_amount)
  if (!Number.isFinite(amount)) return false
  // tolerância de 0,01 por arredondamento
  return Math.abs(amount - PRICE) < 0.02
}

function mpHeaders(accessToken: string, idempotencyKey?: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
  }
}

async function findPosto(
  admin: ReturnType<typeof createClient>,
  cnpj: string,
) {
  const digits = onlyDigits(cnpj)
  const select =
    'id, nome, cnpj, email, telefone, subscription_status, cep, logradouro, numero, bairro, cidade, uf'
  const { data: byExact } = await admin.from('postos').select(select).eq('cnpj', cnpj).maybeSingle()
  if (byExact) return byExact

  // CNPJ pode estar formatado no banco
  const { data: rows } = await admin
    .from('postos')
    .select(select)
    .ilike('cnpj', `%${digits.slice(0, 8)}%`)
    .limit(20)

  return (rows ?? []).find((row) => onlyDigits(row.cnpj ?? '') === digits) ?? null
}

function resolvePayerAddress(body: Record<string, unknown>, posto: {
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
}) {
  const fromBody = (body?.address ?? {}) as Record<string, unknown>
  const zip = onlyDigits(String(fromBody.zip_code ?? fromBody.cep ?? posto.cep ?? ''))
  const street = String(fromBody.street_name ?? fromBody.logradouro ?? posto.logradouro ?? '').trim()
  const number = String(fromBody.street_number ?? fromBody.numero ?? posto.numero ?? '').trim()
  const neighborhood = String(fromBody.neighborhood ?? fromBody.bairro ?? posto.bairro ?? '').trim()
  const city = String(fromBody.city ?? fromBody.cidade ?? posto.cidade ?? '').trim()
  const federalUnit = String(fromBody.federal_unit ?? fromBody.uf ?? posto.uf ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 2)

  if (
    zip.length !== 8 ||
    !street ||
    !number ||
    !neighborhood ||
    !city ||
    federalUnit.length !== 2
  ) {
    return null
  }

  return {
    zip_code: zip,
    street_name: street.slice(0, 256),
    street_number: number.slice(0, 16),
    neighborhood: neighborhood.slice(0, 256),
    city: city.slice(0, 256),
    federal_unit: federalUnit,
  }
}

function mpErrorMessage(data: Record<string, unknown>, fallback: string) {
  const causes = Array.isArray(data?.cause) ? data.cause : []
  const fromCause = causes
    .map((item) => String((item as { description?: string })?.description ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const message = String(data?.message ?? '').trim()
  if (message && fromCause) return `${message}: ${fromCause}`
  return message || fromCause || fallback
}

async function upsertPendingPayment(
  admin: ReturnType<typeof createClient>,
  input: {
    postoId: string
    cnpj: string
    mpPaymentId: string
    method: string
    status: string
    externalReference: string
    raw: unknown
  },
) {
  await admin.from('mp_payments').upsert(
    {
      posto_id: input.postoId,
      cnpj: onlyDigits(input.cnpj),
      mp_payment_id: input.mpPaymentId,
      method: input.method,
      status: input.status,
      external_reference: input.externalReference,
      amount_cents: PRICE_CENTS,
      raw: input.raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'mp_payment_id' },
  )
}

async function processPaymentActivation(
  admin: ReturnType<typeof createClient>,
  payment: Record<string, unknown>,
) {
  if (String(payment.status) !== 'approved') return
  if (!isValidSubscriptionAmount(payment)) {
    console.error('Rejected activation: unexpected amount', payment.id, payment.transaction_amount)
    return
  }

  const postoId =
    String((payment.metadata as Record<string, unknown> | undefined)?.posto_id ?? '') ||
    (() => {
      const ref = String(payment.external_reference ?? '')
      const match = ref.match(/^posto:([0-9a-f-]{36})$/i)
      return match?.[1] ?? ''
    })()

  if (!postoId) return

  const metaMethod = String((payment.metadata as Record<string, unknown> | undefined)?.method ?? '')
  const billingMode = metaMethod === 'card_recurring' ? 'recurring' : 'one_time'

  await admin.from('mp_payments').upsert(
    {
      posto_id: postoId,
      cnpj: onlyDigits(
        String(
          (payment.payer as { identification?: { number?: string } } | undefined)?.identification
            ?.number ?? '',
        ),
      ) || 'unknown',
      mp_payment_id: String(payment.id),
      method: metaMethod || 'pix',
      status: 'approved',
      external_reference: String(payment.external_reference ?? `posto:${postoId}`),
      amount_cents: Math.round(Number(payment.transaction_amount ?? 99) * 100),
      raw: payment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'mp_payment_id' },
  )

  await admin.rpc('activate_or_extend_subscription', {
    p_posto_id: postoId,
    p_billing_mode: billingMode,
    p_mp_payment_id: String(payment.id),
    p_mp_preapproval_id: null,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Método não permitido.' }, 405)
  }

  try {
    const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!accessToken) {
      return jsonResponse({ ok: false, message: 'Mercado Pago não configurado (MP_ACCESS_TOKEN).' }, 500)
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: 'Configuração do servidor incompleta.' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json()
    const action = body?.action as string
    const cnpj = String(body?.cnpj ?? '')
    const email = String(body?.email ?? '').trim().toLowerCase()
    const payerName = String(body?.nome ?? body?.posto_name ?? 'Posto').trim()

    if (!onlyDigits(cnpj) || onlyDigits(cnpj).length !== 14) {
      return jsonResponse({ ok: false, message: 'CNPJ inválido.' }, 400)
    }
    if (!email || !email.includes('@')) {
      return jsonResponse({ ok: false, message: 'E-mail inválido.' }, 400)
    }

    const posto = await findPosto(admin, cnpj)
    if (!posto) {
      return jsonResponse({ ok: false, message: 'Conta não encontrada. Conclua o cadastro primeiro.' }, 404)
    }

    const postoEmail = String(posto.email ?? '').trim().toLowerCase()
    if (!postoEmail || !emailsMatch(postoEmail, email)) {
      return jsonResponse(
        {
          ok: false,
          message: 'E-mail não confere com o cadastro deste CNPJ.',
        },
        403,
      )
    }

    // Limita spam de cobranças (PIX/boleto/cartão) por posto
    if (
      action === 'create_pix' ||
      action === 'create_boleto' ||
      action === 'create_card_once' ||
      action === 'create_card_recurring'
    ) {
      const windowStart = new Date(Date.now() - CHECKOUT_WINDOW_MS).toISOString()
      const { count, error: countError } = await admin
        .from('mp_payments')
        .select('id', { count: 'exact', head: true })
        .eq('posto_id', posto.id)
        .gte('created_at', windowStart)

      if (countError) {
        console.error('checkout rate count failed', countError)
      } else if ((count ?? 0) >= MAX_CHECKOUTS_PER_WINDOW) {
        return jsonResponse(
          {
            ok: false,
            message:
              'Muitas tentativas de pagamento em pouco tempo. Aguarde alguns minutos e tente novamente.',
          },
          429,
        )
      }
    }

    const externalReference = `posto:${posto.id}`
    const notificationUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook?source_news=webhooks`

    if (action === 'create_pix' || action === 'create_boleto') {
      const method = action === 'create_pix' ? 'pix' : 'boleto'
      const paymentMethodId = method === 'pix' ? 'pix' : 'bolbradesco'
      const idempotencyKey = crypto.randomUUID()

      const payer: Record<string, unknown> = {
        email,
        first_name: payerName.slice(0, 60),
        identification: {
          type: 'CNPJ',
          number: onlyDigits(cnpj),
        },
      }

      if (method === 'boleto') {
        const address = resolvePayerAddress(body, posto)
        if (!address) {
          return jsonResponse(
            {
              ok: false,
              message:
                'Para gerar boleto, informe CEP, rua, número, bairro, cidade e UF do pagador.',
            },
            400,
          )
        }
        payer.address = address
      }

      const payload = {
        transaction_amount: PRICE,
        description: TITLE,
        payment_method_id: paymentMethodId,
        payer,
        external_reference: externalReference,
        notification_url: notificationUrl,
        metadata: {
          posto_id: posto.id,
          method,
        },
      }

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: mpHeaders(accessToken, idempotencyKey),
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok) {
        console.error('MP payment create failed', data)
        return jsonResponse(
          {
            ok: false,
            message: mpErrorMessage(
              data,
              'Não foi possível criar o pagamento.',
            ),
          },
          400,
        )
      }

      const paymentId = String(data.id)
      await upsertPendingPayment(admin, {
        postoId: posto.id,
        cnpj,
        mpPaymentId: paymentId,
        method,
        status: String(data.status ?? 'pending'),
        externalReference,
        raw: data,
      })

      if (method === 'pix') {
        const tx = data.point_of_interaction?.transaction_data ?? {}
        return jsonResponse({
          ok: true,
          method,
          payment_id: paymentId,
          status: data.status,
          qr_code: tx.qr_code ?? null,
          qr_code_base64: tx.qr_code_base64 ?? null,
          ticket_url: tx.ticket_url ?? null,
        })
      }

      return jsonResponse({
        ok: true,
        method,
        payment_id: paymentId,
        status: data.status,
        ticket_url: data.transaction_details?.external_resource_url ?? null,
        barcode: data.barcode?.content ?? data.transaction_details?.digitable_line ?? null,
        digitable_line:
          data.transaction_details?.digitable_line ?? data.barcode?.content ?? null,
      })
    }

    if (action === 'create_card_once') {
      const preferencePayload = {
        items: [
          {
            id: 'teuposto-30d',
            title: TITLE,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: PRICE,
          },
        ],
        payer: {
          email,
          name: payerName,
          identification: { type: 'CNPJ', number: onlyDigits(cnpj) },
        },
        external_reference: externalReference,
        metadata: { posto_id: posto.id, method: 'card_once' },
        notification_url: notificationUrl,
        back_urls: {
          success: `${APP_URL}/?payment=success&cnpj=${encodeURIComponent(cnpj)}`,
          failure: `${APP_URL}/?payment=failure&cnpj=${encodeURIComponent(cnpj)}`,
          pending: `${APP_URL}/?payment=pending&cnpj=${encodeURIComponent(cnpj)}`,
        },
        auto_return: 'approved',
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }],
          installments: 12,
        },
        statement_descriptor: 'TEU POSTO',
      }

      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: mpHeaders(accessToken),
        body: JSON.stringify(preferencePayload),
      })
      const data = await response.json()

      if (!response.ok) {
        console.error('MP preference create failed', data)
        return jsonResponse(
          { ok: false, message: data?.message ?? 'Não foi possível iniciar o pagamento no cartão.' },
          400,
        )
      }

      await upsertPendingPayment(admin, {
        postoId: posto.id,
        cnpj,
        mpPaymentId: `pref_${data.id}`,
        method: 'card_once',
        status: 'pending',
        externalReference,
        raw: data,
      })

      return jsonResponse({
        ok: true,
        method: 'card_once',
        preference_id: data.id,
        init_point: data.init_point ?? data.sandbox_init_point,
        sandbox_init_point: data.sandbox_init_point,
      })
    }

    if (action === 'create_card_recurring') {
      const startDate = new Date()
      const endDate = new Date()
      endDate.setFullYear(endDate.getFullYear() + 5)

      const preapprovalPayload = {
        reason: TITLE,
        external_reference: externalReference,
        payer_email: email,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PRICE,
          currency_id: 'BRL',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        },
        back_url: `${APP_URL}/?payment=success&cnpj=${encodeURIComponent(cnpj)}&recurring=1`,
        status: 'pending',
        notification_url: notificationUrl,
      }

      const response = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: mpHeaders(accessToken),
        body: JSON.stringify(preapprovalPayload),
      })
      const data = await response.json()

      if (!response.ok) {
        console.error('MP preapproval create failed', data)
        return jsonResponse(
          { ok: false, message: data?.message ?? 'Não foi possível iniciar a assinatura recorrente.' },
          400,
        )
      }

      await admin
        .from('postos')
        .update({
          mp_preapproval_id: String(data.id),
          billing_mode: 'recurring',
          updated_at: new Date().toISOString(),
        })
        .eq('id', posto.id)

      await upsertPendingPayment(admin, {
        postoId: posto.id,
        cnpj,
        mpPaymentId: `preapproval_${data.id}`,
        method: 'card_recurring',
        status: String(data.status ?? 'pending'),
        externalReference,
        raw: data,
      })

      return jsonResponse({
        ok: true,
        method: 'card_recurring',
        preapproval_id: data.id,
        init_point: data.init_point ?? data.sandbox_init_point,
        sandbox_init_point: data.sandbox_init_point,
      })
    }

    if (action === 'get_payment_status') {
      const paymentId = String(body?.payment_id ?? '')
      if (!paymentId) {
        return jsonResponse({ ok: false, message: 'Informe o pagamento.' }, 400)
      }

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: mpHeaders(accessToken),
      })
      const data = await response.json()
      if (!response.ok) {
        return jsonResponse({ ok: false, message: 'Pagamento não encontrado.' }, 404)
      }

      const approved = data.status === 'approved'
      if (approved) {
        await processPaymentActivation(admin, data)
      }

      const { data: fresh } = await admin
        .from('postos')
        .select('subscription_status')
        .eq('id', posto.id)
        .maybeSingle()

      return jsonResponse({
        ok: true,
        payment_id: String(data.id),
        status: data.status,
        approved,
        subscription_status: fresh?.subscription_status ?? posto.subscription_status,
      })
    }

    if (action === 'get_subscription_status') {
      const { data: fresh } = await admin
        .from('postos')
        .select('subscription_status, subscription_ends_at, billing_mode')
        .eq('id', posto.id)
        .maybeSingle()

      return jsonResponse({
        ok: true,
        subscription_status: fresh?.subscription_status ?? posto.subscription_status,
        subscription_ends_at: fresh?.subscription_ends_at ?? null,
        billing_mode: fresh?.billing_mode ?? null,
        activated: fresh?.subscription_status === 'active',
      })
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('mercadopago-checkout error', error)
    return jsonResponse({ ok: false, message: 'Erro interno no checkout.' }, 500)
  }
})
