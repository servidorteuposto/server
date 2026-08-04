import { sendResendEmail } from './resend.ts'

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

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
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
    const body = await req.json()
    const { type, email, phone, payload, alert_id: alertId } = body

    if (type !== 'account_locked') {
      return jsonResponse({ ok: false, message: 'Tipo de alerta inválido.' }, 400)
    }

    const nome = payload?.nome ?? 'usuário'
    const phones = collectPhones(phone, payload)
    const message =
      `Olá, ${nome}! Detectamos 5 tentativas incorretas de login na sua conta do teu posto. ` +
      `Por segurança, o acesso foi bloqueado. Para liberar, recupere sua senha em "Esqueci minha senha".`

    const emailHtml = `
      <p>Olá, <strong>${nome}</strong>,</p>
      <p>Detectamos <strong>5 tentativas incorretas de login</strong> na sua conta do teu posto.</p>
      <p>Por segurança, o acesso foi bloqueado. Para liberar, utilize a opção <strong>Esqueci minha senha</strong> no site.</p>
      <p>Se não foi você, entre em contato com o suporte imediatamente.</p>
    `

    const [emailSent, ...whatsappResults] = await Promise.all([
      email ? sendEmail(email, 'Alerta de segurança — teu posto', emailHtml) : Promise.resolve(false),
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
    })
  } catch (error) {
    console.error('send-security-alert error', error)
    return jsonResponse({ ok: false, message: 'Erro ao enviar alerta.' }, 500)
  }
})
