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

export type SendTemplateResult = {
  ok: boolean
  error?: string
}

type TemplateComponent = {
  type: string
  parameters: Array<Record<string, string>>
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

function summarizeMetaError(raw: string) {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; error_data?: { details?: string } }
    }
    const details = parsed.error?.error_data?.details
    const message = parsed.error?.message
    const text = [message, details].filter(Boolean).join(' — ')
    if (text) return text.slice(0, 400)
  } catch {
    /* texto cru */
  }
  return raw.replace(/\s+/g, ' ').trim().slice(0, 400)
}

async function postWhatsAppTemplate(input: {
  token: string
  phoneNumberId: string
  version: string
  to: string
  name: string
  language: string
  components?: TemplateComponent[]
}): Promise<SendTemplateResult> {
  const response = await fetch(
    `https://graph.facebook.com/${input.version}/${input.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: {
          name: input.name,
          language: { code: input.language },
          ...(input.components ? { components: input.components } : {}),
        },
      }),
    },
  )

  const raw = await response.text()
  if (!response.ok) {
    return { ok: false, error: summarizeMetaError(raw) || `http_${response.status}` }
  }
  return { ok: true }
}

export async function sendWhatsAppTemplateDetailed(
  input: SendTemplateInput,
): Promise<SendTemplateResult> {
  const token = Deno.env.get('META_WHATSAPP_TOKEN')?.trim()
  const phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')?.trim()
  const version = Deno.env.get('META_GRAPH_API_VERSION')?.trim() || 'v21.0'

  if (!token || !phoneNumberId) {
    console.warn('META_WHATSAPP_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID not configured')
    return { ok: false, error: 'meta_not_configured' }
  }

  const to = normalizeWaPhone(input.to)
  if (to.length < 12 || to.length > 15) {
    return { ok: false, error: 'invalid_phone' }
  }

  const bodyParams = (input.bodyParams ?? [])
    .map((param) => ({
      name: String(param.name ?? '').trim(),
      text: sanitizeWaParam(param.text),
    }))
    .filter((param) => param.name.length > 0)

  const language = input.language ?? 'pt_BR'
  const namedComponents: TemplateComponent[] | undefined =
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
  const positionalComponents: TemplateComponent[] | undefined =
    bodyParams.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParams.map((param) => ({
              type: 'text',
              text: param.text,
            })),
          },
        ]
      : undefined

  const named = await postWhatsAppTemplate({
    token,
    phoneNumberId,
    version,
    to,
    name: input.name,
    language,
    components: namedComponents,
  })
  if (named.ok) return named

  console.error('Meta WhatsApp named template failed', to, input.name, named.error)
  if (!positionalComponents) return named

  const positional = await postWhatsAppTemplate({
    token,
    phoneNumberId,
    version,
    to,
    name: input.name,
    language,
    components: positionalComponents,
  })
  if (!positional.ok) {
    console.error('Meta WhatsApp positional template failed', to, input.name, positional.error)
    return {
      ok: false,
      error: positional.error || named.error || 'whatsapp_send_failed',
    }
  }
  return positional
}

export async function sendWhatsAppTemplate(input: SendTemplateInput): Promise<boolean> {
  return (await sendWhatsAppTemplateDetailed(input)).ok
}
