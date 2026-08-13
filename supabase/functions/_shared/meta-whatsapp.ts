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

/** Variável nomeada do corpo (ex.: {{razao}} → parameter_name: "razao"). */
export type NamedBodyParam = {
  name: string
  text: string
}

export type SendTemplateInput = {
  to: string
  name: string
  language?: string
  /** Preferir parâmetros nomeados (WABA atual). */
  bodyParams?: NamedBodyParam[]
}

/** Sanitiza texto para parâmetros Meta (sem quebra de linha; máx. 1024). */
export function sanitizeWaParam(value: string | null | undefined, fallback = '-') {
  const cleaned = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{5,}/g, '    ')
    .trim()
  const text = cleaned || fallback
  return text.length > 1024 ? `${text.slice(0, 1021)}...` : text
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

  const bodyParams = (input.bodyParams ?? []).map((param) => ({
    name: String(param.name ?? '').trim(),
    text: sanitizeWaParam(param.text),
  })).filter((param) => param.name.length > 0)

  const components =
    bodyParams.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParams.map((param) => ({
              type: 'text',
              parameter_name: param.name,
              text: param.text,
            })),
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
