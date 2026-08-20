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
  assinaturaVencida: 'aviso_assinatura_vencida',
  drenagem: 'aviso_drenagem_diesel',
  metrologia: 'aviso_metrologia',
  raqFora: 'aviso_raq_fora',
  metrologiaFora: 'aviso_metrologia_fora',
  docPrazo: 'aviso_doc_prazo',
  docVencido: 'aviso_doc_vencido',
  laudosEngenharia: 'aviso_laudos_de_engenharia_e_saude_ocupacional',
  cursosFuncionarios: 'aviso_treinamentos',
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

/** aviso_assinatura_vencida: {{razao}} {{cnpj}} {{endereco}} — acesso finalizado / renovar plano */
export function assinaturaVencidaTemplate(input: {
  nome: string
  cnpj: string | null | undefined
  endereco?: string | null
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(input.cnpj)
  return {
    name: POSTO_TEMPLATES.assinaturaVencida,
    language: WA_LANG,
    bodyParams: [
      p('razao', razao),
      p('cnpj', cnpjFmt),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `aviso_assinatura_vencida: ${razao}`,
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
 * aviso_laudos_de_engenharia_e_saude_ocupacional:
 * {{doc}} {{x}} {{razao}} {{cnpj}} {{endereco}}
 */
export function laudosEngenhariaTemplate(input: {
  nome: string
  cnpj?: string | null
  endereco?: string | null
  docTitle: string
  expiresKey: string
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const cnpjFmt = formatCnpj(input.cnpj)
  const doc = input.docTitle.trim() || 'Documento'
  const when = formatDateKeyPtBr(input.expiresKey)
  return {
    name: POSTO_TEMPLATES.laudosEngenharia,
    language: WA_LANG,
    bodyParams: [
      p('doc', doc),
      p('x', when),
      p('razao', razao),
      p('cnpj', cnpjFmt),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `${POSTO_TEMPLATES.laudosEngenharia}: ${doc} · ${when}`,
  }
}

/**
 * aviso_treinamentos:
 * {{curso}} {{funcionario}} {{x}} {{razao}} {{cnpj}} {{endereco}}
 */
export function cursosFuncionariosTemplate(input: {
  nome: string
  cnpj?: string | null
  endereco?: string | null
  curso: string
  funcionario: string
  expiresKey: string
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const when = formatDateKeyPtBr(input.expiresKey)
  return {
    name: POSTO_TEMPLATES.cursosFuncionarios,
    language: WA_LANG,
    bodyParams: [
      p('curso', input.curso),
      p('funcionario', input.funcionario),
      p('x', when),
      p('razao', razao),
      p('cnpj', formatCnpj(input.cnpj)),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `${POSTO_TEMPLATES.cursosFuncionarios}: ${input.curso} · ${input.funcionario} · ${when}`,
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

const RAQ_FUEL_LABELS: Record<string, string> = {
  'gasolina-comum': 'Gasolina Comum',
  'gasolina-aditivada': 'Gasolina Aditivada',
  'gasolina-premium': 'Gasolina Premium',
  'etanol-comum': 'Etanol Comum',
  'etanol-aditivado': 'Etanol Aditivado',
  'etanol-premium': 'Etanol Premium',
  'diesel-s10-comum': 'Diesel S-10 Comum',
  'diesel-s10-aditivado': 'Diesel S-10 Aditivado',
  'diesel-s500-comum': 'Diesel S-500 Comum',
  'diesel-s500-aditivado': 'Diesel S-500 Aditivado',
  gnv: 'Gás Natural Veicular',
}

export function raqFuelLabel(key: string) {
  return RAQ_FUEL_LABELS[key] ?? key
}

export type RaqOutOfSpecItem = {
  product_key: string
  aspecto?: string | null
  cor?: string | null
  temperatura_observada?: string | null
  massa_especifica_observada?: string | null
  massa_especifica_convertida?: string | null
}

/**
 * aviso_raq_fora — params nomeados do modelo na WABA:
 * {{combustivel}} {{aspecto}} {{cor}} {{meobservada}} {{temperatura}}
 * {{meconvertida}} {{data}} {{razao}} {{cnpj}} {{endereco}}
 */
export function raqForaTemplate(input: {
  nome: string
  cnpj?: string | null
  endereco?: string | null
  data: string
  item: RaqOutOfSpecItem
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const combustivel = raqFuelLabel(input.item.product_key)
    .toUpperCase()
    .replace(/S-10/g, 'S10')
    .replace(/S-500/g, 'S500')
  return {
    name: POSTO_TEMPLATES.raqFora,
    language: WA_LANG,
    bodyParams: [
      p('combustivel', combustivel),
      p('aspecto', input.item.aspecto),
      p('cor', input.item.cor),
      p('meobservada', input.item.massa_especifica_observada),
      p('temperatura', input.item.temperatura_observada),
      p('meconvertida', input.item.massa_especifica_convertida),
      p('data', input.data),
      p('razao', razao),
      p('cnpj', formatCnpj(input.cnpj)),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `aviso_raq_fora: ${razao} · ${combustivel}`,
  }
}

export type MetrologyRaqSnapshot = {
  aspecto?: string | null
  cor?: string | null
  temperatura_observada?: string | null
  massa_especifica_observada?: string | null
  massa_especifica_convertida?: string | null
}

export type MetrologyOutOfSpecItem = {
  nozzle_number: number
  fuel_product_key: string
  fuel_other_label?: string | null
  item_status?: string
  seals_ok?: boolean | null
  leakage?: boolean | null
  hose_ok?: boolean | null
  display_burned?: boolean | null
}

function metrologySealsLabel(value: boolean | null | undefined) {
  if (value === false) return 'FALTANDO'
  if (value === true) return 'OK'
  return '-'
}

function metrologyLeakageLabel(value: boolean | null | undefined) {
  if (value === true) return 'POSSUI'
  if (value === false) return 'NÃO POSSUI'
  return '-'
}

function metrologyHoseLabel(value: boolean | null | undefined) {
  if (value === false) return 'DANIFICADA'
  if (value === true) return 'OK'
  return '-'
}

function metrologyDisplayLabel(value: boolean | null | undefined) {
  if (value === true) return 'QUEIMADO'
  if (value === false) return 'OK'
  return '-'
}

function metrologyFuelLabel(key: string, otherLabel?: string | null) {
  if (key === 'outro') return otherLabel?.trim() || 'Outro'
  if (key === 'manutencao') return 'Bico em manutenção'
  return raqFuelLabel(key)
}

function formatNozzleWaLabel(nozzleNumber: number) {
  return `BICO Nº ${String(nozzleNumber).padStart(2, '0')}`
}

/**
 * aviso_metrologia_fora — params nomeados do modelo na WABA:
 * {{combustivel}} {{aspecto}} {{cor}} {{meobservada}} {{temperatura}}
 * {{meconvertida}} {{vazamento}} {{mangueiras}} {{lacres}} {{display}}
 * {{data}} {{razao}} {{cnpj}} {{endereco}}
 */
export function metrologiaForaTemplate(input: {
  nome: string
  cnpj?: string | null
  endereco?: string | null
  data: string
  item: MetrologyOutOfSpecItem
  raq?: MetrologyRaqSnapshot | null
}): TemplatePayload {
  const razao = input.nome.trim() || 'Posto'
  const fuel = metrologyFuelLabel(input.item.fuel_product_key, input.item.fuel_other_label)
    .toUpperCase()
    .replace(/S-10/g, 'S10')
    .replace(/S-500/g, 'S500')
  const combustivel = `${fuel} (${formatNozzleWaLabel(input.item.nozzle_number)})`
  const raq = input.raq ?? {}
  return {
    name: POSTO_TEMPLATES.metrologiaFora,
    language: WA_LANG,
    bodyParams: [
      p('combustivel', combustivel),
      p('aspecto', raq.aspecto),
      p('cor', raq.cor),
      p('meobservada', raq.massa_especifica_observada),
      p('temperatura', raq.temperatura_observada),
      p('meconvertida', raq.massa_especifica_convertida),
      p('vazamento', metrologyLeakageLabel(input.item.leakage)),
      p('mangueiras', metrologyHoseLabel(input.item.hose_ok)),
      p('lacres', metrologySealsLabel(input.item.seals_ok)),
      p('display', metrologyDisplayLabel(input.item.display_burned)),
      p('data', input.data),
      p('razao', razao),
      p('cnpj', formatCnpj(input.cnpj)),
      p('endereco', formatEndereco(input.endereco)),
    ],
    summary: `aviso_metrologia_fora: ${razao} · ${combustivel}`,
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
