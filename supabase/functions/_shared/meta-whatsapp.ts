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

type GraphComponent = {
  type?: string
  format?: string
  text?: string
  example?: {
    body_text_named_params?: Array<{ param_name?: string }>
  }
}

type TemplateShape = {
  bodyNames: string[]
  bodyPositional: number
}

/** Fallback alinhado ao modelo APROVADO na WABA (contagem que a Meta recusa se divergir). */
const KNOWN_TEMPLATE_SHAPES: Record<string, TemplateShape> = {
  aviso_raq_fora: {
    bodyNames: [
      'combustivel',
      'data',
      'razao',
      'cnpj',
      'endereco',
      'aspecto',
      'cor',
      'tempo',
      'massa',
      'massac',
      'teor',
    ],
    bodyPositional: 0,
  },
  aviso_treinamentos: {
    bodyNames: ['func', 'tre', 'dia', 'razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_laudos_de_engenharia_e_saude_ocupacional: {
    bodyNames: ['doc', 'x', 'razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_metrologia_fora: {
    bodyNames: [
      'number',
      'data',
      'razao',
      'cnpj',
      'endereco',
      'volmin',
      'vazaomin',
      'volmax',
      'vazaomax',
      'lacre',
      'vaz',
      'mang',
      'display',
    ],
    bodyPositional: 0,
  },
  aviso_assinatura_vencida: {
    bodyNames: ['razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_assinatura_2d: {
    bodyNames: ['razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_assinatura_7d: {
    bodyNames: ['razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_bloqueio: {
    bodyNames: ['razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_raq1: {
    bodyNames: ['razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_drenagem_diesel: {
    bodyNames: ['razao', 'cnpj', 'endereco', 'tanque'],
    bodyPositional: 0,
  },
  aviso_metrologia: {
    bodyNames: ['razao', 'cnpj', 'endereco'],
    bodyPositional: 0,
  },
  aviso_doc_vencido: {
    bodyNames: ['razao', 'cnpj', 'endereco', 'documento'],
    bodyPositional: 0,
  },
  aviso_doc_prazo: {
    bodyNames: ['razao', 'cnpj', 'endereco', 'documento', 'dias'],
    bodyPositional: 0,
  },
  aviso_admin_dominio: {
    bodyNames: ['x', 'y'],
    bodyPositional: 0,
  },
  aviso_admin_resend: {
    bodyNames: ['um', 'dois', 'tres', 'quatro'],
    bodyPositional: 0,
  },
  aviso_admin_db: {
    bodyNames: ['porcentagem', 'um', 'dois'],
    bodyPositional: 0,
  },
  aviso_admin_r2: {
    bodyNames: ['porcentagem', 'um', 'dois'],
    bodyPositional: 0,
  },
}

const templateShapeCache = new Map<string, { at: number; shape: TemplateShape | null }>()
const CACHE_MS = 10 * 60 * 1000

function uniqueNames(names: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function placeholdersFromText(text: string) {
  const named = [...text.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)].map((match) =>
    match[1].toLowerCase(),
  )
  const positional = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]))
  return {
    names: uniqueNames(named),
    positional: positional.length ? Math.max(...positional) : 0,
  }
}

function valueForTemplateName(name: string, available: Map<string, string>) {
  const direct = available.get(name)
  if (direct) return direct
  if (name === 'x' || name === 'hora' || name === 'dia') {
    return available.get('dia') ?? available.get('x') ?? available.get('data') ?? '-'
  }
  if (name === 'func') return available.get('func') ?? available.get('funcionario') ?? '-'
  if (name === 'tre') return available.get('tre') ?? available.get('curso') ?? '-'
  if (name === 'status' || name === 'resultado') return available.get('status') ?? 'INAPTO'
  if (name === 'teor') return available.get('teor') ?? '-'
  if (name === 'tempo') return available.get('tempo') ?? available.get('temperatura') ?? '-'
  if (name === 'massa') return available.get('massa') ?? available.get('meobservada') ?? '-'
  if (name === 'massac') return available.get('massac') ?? available.get('meconvertida') ?? '-'
  if (name === 'bico' || name === 'number') return available.get('number') ?? available.get('bico') ?? '-'
  if (name === 'lacre') return available.get('lacre') ?? available.get('lacres') ?? '-'
  if (name === 'vaz') return available.get('vaz') ?? available.get('vazamento') ?? '-'
  if (name === 'mang') return available.get('mang') ?? available.get('mangueiras') ?? '-'
  return '-'
}

function alignBodyParams(params: NamedBodyParam[], shape: TemplateShape | null) {
  if (!shape) return params
  if (shape.bodyNames.length > 0) {
    const available = new Map(params.map((param) => [param.name.toLowerCase(), param.text]))
    if (available.has('combustivel') && shape.bodyNames.includes('bico') && !available.has('bico')) {
      const merged = available.get('combustivel') ?? ''
      const match = merged.match(/^(.*?)\s*[-–]\s*(BICO\s+\d+)\s*$/i)
      if (match) {
        available.set('combustivel', match[1].trim() || merged)
        available.set('bico', match[2].trim())
      }
    }
    return shape.bodyNames.map((name) => ({
      name,
      text: valueForTemplateName(name, available),
    }))
  }
  if (shape.bodyPositional > 0) {
    const texts = params.map((param) => param.text)
    while (texts.length < shape.bodyPositional) texts.push('-')
    return texts.slice(0, shape.bodyPositional).map((text, index) => ({
      name: String(index + 1),
      text,
    }))
  }
  return params
}

async function graphGet(version: string, token: string, path: string) {
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const raw = await response.text()
  if (!response.ok) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

async function resolveWabaId(version: string, token: string, phoneNumberId: string) {
  const fromEnv = Deno.env.get('META_WHATSAPP_WABA_ID')?.trim()
  if (fromEnv) return fromEnv

  const phone = await graphGet(version, token, `${phoneNumberId}?fields=whatsapp_business_account`)
  const nested = phone?.whatsapp_business_account as { id?: string } | undefined
  if (nested?.id) return String(nested.id)

  const debug = await graphGet(
    version,
    token,
    `debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
  )
  const data = debug?.data as
    | { granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> }
    | undefined
  const waba = data?.granular_scopes?.find((scope) =>
    String(scope.scope ?? '').includes('whatsapp_business_management'),
  )?.target_ids?.[0]
  return waba ? String(waba) : null
}

async function loadTemplateShape(
  version: string,
  token: string,
  phoneNumberId: string,
  templateName: string,
  language: string,
): Promise<TemplateShape | null> {
  const cacheKey = `${templateName}:${language}`
  const cached = templateShapeCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.shape

  const known = KNOWN_TEMPLATE_SHAPES[templateName] ?? null
  function remember(shape: TemplateShape | null) {
    templateShapeCache.set(cacheKey, { at: Date.now(), shape })
    return shape
  }

  // Modelos conferidos no texto da WABA: não deixar o Graph trocar os nomes
  // (ex.: exemplo da Meta com 13 vars diferentes, volumetria vira "-").
  if (known) return remember(known)

  const wabaId = await resolveWabaId(version, token, phoneNumberId)
  if (!wabaId) return remember(known)

  const payload = await graphGet(
    version,
    token,
    `${wabaId}/message_templates?name=${encodeURIComponent(templateName)}&limit=20`,
  )
  const rows = Array.isArray(payload?.data) ? (payload.data as Array<Record<string, unknown>>) : []
  const approved = rows.filter((item) => String(item.status ?? '').toUpperCase() === 'APPROVED')
  const row =
    approved.find((item) => String(item.language ?? '') === language) ??
    approved[0]
  if (!row) return remember(known)

  const components = Array.isArray(row.components) ? (row.components as GraphComponent[]) : []
  const body = components.find((item) => String(item.type ?? '').toUpperCase() === 'BODY')
  const parsed = placeholdersFromText(String(body?.text ?? ''))
  const fromExample = uniqueNames(
    (body?.example?.body_text_named_params ?? []).map((item) => String(item.param_name ?? '')),
  )
  const graphNames = parsed.names.length ? parsed.names : fromExample
  const shape: TemplateShape = {
    bodyNames: graphNames,
    bodyPositional: parsed.positional,
  }
  const resolved =
    shape.bodyNames.length > 0 || shape.bodyPositional > 0 ? shape : known
  return remember(resolved)
}

function countMismatch(error?: string) {
  const match = error?.match(/localizable_params \((\d+)\)[^\d]+(\d+)/)
  if (!match) return null
  const sent = Number(match[1])
  const expected = Number(match[2])
  if (!sent || !expected || sent === expected) return null
  return { sent, expected }
}

function candidateParamsForCountError(params: NamedBodyParam[], error?: string) {
  const mismatch = countMismatch(error)
  if (!mismatch) return []
  const { expected } = mismatch
  const candidates: NamedBodyParam[][] = []
  const seen = new Set<string>()

  function pushCandidate(next: NamedBodyParam[]) {
    if (next.length !== expected) return
    const key = next.map((param) => param.name).join(',')
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(next)
  }

  if (params.length > expected) {
    for (const name of ['display', 'mangueiras', 'endereco', 'teor', 'status', 'bico']) {
      pushCandidate(params.filter((param) => param.name !== name))
    }
    pushCandidate(params.slice(0, expected))
  } else {
    const have = new Set(params.map((param) => param.name))
    const data = params.find((param) => param.name === 'data')?.text ?? '-'
    const teor = params.find((param) => param.name === 'teor')?.text ?? '-'
    const additions = [
      { name: 'teor', text: teor },
      { name: 'status', text: 'INAPTO' },
      { name: 'resultado', text: 'INAPTO' },
      { name: 'bico', text: '-' },
      { name: 'hora', text: data },
      { name: 'x', text: data },
    ]
    for (const addition of additions) {
      if (have.has(addition.name)) continue
      pushCandidate([...params, addition])
    }
  }
  return candidates
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

  const language = input.language ?? 'pt_BR'
  const rawParams = (input.bodyParams ?? [])
    .map((param) => ({
      name: String(param.name ?? '').trim(),
      text: sanitizeWaParam(param.text),
    }))
    .filter((param) => param.name.length > 0)

  const shape = await loadTemplateShape(version, token, phoneNumberId, input.name, language)
  const aligned = alignBodyParams(rawParams, shape)
  const useNamed = !shape || shape.bodyNames.length > 0

  async function trySend(params: NamedBodyParam[], named: boolean): Promise<SendTemplateResult> {
    if (!params.length) {
      return postWhatsAppTemplate({
        token,
        phoneNumberId,
        version,
        to,
        name: input.name,
        language,
      })
    }
    return postWhatsAppTemplate({
      token,
      phoneNumberId,
      version,
      to,
      name: input.name,
      language,
      components: [
        {
          type: 'body',
          parameters: params.map((param) =>
            named
              ? { type: 'text', parameter_name: param.name, text: param.text }
              : { type: 'text', text: param.text },
          ),
        },
      ],
    })
  }

  const first = await trySend(aligned, useNamed)
  if (first.ok) return first
  console.error('Meta WhatsApp template failed', to, input.name, first.error, {
    aligned: aligned.map((param) => param.name),
    expected: shape?.bodyNames ?? shape?.bodyPositional,
  })

  const knownAligned = alignBodyParams(rawParams, KNOWN_TEMPLATE_SHAPES[input.name] ?? null)
  const pending = [
    knownAligned,
    rawParams,
    ...candidateParamsForCountError(aligned, first.error),
  ]
  const seen = new Set<string>([`${aligned.map((param) => param.name).join('|')}:${aligned.length}`])
  let lastError = first.error
  let attempts = 0
  while (pending.length && attempts < 8) {
    const variant = pending.shift()
    if (!variant) break
    const key = `${variant.map((param) => param.name).join('|')}:${variant.length}`
    if (seen.has(key)) continue
    seen.add(key)
    attempts += 1
    const namedTry = await trySend(variant, true)
    if (namedTry.ok) return namedTry
    lastError = namedTry.error || lastError
    pending.push(...candidateParamsForCountError(variant, namedTry.error))
    const positionalTry = await trySend(variant, false)
    if (positionalTry.ok) return positionalTry
    lastError = positionalTry.error || lastError
    pending.push(...candidateParamsForCountError(variant, positionalTry.error))
  }

  console.error('Meta WhatsApp retries exhausted', to, input.name, lastError)
  return { ok: false, error: lastError || 'whatsapp_send_failed' }
}

export async function sendWhatsAppTemplate(input: SendTemplateInput): Promise<boolean> {
  return (await sendWhatsAppTemplateDetailed(input)).ok
}
