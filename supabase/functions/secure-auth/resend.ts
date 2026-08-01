/** Remetente e resposta padrão dos e-mails Teu Posto (Resend). */
export const SUPPORT_EMAIL = 'suporte@appteuposto.com.br'
export const DEFAULT_FROM = `Teu Posto <noreply@appteuposto.com.br>`
export const DEFAULT_REPLY_TO = `Teu Posto Suporte <${SUPPORT_EMAIL}>`

export async function sendResendEmail(options: {
  to: string
  subject: string
  html: string
  from?: string
}): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from =
    options.from ??
    Deno.env.get('AUTH_EMAIL_FROM') ??
    Deno.env.get('SECURITY_EMAIL_FROM') ??
    DEFAULT_FROM
  const replyTo =
    Deno.env.get('SUPPORT_EMAIL_REPLY_TO') ??
    Deno.env.get('SUPPORT_EMAIL') ??
    DEFAULT_REPLY_TO

  if (!resendKey) {
    console.warn('RESEND_API_KEY not configured, skipping email')
    return false
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      reply_to: replyTo,
    }),
  })

  if (!response.ok) {
    console.error('Failed to send email', await response.text())
    return false
  }

  return true
}
