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

async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('SECURITY_EMAIL_FROM') ?? 'seguranca@teuposto.com.br'

  if (!resendKey) {
    console.warn('RESEND_API_KEY not configured, skipping email alert')
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
    console.error('Failed to send security email', await response.text())
    return false
  }

  return true
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
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      phone: onlyDigits(phone),
      message,
    }),
  })

  if (!response.ok) {
    console.error('Failed to send WhatsApp alert', await response.text())
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
    const message =
      `Olá, ${nome}! Detectamos 5 tentativas incorretas de login na sua conta do teu posto. ` +
      `Por segurança, o acesso foi bloqueado. Para liberar, recupere sua senha em "Esqueci minha senha".`

    const emailHtml = `
      <p>Olá, <strong>${nome}</strong>,</p>
      <p>Detectamos <strong>5 tentativas incorretas de login</strong> na sua conta do teu posto.</p>
      <p>Por segurança, o acesso foi bloqueado. Para liberar, utilize a opção <strong>Esqueci minha senha</strong> no site.</p>
      <p>Se não foi você, entre em contato com o suporte imediatamente.</p>
    `

    const results = await Promise.all([
      email ? sendEmail(email, 'Alerta de segurança — teu posto', emailHtml) : Promise.resolve(false),
      phone ? sendWhatsApp(phone, message) : Promise.resolve(false),
    ])

    return jsonResponse({
      ok: true,
      alert_id: alertId,
      email_sent: results[0],
      whatsapp_sent: results[1],
    })
  } catch (error) {
    console.error('send-security-alert error', error)
    return jsonResponse({ ok: false, message: 'Erro ao enviar alerta.' }, 500)
  }
})
