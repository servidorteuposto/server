import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type LoginResult =
  | {
      ok: true
      session: { access_token: string; refresh_token: string }
    }
  | {
      ok: false
      code:
        | 'locked'
        | 'invalid_credentials'
        | 'pending_payment'
        | 'rate_limited'
        | 'not_found'
        | 'subscription_inactive'
      message: string
      posto?: {
        nome: string
        cnpj: string
        telefone: string
        email: string
      }
      attempts_left?: number
    }

type RegisterResult =
  | { ok: true; needs_payment: true }
  | { ok: false; code: string; message: string }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getClientIp(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

async function hashValue(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function processPendingAlerts(admin: ReturnType<typeof createClient>, supabaseUrl: string) {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const { data: alerts } = await admin.rpc('security_get_pending_alerts', { p_limit: 5 })

  if (!alerts?.length) return

  for (const alert of alerts) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-security-alert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alert_id: alert.id,
          type: alert.alert_type,
          email: alert.email,
          phone: alert.phone,
          payload: alert.payload,
        }),
      })

      await admin.rpc('security_mark_alert_processed', { p_alert_id: alert.id })
    } catch (error) {
      console.error('Failed to process security alert', alert.id, error)
    }
  }
}

const ADMIN_EMAIL = 'servidorteuposto@gmail.com'

function isAdminEmail(email: string | null | undefined) {
  return email?.toLowerCase() === ADMIN_EMAIL
}

