import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { sendResendEmail, SUPPORT_EMAIL } from './resend.ts'

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

const APP_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://www.appteuposto.com.br'
const LOGO_URL = `${APP_URL}/imagens/logoteuposto2.png`

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildWelcomeEmailHtml(postoName: string) {
  const name = escapeHtml(postoName.trim() || 'posto')
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef2f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid rgba(61,143,212,0.18);">
        <tr>
          <td style="padding:28px 32px 24px;background:linear-gradient(135deg,#0c3b7a 0%,#1a5fad 55%,#3d8fd4 100%);text-align:center;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 14px;">
              <tr><td style="padding:12px 22px;background-color:#ffffff;border-radius:14px;">
                    <img src="${LOGO_URL}" alt="Teu Posto" width="200" style="display:block;max-width:200px;width:100%;height:auto;border:0;background:#ffffff;" />
                  </td></tr>
            </table>
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.88);">Gestão do seu posto</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:#0c3b7a;">Bem-vindo ao Teu Posto</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">Olá, <strong style="color:#0c3b7a;">${name}</strong>!</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">
              Sua conta foi criada com sucesso. Finalize o pagamento da assinatura para liberar o acesso completo ao sistema.
            </p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
              Com o Teu Posto você organiza documentos regulatórios, análises de combustíveis, metrologia, drenagens e muito mais — tudo em um só lugar.
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 24px;">
              <tr><td align="center" style="border-radius:10px;background-color:#0c3b7a;">
                <a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                  Acessar o Teu Posto
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.55;color:#6b7280;">
              Se precisar de ajuda, use o menu <strong>Suporte</strong> no app ou responda este e-mail /
              escreva para
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#3d8fd4;text-decoration:none;">${SUPPORT_EMAIL}</a>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;" />
            <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
              © Teu Posto · <a href="${APP_URL}" style="color:#3d8fd4;text-decoration:none;">appteuposto.com.br</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendWelcomeEmail(email: string, postoName: string) {
  return sendResendEmail({
    to: email,
    subject: 'Bem-vindo ao Teu Posto',
    html: buildWelcomeEmailHtml(postoName),
  })
}

function buildRecoveryEmailHtml(actionLink: string, email: string) {
  const safeLink = escapeHtml(actionLink)
  const safeEmail = escapeHtml(email)
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Recuperação de senha — Teu Posto</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef2f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid rgba(61,143,212,0.18);box-shadow:0 18px 40px rgba(12,59,122,0.10);">
          <tr>
            <td style="padding:28px 32px 24px;background:linear-gradient(135deg,#0c3b7a 0%,#1a5fad 55%,#3d8fd4 100%);text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 14px;">
                <tr>
                  <td style="padding:12px 22px;background-color:#ffffff;border-radius:14px;">
                    <img src="${LOGO_URL}" alt="Teu Posto" width="200" style="display:block;max-width:200px;width:100%;height:auto;border:0;" />
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.88);">
                Gestão do seu posto
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:#0c3b7a;">
                Recuperação de senha
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">
                Olá,
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
                Recebemos um pedido para redefinir a senha da sua conta no <strong style="color:#0c3b7a;">Teu Posto</strong>.
                Clique no botão abaixo para criar uma nova senha. O link é válido por tempo limitado.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 24px;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#0c3b7a;">
                    <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#6b7280;">
                Se o botão não funcionar, copie e cole este endereço no navegador:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;font-size:12px;line-height:1.5;">
                <a href="${safeLink}" style="color:#2b8fd9;text-decoration:underline;">${safeLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;" />
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                Este e-mail foi enviado para <strong style="color:#6b7280;">${safeEmail}</strong>
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                © Teu Posto · <a href="${APP_URL}" style="color:#3d8fd4;text-decoration:none;">appteuposto.com.br</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function handlePasswordRecovery(
  admin: ReturnType<typeof createClient>,
  identifier: string,
  redirectTo?: string,
) {
  const trimmed = identifier.trim()
  if (!trimmed) {
    return { ok: true, sent: false as const }
  }

  let email: string | null = null
  if (trimmed.includes('@')) {
    email = trimmed.toLowerCase()
  } else {
    const { data, error } = await admin.rpc('get_email_by_cnpj', { p_cnpj: trimmed })
    if (error) {
      console.error('get_email_by_cnpj failed', error)
      return { ok: false, message: 'Não foi possível processar a recuperação.' }
    }
    email = typeof data === 'string' ? data : null
  }

  if (!email) {
    return { ok: true, sent: false as const }
  }

  const redirect = redirectTo?.trim() || `${APP_URL}/?type=recovery`
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: redirect },
  })

  if (error) {
    console.error('generateLink recovery failed', error)
    return { ok: false, message: 'Não foi possível gerar o link de recuperação.' }
  }

  const hashedToken = data?.properties?.hashed_token
  // Link no nosso domínio (não supabase.co) — o app troca o token via verifyOtp
  const actionLink = hashedToken
    ? `${APP_URL}/?type=recovery&token_hash=${encodeURIComponent(hashedToken)}`
    : data?.properties?.action_link

  if (!actionLink) {
    return { ok: false, message: 'Não foi possível gerar o link de recuperação.' }
  }

  console.log('password_recovery_email_queued', { email, via: 'resend', host: APP_URL })

  const sent = await sendResendEmail({
    to: email,
    subject: 'Recuperação de senha — Teu Posto',
    html: buildRecoveryEmailHtml(actionLink, email),
    from: Deno.env.get('AUTH_EMAIL_FROM') ?? `Teu Posto <noreply@appteuposto.com.br>`,
  })

  if (!sent) {
    return { ok: false, message: 'Não foi possível enviar o e-mail de recuperação.' }
  }

  return { ok: true, sent: true as const }
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
const ADMIN_CNPJ_DIGITS = '99999999000199'

function isAdminEmail(email: string | null | undefined) {
  return email?.toLowerCase() === ADMIN_EMAIL
}

function isAdminIdentifier(identifier: string) {
  const trimmed = identifier.trim().toLowerCase()
  if (isAdminEmail(trimmed)) return true
  return trimmed.replace(/\D/g, '') === ADMIN_CNPJ_DIGITS
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

  const adminAccount = isAdminIdentifier(identifier) || isAdminEmail(access?.email)

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

  if (!access?.found && !adminAccount) {
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

  if (!adminAccount && access?.subscription_status === 'pending_payment') {
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

  const email = access?.email ?? (isAdminEmail(identifier) ? identifier.trim().toLowerCase() : null)
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

  // Conta já nasce confirmada (sem e-mail de verificação). Envia só boas-vindas.
  try {
    await sendWelcomeEmail(payload.email, payload.postoName)
  } catch (error) {
    console.error('Failed to send welcome email', error)
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
      return jsonResponse(result, 200)
    }

    if (action === 'register') {
      const result = await handleRegister(admin, body, ipHash)
      return jsonResponse(result, 200)
    }

    if (action === 'activate_payment') {
      const result = await handleActivatePayment(admin, body.cnpj, ipHash)
      return jsonResponse(result, 200)
    }

    if (action === 'clear_lockout') {
      const { error } = await admin.rpc('security_clear_login_lockout', {
        p_identifier: body.identifier,
      })
      return jsonResponse({ ok: !error }, error ? 400 : 200)
    }

    if (action === 'request_password_reset') {
      const result = await handlePasswordRecovery(admin, body.identifier ?? '', body.redirectTo)
      return jsonResponse(result, result.ok ? 200 : 400)
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('secure-auth error', error)
    return jsonResponse({ ok: false, message: 'Erro interno de autenticação.' }, 500)
  }
})
