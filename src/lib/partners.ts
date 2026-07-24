import { PARTNER_TYPE_LABELS, type PartnerType } from '../config/partners'
import { cnpjDigits, isValidCnpj } from './cnpj'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type PostoPartner = {
  id: string
  posto_id: string
  partner_type: PartnerType
  razao_social: string
  cnpj: string
  telefone: string | null
  endereco: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  motorista: string | null
  placa: string | null
  created_at: string
  updated_at: string
}

export type SavePartnerInput = {
  postoId: string
  partnerType: PartnerType
  razaoSocial: string
  cnpj: string
  motorista?: string
  placa?: string
  existingId?: string
}

export { getMyPostoId }

export async function listPartners(postoId: string, partnerType?: PartnerType) {
  let query = supabase
    .from('posto_partners')
    .select('*')
    .eq('posto_id', postoId)
    .order('razao_social', { ascending: true })

  if (partnerType) {
    query = query.eq('partner_type', partnerType)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as PostoPartner[]
}

export async function savePartner(input: SavePartnerInput) {
  const cnpj = cnpjDigits(input.cnpj)
  if (!isValidCnpj(cnpj)) {
    throw new Error('invalid_cnpj')
  }

  const isTransporter = input.partnerType === 'transporter'

  const row = {
    posto_id: input.postoId,
    partner_type: input.partnerType,
    razao_social: input.razaoSocial.trim(),
    cnpj,
    motorista: isTransporter ? input.motorista?.trim() || null : null,
    placa: isTransporter ? input.placa?.trim().toUpperCase() || null : null,
  }

  if (input.existingId) {
    const { data, error } = await supabase
      .from('posto_partners')
      .update(row)
      .eq('id', input.existingId)
      .select('*')
      .single()

    if (error) throw error
    return data as PostoPartner
  }

  const { data, error } = await supabase.from('posto_partners').insert(row).select('*').single()
  if (error) throw error
  return data as PostoPartner
}

export async function deletePartner(partnerId: string) {
  const { error } = await supabase.from('posto_partners').delete().eq('id', partnerId)
  if (error) throw error
}

export function partnerTypeLabel(type: PartnerType) {
  return PARTNER_TYPE_LABELS[type]
}

export function partnerTypeListLabel(type: PartnerType) {
  return type === 'transporter' ? 'Transportadores' : 'Distribuidores'
}

export function filterPartnersByName(partners: PostoPartner[], query: string, minChars = 3) {
  const normalized = query.trim().toLowerCase()
  if (normalized.length < minChars) return []
  return partners.filter((partner) => partner.razao_social.toLowerCase().includes(normalized)).slice(0, 8)
}

export function filterPartnersByCnpj(partners: PostoPartner[], query: string, minDigits = 3) {
  const digits = cnpjDigits(query)
  if (digits.length < minDigits) return []
  return partners.filter((partner) => partner.cnpj.startsWith(digits)).slice(0, 8)
}