function isValidCnpj(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false

  const numbers = digits.split('').map(Number)
  const calc = (slice: number[], weights: number[]) => {
    const sum = slice.reduce((total, digit, index) => total + digit * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const first = calc(numbers.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = calc(numbers.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return numbers[12] === first && numbers[13] === second
}

async function handleLogin(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  identifier: string,
  password: string,
  ipHash: string,
): Promise<LoginResult> {
  const accessResult = await admin.rpc('get_account_access_by_identifier', {
    p_identifier: identifier,
  })
  const access = accessResult.data as {
    found?: boolean
    subscription_status?: string
    nome?: string
    cnpj?: string
    telefone?: string
    email?: string
  } | null

  const adminAccount = isAdminEmail(access?.email)

  if (adminAccount) {
    await admin.rpc('security_clear_login_lockout', { p_identifier: identifier })
  }

  const loginState = await admin.rpc('security_get_login_state', { p_identifier: identifier })
  const state = loginState.data as { locked?: boolean; attempts_left?: number } | null

  if (!adminAccount && state?.locked) {
    return {
      ok: false,
      code: 'locked',
      message:
        'Conta bloqueada por tentativas excessivas. Recupere sua senha para liberar o acesso.',
    }
  }

  if (!access?.found) {
    await admin.rpc('security_record_login_failure', {
      p_identifier: identifier,
      p_ip_hash: ipHash,
    })
    return {
      ok: false,
      code: 'not_found',
      message: 'E-mail ou senha incorretos.',
    }
  }

  if (!adminAccount && access.subscription_status === 'pending_payment') {
    return {
      ok: false,
      code: 'pending_payment',
      message: 'Finalize o pagamento para ativar sua conta antes de fazer login.',
      posto: {
        nome: access.nome ?? '',
        cnpj: access.cnpj ?? '',
        telefone: access.telefone ?? '',
        email: access.email ?? '',
      },
    }
  }

  const email = access.email
  if (!email) {
    return {
      ok: false,
      code: 'not_found',
      message: 'E-mail ou senha incorretos.',
    }
  }

  const authResult = await admin.auth.signInWithPassword({ email, password })

  if (authResult.error || !authResult.data.session) {
    if (!adminAccount) {
      const failure = await admin.rpc('security_record_login_failure', {
        p_identifier: identifier,
        p_ip_hash: ipHash,
      })

      const failureData = failure.data as { locked?: boolean; attempts_left?: number } | null

      if (failureData?.locked) {
        await processPendingAlerts(admin, supabaseUrl)
        return {
          ok: false,
          code: 'locked',
          message:
            'Conta bloqueada por tentativas excessivas. Enviamos um alerta para seu e-mail e WhatsApp. Recupere sua senha para liberar o acesso.',
        }
      }

      return {
        ok: false,
        code: 'invalid_credentials',
        message: `E-mail ou senha incorretos. Tentativas restantes: ${failureData?.attempts_left ?? 0}.`,
        attempts_left: failureData?.attempts_left,
      }
    }

    return {
      ok: false,
      code: 'invalid_credentials',
      message: 'E-mail ou senha incorretos.',
    }
  }

  await admin.rpc('security_record_login_success', { p_identifier: identifier })

  return {
    ok: true,
    session: {
      access_token: authResult.data.session.access_token,
      refresh_token: authResult.data.session.refresh_token,
    },
  }
}

async function handleRegister(
  admin: ReturnType<typeof createClient>,
  payload: {
    email: string
    password: string
    postoName: string
    cnpj: string
    phone: string
    website?: string
  },
  ipHash: string,
): Promise<RegisterResult> {
  if (payload.website) {
    return { ok: false, code: 'blocked', message: 'Não foi possível concluir o cadastro.' }
  }

  if (!isValidCnpj(payload.cnpj)) {
    return { ok: false, code: 'invalid_cnpj', message: 'Informe um CNPJ válido.' }
  }

  const rateLimit = await admin.rpc('security_check_registration_rate_limit', {
    p_ip_hash: ipHash,
    p_cnpj: payload.cnpj,
  })

  const rateData = rateLimit.data as { allowed?: boolean; message?: string; reason?: string } | null
  if (!rateData?.allowed) {
    return {
      ok: false,
      code: rateData?.reason ?? 'rate_limited',
      message: rateData?.message ?? 'Muitas tentativas de cadastro. Tente novamente mais tarde.',
    }
  }

  const availability = await admin.rpc('check_registration_availability', {
    p_cnpj: payload.cnpj,
    p_email: payload.email,
    p_telefone: payload.phone,
  })

  const availabilityData = availability.data as {
    available?: boolean
    field?: string | null
    subscription_status?: string
  } | null

  if (!availabilityData?.available) {
    if (availabilityData?.subscription_status === 'pending_payment') {
      return {
        ok: false,
        code: 'pending_payment',
        message: 'Cadastro já iniciado. Finalize o pagamento para ativar sua conta.',
      }
    }

    return {
      ok: false,
      code: 'duplicate',
      message: 'Já existe uma conta cadastrada com estes dados.',
    }
  }

  await admin.rpc('security_record_registration_attempt', {
    p_ip_hash: ipHash,
    p_cnpj: payload.cnpj,
  })

  const signUpResult = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      nome_posto: payload.postoName,
      cnpj: payload.cnpj,
      telefone: payload.phone,
    },
  })

  if (signUpResult.error || !signUpResult.data.user) {
    const message = signUpResult.error?.message?.toLowerCase() ?? ''
    if (message.includes('already') || message.includes('registered')) {
      return {
        ok: false,
        code: 'pending_payment',
        message: 'Cadastro já iniciado. Finalize o pagamento para ativar sua conta.',
      }
    }

    return {
      ok: false,
      code: 'signup_failed',
      message: 'Não foi possível concluir o cadastro. Tente novamente.',
    }
  }

  return { ok: true, needs_payment: true }
}

async function handleActivatePayment(admin: ReturnType<typeof createClient>, cnpj: string, ipHash: string) {
  const rateLimit = await admin.rpc('security_check_registration_rate_limit', {
    p_ip_hash: ipHash,
    p_cnpj: cnpj,
  })

  const rateData = rateLimit.data as { allowed?: boolean; message?: string } | null
  if (!rateData?.allowed) {
    return {
      ok: false,
      message: rateData?.message ?? 'Muitas tentativas. Aguarde e tente novamente.',
    }
  }

  const { error } = await admin.rpc('activate_subscription', { p_cnpj: cnpj })
  if (error) {
    return { ok: false, message: 'Não foi possível ativar a assinatura.' }
  }

  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const ipHash = await hashValue(getClientIp(req))
    const body = await req.json()
    const action = body.action as string

    if (action === 'login') {
      const result = await handleLogin(admin, supabaseUrl, body.identifier, body.password, ipHash)
      return jsonResponse(result, result.ok ? 200 : 400)
    }

    if (action === 'register') {
      const result = await handleRegister(admin, body, ipHash)
      return jsonResponse(result, result.ok ? 200 : 400)
    }

    if (action === 'activate_payment') {
      const result = await handleActivatePayment(admin, body.cnpj, ipHash)
      return jsonResponse(result, result.ok ? 200 : 400)
    }

    if (action === 'clear_lockout') {
      const { error } = await admin.rpc('security_clear_login_lockout', {
        p_identifier: body.identifier,
      })
      return jsonResponse({ ok: !error }, error ? 400 : 200)
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('secure-auth error', error)
    return jsonResponse({ ok: false, message: 'Erro interno de autenticação.' }, 500)
  }
})
