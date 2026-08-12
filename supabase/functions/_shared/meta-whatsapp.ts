/** Cliente WhatsApp Cloud API (Meta) — envio só por modelos (templates). */

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

/** Normaliza para E.164 sem +: 55 + DDD + número. */
export function normalizeWaPhone(phone: string) {
  let digits = onlyDigits(phone)
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function isMetaWhatsAppConfigured() {
  return Boolean(
    Deno.env.get('META_WHATSAPP_TOKEN')?.trim() &&
      Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')?.trim(),
  )
}

export type SendTemplateInput = {
  to: string
  name: string
  language?: string
  /** Valores na ordem de {{1}}, {{2}}, … do corpo do modelo. */
  bodyParams?: string[]
}

export async function sendWhatsAppTemplate(input: SendTemplateInput): Promise<boolean> {
  const token = Deno.env.get('META_WHATSAPP_TOKEN')?.trim()
  const phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')?.trim()
  const version = Deno.env.get('META_GRAPH_API_VERSION')?.trim() || 'v21.0'

  if (!token || !phoneNumberId) {
    console.warn('META_WHATSAPP_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID not configured')
    return false
  }

  const to = normalizeWaPhone(input.to)
  if (to.length < 12 || to.length > 15) return false

  const bodyParams = (input.bodyParams ?? []).map((value) => String(value ?? '').trim() || '-')
  const components =
    bodyParams.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text })),
          },
        ]
      : undefined

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: input.name,
          language: { code: input.language ?? 'pt_BR' },
          ...(components ? { components } : {}),
        },
      }),
    },
  )

  if (!response.ok) {
    console.error('Meta WhatsApp template failed', to, input.name, await response.text())
    return false
  }
  return true
}
