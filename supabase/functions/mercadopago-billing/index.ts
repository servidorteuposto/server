import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function mpHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function cancelMercadoPagoPreapproval(accessToken: string, preapprovalId: string) {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: 'PUT',
    headers: mpHeaders(accessToken),
    body: JSON.stringify({ status: 'cancelled' }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('MP preapproval cancel failed', preapprovalId, data)
    return { ok: false as const, data }
  }
  return { ok: true as const, data }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Método não permitido.' }, 405)
  }

  try {
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ ok: false, message: 'Configuração do servidor incompleta.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const jwt = authHeader.slice('Bearer '.length).trim()
    if (!jwt || jwt === anonKey) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(jwt)

    if (userError || !user) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const { data: posto, error: postoError } = await admin
      .from('postos')
      .select(
        'id, nome, email, telefone, cnpj, subscription_status, subscription_ends_at, billing_mode, mp_preapproval_id, cancel_at_period_end, refund_requested_at',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (postoError || !posto) {
      return jsonResponse({ ok: false, message: 'Posto não encontrado.' }, 404)
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const action = String(body?.action ?? '')

    if (action === 'cancel_plan') {
      if (posto.subscription_status !== 'active') {
        return jsonResponse({ ok: false, message: 'Não há plano ativo para cancelar.' }, 400)
      }
      if (posto.cancel_at_period_end) {
        return jsonResponse({
          ok: true,
          already_cancelled: true,
          message: 'A renovação automática já está cancelada. O acesso segue até o fim do período.',
          subscription_ends_at: posto.subscription_ends_at,
        })
      }

      const isRecurring =
        posto.billing_mode === 'recurring' || Boolean(posto.mp_preapproval_id)

      if (!isRecurring) {
        return jsonResponse({
          ok: false,
          message:
            'Seu plano é pagamento único — não há cobrança automática. O acesso segue até a data de vencimento.',
        }, 400)
      }

      if (posto.mp_preapproval_id && mpAccessToken) {
        const cancelled = await cancelMercadoPagoPreapproval(
          mpAccessToken,
          String(posto.mp_preapproval_id),
        )
        if (!cancelled.ok) {
          return jsonResponse(
            {
              ok: false,
              message:
                'Não foi possível cancelar a assinatura no Mercado Pago. Tente novamente ou fale com o suporte.',
            },
            502,
          )
        }
      }

      const nowIso = new Date().toISOString()
      const { error: updateError } = await admin
        .from('postos')
        .update({
          cancel_at_period_end: true,
          subscription_cancelled_at: nowIso,
          billing_mode: 'one_time',
          mp_preapproval_id: null,
          updated_at: nowIso,
        })
        .eq('id', posto.id)

      if (updateError) {
        console.error('cancel_plan update failed', updateError)
        return jsonResponse({ ok: false, message: 'Falha ao registrar o cancelamento.' }, 500)
      }

      return jsonResponse({
        ok: true,
        message:
          'Renovação automática cancelada. Você continua com acesso até o fim do período pago.',
        subscription_ends_at: posto.subscription_ends_at,
        cancel_at_period_end: true,
      })
    }

    if (action === 'request_refund') {
      if (posto.subscription_status !== 'active') {
        return jsonResponse({ ok: false, message: 'Não há assinatura ativa para reembolso.' }, 400)
      }
      if (posto.refund_requested_at) {
        return jsonResponse({
          ok: true,
          already_requested: true,
          message: 'Você já solicitou reembolso. Nossa equipe vai analisar o pedido.',
          refund_requested_at: posto.refund_requested_at,
        })
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: lastPayment } = await admin
        .from('mp_payments')
        .select('id, mp_payment_id, amount_cents, updated_at, method, status')
        .eq('posto_id', posto.id)
        .eq('status', 'approved')
        .not('mp_payment_id', 'like', 'preapproval_%')
        .gte('updated_at', sevenDaysAgo)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!lastPayment) {
        return jsonResponse({
          ok: false,
          message:
            'O reembolso só pode ser solicitado nos 7 dias após o pagamento aprovado. Fora desse prazo, use Cancelar plano (se for recorrente) ou fale com o suporte.',
        }, 400)
      }

      const reason = String(body?.reason ?? '').trim()
      const nowIso = new Date().toISOString()
      const ticketMessage = [
        '[REEMBOLSO] Solicitação automática pelo app (CDC — 7 dias).',
        `Posto: ${posto.nome}`,
        `CNPJ: ${posto.cnpj}`,
        `Pagamento MP: ${lastPayment.mp_payment_id}`,
        `Método: ${lastPayment.method}`,
        `Valor (centavos): ${lastPayment.amount_cents}`,
        `Pago em: ${lastPayment.updated_at}`,
        reason ? `Motivo do cliente: ${reason}` : 'Motivo: não informado.',
      ].join('\n')

      const ticketId = crypto.randomUUID()
      const { error: ticketError } = await admin.from('support_tickets').insert({
        id: ticketId,
        audience: 'com_cadastro',
        category: 'reclamacao',
        name: String(posto.nome ?? 'Posto').slice(0, 120),
        email: String(posto.email ?? user.email ?? 'suporte@appteuposto.com.br'),
        phone: String(posto.telefone ?? '0000000000').slice(0, 40),
        message: ticketMessage.slice(0, 5000),
        user_id: user.id,
        posto_id: posto.id,
        attachment_paths: [],
      })

      if (ticketError) {
        console.error('refund ticket insert failed', ticketError)
        return jsonResponse({ ok: false, message: 'Não foi possível registrar o pedido de reembolso.' }, 500)
      }

      // Cancela recorrência se existir, mas mantém o período já pago até análise do reembolso.
      if (posto.mp_preapproval_id && mpAccessToken) {
        await cancelMercadoPagoPreapproval(mpAccessToken, String(posto.mp_preapproval_id))
      }

      const { error: updateError } = await admin
        .from('postos')
        .update({
          refund_requested_at: nowIso,
          cancel_at_period_end: true,
          subscription_cancelled_at: posto.subscription_cancelled_at ?? nowIso,
          billing_mode: 'one_time',
          mp_preapproval_id: null,
          updated_at: nowIso,
        })
        .eq('id', posto.id)

      if (updateError) {
        console.error('refund_requested update failed', updateError)
        return jsonResponse({
          ok: true,
          ticket_id: ticketId,
          message:
            'Pedido de reembolso registrado, mas houve falha ao marcar no plano. Contate o suporte com o ID do chamado.',
        })
      }

      return jsonResponse({
        ok: true,
        ticket_id: ticketId,
        message:
          'Pedido de reembolso enviado. Nossa equipe analisa em até alguns dias úteis. A renovação automática foi interrompida.',
        refund_requested_at: nowIso,
        cancel_at_period_end: true,
      })
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('mercadopago-billing error', error)
    return jsonResponse({ ok: false, message: 'Erro interno.' }, 500)
  }
})
