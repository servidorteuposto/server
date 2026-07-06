import { formatDatePtBr as formatDate } from './regulatory-documents'

export type WorkSafetyTemplateKey = 'pgr' | 'ltcat' | 'pcmso'

export type WorkSafetyTemplate = {
  key: WorkSafetyTemplateKey
  title: string
}

export const WORK_SAFETY_DOCUMENT_TEMPLATES: WorkSafetyTemplate[] = [
  { key: 'pgr', title: 'Programa de Gerenciamento de Riscos' },
  {
    key: 'ltcat',
    title: 'Laudo Técnico das Condições Ambientais do Trabalho',
  },
  { key: 'pcmso', title: 'Programa de Controle Médico de Saúde Ocupacional' },
]

export const WORK_SAFETY_STORAGE_BUCKET = 'work-safety-documents'
export const WORK_SAFETY_EMPLOYEE_STORAGE_BUCKET = 'work-safety-employee-files'
export const WORK_SAFETY_MAX_FILE_BYTES = 10 * 1024 * 1024

export type TrainingType = 'nr20' | 'nr35'

export const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  nr20: 'NR-20',
  nr35: 'NR-35',
}

export type IdentityDocumentKind = 'cnh' | 'identidade'

export const IDENTITY_KIND_LABELS: Record<IdentityDocumentKind, string> = {
  cnh: 'CNH',
  identidade: 'Identidade',
}

export {
  EXPIRY_STATUS_LABELS,
  formatDatePtBr,
  getDocumentExpiryStatus,
  isPdfFile,
  NO_EXPIRY_LABEL,
  type DocumentExpiryStatus,
} from './regulatory-documents'

export function stripCpf(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function formatCpf(value: string) {
  const digits = stripCpf(value)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function validateCpf(value: string) {
  const digits = stripCpf(value)
  if (digits.length !== 11) return 'Informe um CPF válido com 11 dígitos.'
  if (/^(\d)\1+$/.test(digits)) return 'Informe um CPF válido.'
  return null
}

export function formatTrainingDates(issuedAt: string | null, expiresAt: string | null) {
  if (!issuedAt) return '—'
  const issued = formatDate(issuedAt)
  if (!expiresAt) return `${issued} · Sem vencimento`
  return `${issued} · ${formatDate(expiresAt)}`
}
