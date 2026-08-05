import { sendResendEmail } from './resend.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://www.appteuposto.com.br'
const LOGO_URL = `${APP_URL}/imagens/logoteuposto2.png`
const SUPPORT_EMAIL = 'suporte@appteuposto.com.br'

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
  if (digits.length !== 14) return (value ?? '').trim() || 'não informado'
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

/** Z-API espera DDI+DDD+número (ex.: 5511999999999). */
function toZApiPhone(phone: string) {
  let digits = onlyDigits(phone)
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function collectPhones(phone: unknown, payload: Record<string, unknown> | null | undefined) {
  const fromPayload = Array.isArray(payload?.phones) ? payload.phones : []
  const candidates = [...fromPayload, phone]
  const unique = new Set<string>()

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' && typeof candidate !== 'number') continue
    const normalized = toZApiPhone(String(candidate))
    if (normalized.length >= 12 && normalized.length <= 15) {
      unique.add(normalized)
    }
  }

  return [...unique]
}

function pickVariantIndex(seed: string, count = 10) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % count
}

function accountLockedWhatsAppMessage(
  postoNome: string,
  cnpj: string,
  seed: string,
) {
  const cnpjFmt = formatCnpj(cnpj)
  const header = [`🏪 *Posto:* ${postoNome}`, `🧾 *CNPJ:* ${cnpjFmt}`].join('\n')
  const variants = [
    [
      '🔒 *Acesso bloqueado — Teu Posto*',
      '',
      header,
      '',
      'Seu acesso ao *Teu Posto* foi temporariamente bloqueado por várias tentativas de login com senha incorreta.',
      '',
      'Para recuperar: acesse o site e use _“Esqueci minha senha”_.',
      '',
      '⚠️ Se não reconhece essas tentativas, altere a senha por segurança.',
    ].join('\n'),
    [
      '🛑 *Conta temporariamente bloqueada*',
      '',
      header,
      '',
      'Detectamos muitas tentativas de senha incorreta no *Teu Posto*.',
      '',
      'Redefina a senha pelo site (_Esqueci minha senha_) para liberar o acesso.',
      '',
      'Se não foi você, troque a senha imediatamente.',
    ].join('\n'),
    [
      '🔐 *Segurança Teu Posto*',
      '',
      header,
      '',
      'O acesso desta conta foi bloqueado por segurança (falhas de login).',
      '',
      'Recupere entrando no site e escolhendo _“Esqueci minha senha”_.',
      '',
      'Não reconhece? Proteja a conta alterando a senha.',
    ].join('\n'),
    [
      '❗ *Login bloqueado*',
      '',
      header,
      '',
      'Várias senhas incorretas levaram ao bloqueio temporário no *Teu Posto*.',
      '',
      'Desbloqueie redefinindo a senha no site do Teu Posto.',
      '',
      '⚠️ Em caso de dúvida, fale com o suporte.',
    ].join('\n'),
    [
      '🚨 *Alerta de segurança*',
      '',
      header,
      '',
      'Sua conta no *Teu Posto* está bloqueada temporariamente.',
      '',
      'Use _“Esqueci minha senha”_ no site para redefinir e voltar a acessar.',
      '',
      'Se não foi você, altere a senha assim que possível.',
    ].join('\n'),
    [
      '🔒 *Acesso suspenso temporariamente*',
      '',
      header,
      '',
      'Por segurança, o login foi bloqueado após tentativas inválidas.',
      '',
      'Acesse o site do Teu Posto → _Esqueci minha senha_ → redefina.',
      '',
      'Depois disso, o acesso volta ao normal.',
    ].join('\n'),
    [
      '📢 *Aviso importante — Teu Posto*',
      '',
      header,
      '',
      'Conta bloqueada por tentativas de login com senha errada.',
      '',
      'Para liberar: redefina a senha no site (_Esqueci minha senha_).',
      '',
      'Não reconhece a atividade? Troque a senha e avise o suporte.',
    ].join('\n'),
    [
      '🛡️ *Proteção de conta*',
      '',
      header,
      '',
      'O *Teu Posto* bloqueou temporariamente o acesso desta conta.',
      '',
      'Recupere com a opção _“Esqueci minha senha”_ no site.',
      '',
      'Após redefinir, você entra normalmente no app.',
    ].join('\n'),
    [
      '⚠️ *Bloqueio por tentativas de senha*',
      '',
      header,
      '',
      'Identificamos várias falhas de login e bloqueamos o acesso.',
      '',
      'Redefina a senha no site do Teu Posto para desbloquear.',
      '',
      'Se não foi você, priorize a troca de senha.',
    ].join('\n'),
    [
      '🔑 *Recupere seu acesso — Teu Posto*',
      '',
      header,
      '',
      'Sua conta foi bloqueada temporariamente por segurança.',
      '',
      'No site, use _“Esqueci minha senha”_, defina uma nova senha e acesse o app.',
      '',
      'Dúvidas? Fale com o suporte pelo e-mail suporte@appteuposto.com.br.',
    ].join('\n'),
  ]
  return variants[pickVariantIndex(seed, variants.length)]
}

