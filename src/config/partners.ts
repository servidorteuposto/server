export type PartnerType = 'transporter' | 'distributor'

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  transporter: 'Transportador',
  distributor: 'Distribuidor',
}

export const PARTNER_NAME_HINT_MIN_CHARS = 3
export const PARTNER_CNPJ_HINT_MIN_DIGITS = 3
