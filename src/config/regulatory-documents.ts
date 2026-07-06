export type RegulatoryTemplateKey =
  | 'alvara-prefeitura'
  | 'alvara-bombeiros-appci'
  | 'licenca-operacao-ambiental'
  | 'certificado-ibama'
  | 'alvara-sanitario'
  | 'projeto-simplificado-anp'
  | 'certificado-revendedor-anp'
  | 'ficha-cadastral-anp'
  | 'laudos-ambientais'

export type RegulatoryTemplate = {
  key: RegulatoryTemplateKey
  title: string
}

export const REGULATORY_DOCUMENT_TEMPLATES: RegulatoryTemplate[] = [
  { key: 'alvara-prefeitura', title: 'Alvará da Prefeitura' },
  { key: 'alvara-bombeiros-appci', title: 'Alvará do Corpo de Bombeiros (APPCI)' },
  { key: 'licenca-operacao-ambiental', title: 'Licença de Operação (Órgão Ambiental)' },
  { key: 'certificado-ibama', title: 'Certificado de Regularidade IBAMA' },
  { key: 'alvara-sanitario', title: 'Alvará Sanitário ou Dispensa' },
  { key: 'projeto-simplificado-anp', title: 'Projeto Simplificado ANP' },
  { key: 'certificado-revendedor-anp', title: 'Certificado de Revendedor ANP' },
  { key: 'ficha-cadastral-anp', title: 'Ficha Cadastral ANP' },
  { key: 'laudos-ambientais', title: 'Laudos Ambientais' },
]

export const REGULATORY_STORAGE_BUCKET = 'regulatory-documents'
export const REGULATORY_MAX_FILE_BYTES = 10 * 1024 * 1024

export function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export type DocumentExpiryStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_expiry'

export function getDocumentExpiryStatus(expiresAt: string | null): DocumentExpiryStatus {
  if (!expiresAt) return 'no_expiry'

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${expiresAt}T00:00:00`)
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'expired'
  if (diffDays <= 30) return 'expiring_soon'
  return 'valid'
}

export const EXPIRY_STATUS_LABELS: Record<DocumentExpiryStatus, string> = {
  valid: 'Válido',
  expiring_soon: 'Vence em breve',
  expired: 'Vencido',
  no_expiry: 'Permanente',
}

export const NO_EXPIRY_LABEL = 'Sem vencimento'

export function formatDatePtBr(isoDate: string) {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}/${month}/${year}`
}
