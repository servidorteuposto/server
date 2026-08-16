/**
 * Nomes e variáveis dos modelos Meta (Utilidade / pt_BR) — params NOMEADOS.
 * Alinhado aos modelos ativos na WABA (prints ago/2026).
 */

import { sanitizeWaParam, type NamedBodyParam } from './meta-whatsapp.ts'

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
  raq: 'aviso_raq1',
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
  bodyParams: NamedBodyParam[]
  /** Resumo legível para log / coluna message da fila. */
  summary: string
}

function p(name: string, text: string | null | undefined): NamedBodyParam {
  return { name, text: sanitizeWaParam(text) }
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

function formatEndereco(value: string | null | undefined) {
  return sanitizeWaParam(value, 'nao informado')
}

/** aviso_admin_db / aviso_admin_r2: {{porcentagem}} {{um}} {{dois}} */
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
    bodyParams: [
      p('porcentagem', pctStr),
      p('um', usedLabel),
      p('dois', quotaLabel),
    ],
    summary: `${name}: ${pctStr}% · ${usedLabel} / ${quotaLabel}`,
  }
}

/** aviso_admin_resend: {{um}} {{dois}} {{tres}} {{quatro}} */
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
    bodyParams: [
      p('um', period),
      p('dois', String(used)),
      p('tres', String(quota)),
      p('quatro', String(left)),
    ],
    summary: `aviso_admin_resend: ${period} ${used}/${quota} (restam ${left})`,
  }
}

/** aviso_admin_dominio: {{x}} {{y}} */
export function adminDominioTemplate(daysLeft: number, expiresOn: string): TemplatePayload {
  const days = String(Math.max(0, daysLeft))
  const when = formatDateKeyPtBr(expiresOn)
  return {
    name: ADMIN_TEMPLATES.dominio,
    language: WA_LANG,
    bodyParams: [p('x', days), p('y', when)],
    summary: `aviso_admin_dominio: ${days} dia(s) · ${when}`,
  }
}

/** aviso_bloqueio: {{razao}} {{cnpj}} {{endereco}} */
export function bloqueioTemplate(
  postoNome: string,
  cnpj: string | null | undefined,
  endereco?: string | null,
): TemplatePayload {
  const razao = postoNome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(cnpj)
  return {
    name: POSTO_TEMPLATES.bloqueio,
    language: WA_LANG,
    bodyParams: [p('razao', razao), p('cnpj', cnpjFmt), p('endereco', formatEndereco(endereco))],
    summary: `aviso_bloqueio: ${razao} · ${cnpjFmt}`,
  }
}

/** aviso_raq1: {{razao}} {{cnpj}} {{endereco}} — periódico a cada 4 dias */
export function raqTemplate(input: {
  nome: string
  cnpj: string | null | undefined
  endereco?: string | null
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(input.cnpj)
  return {
    name: POSTO_TEMPLATES.raq,
    language: WA_LANG,
    bodyParams: [
      p('razao', razao),
      p('cnpj', cnpjFmt),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `aviso_raq1: ${razao}`,
  }
}

/** aviso_assinatura_7d / 2d: {{razao}} {{cnpj}} {{endereco}} (dias fixos no texto do modelo) */
export function assinaturaTemplate(input: {
  nome: string
  cnpj: string | null | undefined
  endereco?: string | null
  daysLeft: number
  endsKey: string
}): TemplatePayload {
  const name =
    input.daysLeft <= 2 ? POSTO_TEMPLATES.assinatura2d : POSTO_TEMPLATES.assinatura7d
  const razao = input.nome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(input.cnpj)
  return {
    name,
    language: WA_LANG,
    bodyParams: [
      p('razao', razao),
      p('cnpj', cnpjFmt),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `${name}: ${razao} · ${input.daysLeft}d · ${formatDateKeyPtBr(input.endsKey)}`,
  }
}

/**
 * aviso_doc_prazo: {{razao}} {{cnpj}} {{endereco}} {{documento}} {{dias}}
 * aviso_doc_vencido: {{razao}} {{cnpj}} {{endereco}} {{documento}}
 */
export function docTemplate(input: {
  nome: string
  cnpj?: string | null
  endereco?: string | null
  docTitle: string
  daysLeft: number
  expiresKey: string
}): TemplatePayload {
  const expired = input.daysLeft <= 0
  const name = expired ? POSTO_TEMPLATES.docVencido : POSTO_TEMPLATES.docPrazo
  const razao = input.nome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(input.cnpj)
  const doc = input.docTitle.trim() || 'Documento'
  const days = String(Math.max(0, input.daysLeft))
  const bodyParams: NamedBodyParam[] = [
    p('razao', razao),
    p('cnpj', cnpjFmt),
    p('endereco', formatEndereco(input.endereco)),
    p('documento', doc),
  ]
  if (!expired) bodyParams.push(p('dias', days))
  return {
    name,
    language: WA_LANG,
    bodyParams,
    summary: `${name}: ${doc} · ${days}d · ${formatDateKeyPtBr(input.expiresKey)}`,
  }
}

/** aviso_metrologia: {{razao}} {{cnpj}} {{endereco}} */
export function metrologiaTemplate(input: {
  nome: string
  cnpj?: string | null
  endereco?: string | null
  dueKey: string
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  return {
    name: POSTO_TEMPLATES.metrologia,
    language: WA_LANG,
    bodyParams: [
      p('razao', razao),
      p('cnpj', formatCnpj(input.cnpj)),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `aviso_metrologia: ${razao} · ${formatDateKeyPtBr(input.dueKey)}`,
  }
}

/** aviso_drenagem_diesel: {{razao}} {{cnpj}} {{endereco}} {{tanque}} */
export function drenagemTemplate(input: {
  nome: string
  cnpj?: string | null
  endereco?: string | null
  tankName: string
  dueKey: string
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const tank = input.tankName.trim() || 'Tanque'
  return {
    name: POSTO_TEMPLATES.drenagem,
    language: WA_LANG,
    bodyParams: [
      p('razao', razao),
      p('cnpj', formatCnpj(input.cnpj)),
      p('endereco', formatEndereco(input.endereco)),
      p('tanque', tank),
    ],
    summary: `aviso_drenagem_diesel: ${tank} · ${formatDateKeyPtBr(input.dueKey)}`,
  }
}