function buildSecurityAlertEmailHtml(postoNome: string, cnpj: string) {
  const cnpjFmt = formatCnpj(cnpj)
  const postoLine =
    postoNome || cnpj
      ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">
          Conta: <strong style="color:#0c3b7a;">${postoNome || 'Posto'}</strong>
          ${cnpj ? ` · CNPJ <strong style="color:#0c3b7a;">${cnpjFmt}</strong>` : ''}
        </p>`
      : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Acesso bloqueado — Teu Posto</title>
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
                    <img src="${LOGO_URL}" alt="Teu Posto" width="168" style="display:block;max-width:168px;width:100%;height:auto;border:0;" />
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
                🔒 Acesso bloqueado
              </h1>
              ${postoLine}
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">
                Olá!
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">
                Seu acesso ao aplicativo <strong style="color:#0c3b7a;">Teu Posto</strong> foi temporariamente bloqueado
                devido a várias tentativas de login com senha incorreta.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">
                Para recuperar o acesso, acesse o site do Teu Posto e utilize a opção
                <em>“Esqueci minha senha”</em> para redefinir sua senha.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
                Após a redefinição, você poderá acessar o aplicativo normalmente.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 24px;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#0c3b7a;">
                    <a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Ir para o Teu Posto
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 16px;border-radius:12px;background-color:#fff7ed;border:1px solid #fed7aa;">
                    <p style="margin:0;font-size:13px;line-height:1.55;color:#9a3412;">
                      <strong style="color:#9a3412;">⚠️ Não reconhece essas tentativas?</strong><br />
                      Recomendamos alterar sua senha por segurança. Se precisar de ajuda, fale com o suporte pelo app
                      ou pelo e-mail
                      <a href="mailto:${SUPPORT_EMAIL}" style="color:#0c3b7a;text-decoration:none;">${SUPPORT_EMAIL}</a>.
                    </p>
                  </td>
                </tr>
              </table>
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
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendEmail(to: string, subject: string, html: string) {
  return sendResendEmail({
    to,
    subject,
    html,
    from:
      Deno.env.get('SECURITY_EMAIL_FROM') ??
      'Teu Posto Segurança <noreply@appteuposto.com.br>',
  })
}

async function sendWhatsApp(phone: string, message: string) {
  const webhookUrl = Deno.env.get('WHATSAPP_WEBHOOK_URL')
  const apiKey = Deno.env.get('WHATSAPP_API_KEY')

  if (!webhookUrl) {
    console.warn('WHATSAPP_WEBHOOK_URL not configured, skipping WhatsApp alert')
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
      phone,
      message,
    }),
  })

  if (!response.ok) {
    console.error('Failed to send WhatsApp alert', phone, await response.text())
    return false
  }

  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const authHeader = req.headers.get('Authorization') ?? ''
    // Só a própria infra (secure-auth com service_role) pode disparar este alerta.
    if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
      return jsonResponse({ ok: false, message: 'Unauthorized' }, 401)
    }

    const body = await req.json()
    const { type, email, phone, payload, alert_id: alertId } = body

    if (type !== 'account_locked') {
      return jsonResponse({ ok: false, message: 'Tipo de alerta inválido.' }, 400)
    }

    const payloadObj =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const postoNome =
      typeof payloadObj.nome === 'string' && payloadObj.nome.trim()
        ? payloadObj.nome.trim()
        : 'Seu posto'
    const cnpj = typeof payloadObj.cnpj === 'string' ? payloadObj.cnpj : ''

    const phones = collectPhones(phone, payloadObj)
    const seed = `${alertId ?? ''}:${postoNome}:${cnpj}:${phones.join(',')}`
    // Conta bloqueada: envio imediato (sem delay entre mensagens)
    const message = accountLockedWhatsAppMessage(postoNome, cnpj, seed)
    const emailHtml = buildSecurityAlertEmailHtml(postoNome, cnpj)

    const [emailSent, ...whatsappResults] = await Promise.all([
      email ? sendEmail(email, 'Acesso bloqueado — Teu Posto', emailHtml) : Promise.resolve(false),
      ...phones.map((p) => sendWhatsApp(p, message)),
    ])

    const whatsappSent = whatsappResults.some(Boolean)

    return jsonResponse({
      ok: true,
      alert_id: alertId,
      email_sent: emailSent,
      whatsapp_sent: whatsappSent,
      whatsapp_targets: phones.length,
      whatsapp_delivered: whatsappResults.filter(Boolean).length,
      posto: postoNome,
      cnpj: formatCnpj(cnpj),
    })
  } catch (error) {
    console.error('send-security-alert error', error)
    return jsonResponse({ ok: false, message: 'Erro ao enviar alerta.' }, 500)
  }
})
