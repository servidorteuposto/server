/**
 * Nomes e ordem de variáveis dos modelos Meta (Utilidade / pt_BR).
 * Ajuste as constantes se o nome Ativo na WABA for diferente (ex.: truncado).
 */

export const WA_LANG = 'pt_BR'

/** Modelos do painel Gerenciamento (admin). */
export const ADMIN_TEMPLATES = {
  db: 'aviso_admin_db',
  r2: 'aviso_admin_r2',
  resend: 'aviso_admin_resend',
  dominio: 'aviso_admin_dominio',
} as const

/** Modelos enviados aos postos. */
export const POSTO_TEMPLATES = {
  bloqueio: 'aviso_bloqueio',
  raq: 'aviso_raq',
  assinatura7d: 'aviso_assinatura_7d',
  assinatura2d: 'aviso_assinatura_2d',
  drenagem: 'aviso_drenagem_diesel',
  metrologia: 'aviso_metrologia',
  docPrazo: 'aviso_doc_prazo',
  docVencido: 'aviso_doc_vencido',
} as const

export type TemplatePayload = {
  name: string
  language: string
  bodyParams: string[]
  /** Resumo legível para log / coluna message da fila. */
  summary: string
}

function formatCnpj(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length !== 14) return (value ?? '').trim() || 'nao informado'
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function formatDateKeyPtBr(dateKey: string) {
  const [year, month, day] = dateKey.slice(0, 10).split('-')
  if (!year || !month || !day) return dateKey
  return `${day}/${month}/${year}`
}

/** aviso_admin_db / aviso_admin_r2: {{1}}% {{2}}usado {{3}}cota */
export function adminDbOrR2Template(
  kind: 'db' | 'r2',
  pct: number,
  usedLabel: string,
  quotaLabel: string,
): TemplatePayload {
  const name = kind === 'db' ? ADMIN_TEMPLATES.db : ADMIN_TEMPLATES.r2
  const pctStr = String(pct)
  return {
    name,
    language: WA_LANG,
    bodyParams: [pctStr, usedLabel, quotaLabel],
    summary: `${name}: ${pctStr}% · ${usedLabel} / ${quotaLabel}`,
  }
}

/** aviso_admin_resend: {{1}}periodo {{2}}usados {{3}}limite {{4}}restantes */
export function adminResendTemplate(
  periodLabel: 'diaria' | 'mensal',
  used: number,
  quota: number,
): TemplatePayload {
  const left = Math.max(0, quota - used)
  const period = periodLabel === 'diaria' ? 'diaria' : 'mensal'
  return {
    name: ADMIN_TEMPLATES.resend,
    language: WA_LANG,
    bodyParams: [period, String(used), String(quota), String(left)],
    summary: `aviso_admin_resend: ${period} ${used}/${quota} (restam ${left})`,
  }
}

/** aviso_admin_dominio: {{1}}dias {{2}}data */
export function adminDominioTemplate(daysLeft: number, expiresOn: string): TemplatePayload {
  const days = String(Math.max(0, daysLeft))
  const when = formatDateKeyPtBr(expiresOn)
  return {
    name: ADMIN_TEMPLATES.dominio,
    language: WA_LANG,
    bodyParams: [days, when],
    summary: `aviso_admin_dominio: ${days} dia(s) · ${when}`,
  }
}

/** aviso_bloqueio: {{1}}razao {{2}}cnpj */
export function bloqueioTemplate(postoNome: string, cnpj: string | null | undefined): TemplatePayload {
  const razao = postoNome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(cnpj)
  return {
    name: POSTO_TEMPLATES.bloqueio,
    language: WA_LANG,
    bodyParams: [razao, cnpjFmt],
    summary: `aviso_bloqueio: ${razao} · ${cnpjFmt}`,
  }
}

/**
 * aviso_raq — alinhado ao texto sugerido:
 * {{1}} razao · {{2}} cnpj · {{3}} endereco
 */
export function raqTemplate(input: {
  nome: string
  cnpj: string | null | undefined
  endereco?: string | null
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(input.cnpj)
  const endereco = (input.endereco ?? '').trim() || '-'
  return {
    name: POSTO_TEMPLATES.raq,
    language: WA_LANG,
    bodyParams: [razao, cnpjFmt, endereco],
    summary: `aviso_raq: ${razao}`,
  }
}

/**
 * Assinatura 7d/2d — params genericos:
 * {{1}} razao · {{2}} cnpj · {{3}} dias · {{4}} data fim
 */
export function assinaturaTemplate(input: {
  nome: string
  cnpj: string | null | undefined
  daysLeft: number
  endsKey: string
}): TemplatePayload {
  const name =
    input.daysLeft <= 2 ? POSTO_TEMPLATES.assinatura2d : POSTO_TEMPLATES.assinatura7d
  const razao = input.nome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(input.cnpj)
  const days = String(input.daysLeft)
  const when = formatDateKeyPtBr(input.endsKey)
  return {
    name,
    language: WA_LANG,
    bodyParams: [razao, cnpjFmt, days, when],
    summary: `${name}: ${razao} · ${days}d · ${when}`,
  }
}

/**
 * Doc prazo/vencido:
 * {{1}} razao · {{2}} documento · {{3}} dias · {{4}} data
 */
export function docTemplate(input: {
  nome: string
  docTitle: string
  daysLeft: number
  expiresKey: string
}): TemplatePayload {
  const expired = input.daysLeft <= 0
  const name = expired ? POSTO_TEMPLATES.docVencido : POSTO_TEMPLATES.docPrazo
  const razao = input.nome.trim() || 'Posto'
  const doc = input.docTitle.trim() || 'Documento'
  const days = String(Math.max(0, input.daysLeft))
  const when = formatDateKeyPtBr(input.expiresKey)
  return {
    name,
    language: WA_LANG,
    bodyParams: [razao, doc, days, when],
    summary: `${name}: ${doc} · ${days}d · ${when}`,
  }
}

/**
 * Metrologia: {{1}} razao · {{2}} data
 */
export function metrologiaTemplate(input: {
  nome: string
  dueKey: string
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const when = formatDateKeyPtBr(input.dueKey)
  return {
    name: POSTO_TEMPLATES.metrologia,
    language: WA_LANG,
    bodyParams: [razao, when],
    summary: `aviso_metrologia: ${razao} · ${when}`,
  }
}

/**
 * Drenagem: {{1}} razao · {{2}} tanque · {{3}} data
 */
export function drenagemTemplate(input: {
  nome: string
  tankName: string
  dueKey: string
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const tank = input.tankName.trim() || 'Tanque'
  const when = formatDateKeyPtBr(input.dueKey)
  return {
    name: POSTO_TEMPLATES.drenagem,
    language: WA_LANG,
    bodyParams: [razao, tank, when],
    summary: `aviso_drenagem_diesel: ${tank} · ${when}`,
  }
}
