import { isImageFile, isPdfOrImageFile } from './fuel-analyses'

export const MANDATORY_EQUIPMENTS_STORAGE_BUCKET = 'mandatory-equipments'
export const MANDATORY_EQUIPMENTS_MAX_FILE_BYTES = 10 * 1024 * 1024

export type MandatoryEquipmentKey =
  | 'termometro-biocombustiveis'
  | 'densimetro-1-gasolina'
  | 'densimetro-2-gasolina'
  | 'densimetro-1-diesel'
  | 'densimetro-2-diesel'
  | 'densimetro-1-etanol'
  | 'densimetro-2-etanol'
  | 'balde-medida-20l'
  | 'proveta-teor-alcoolico-gasolina'

export type MandatoryEquipmentKind = 'standard' | 'bucket' | 'cylinder'

export type MandatoryEquipmentTemplate = {
  key: MandatoryEquipmentKey
  title: string
  description: string
  kind: MandatoryEquipmentKind
}

export const MANDATORY_EQUIPMENT_TEMPLATES: MandatoryEquipmentTemplate[] = [
  {
    key: 'termometro-biocombustiveis',
    title: 'Termômetro para Biocombustíveis',
    description: 'Escala de -10°C a 50°C',
    kind: 'standard',
  },
  {
    key: 'densimetro-1-gasolina',
    title: 'Densímetro 1 de Gasolina',
    description: 'Escala de 700°C a 750°C',
    kind: 'standard',
  },
  {
    key: 'densimetro-2-gasolina',
    title: 'Densímetro 2 de Gasolina',
    description: 'Escala de 750°C a 800°C',
    kind: 'standard',
  },
  {
    key: 'densimetro-1-diesel',
    title: 'Densímetro 1 de Diesel',
    description: 'Escala de 800°C a 850°C',
    kind: 'standard',
  },
  {
    key: 'densimetro-2-diesel',
    title: 'Densímetro 2 de Diesel',
    description: 'Escala de 850°C a 900°C',
    kind: 'standard',
  },
  {
    key: 'densimetro-1-etanol',
    title: 'Densímetro 1 de Etanol',
    description: 'Escala de 750°C a 800°C',
    kind: 'standard',
  },
  {
    key: 'densimetro-2-etanol',
    title: 'Densímetro 2 de Etanol',
    description: 'Escala de 800°C a 850°C',
    kind: 'standard',
  },
  {
    key: 'balde-medida-20l',
    title: 'Balde de Medida (Aferidor) 20L',
    description: 'Equipamento aferidor de 20 litros',
    kind: 'bucket',
  },
  {
    key: 'proveta-teor-alcoolico-gasolina',
    title: 'Proveta por Teor Alcoólico na Gasolina (100ml RBC)',
    description: 'Proveta 100 ml RBC para teor alcoólico',
    kind: 'cylinder',
  },
]

export type EquipmentComplianceStatus = 'pendente' | 'nao_apto' | 'de_acordo'

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentComplianceStatus, string> = {
  pendente: 'PENDENTE',
  nao_apto: 'NÃO APTO',
  de_acordo: 'DE ACORDO',
}

export type EquipmentPhotoMeta = {
  path: string
  file_name: string
  latitude: number | null
  longitude: number | null
  captured_at: string | null
}

export function getEquipmentTemplate(key: MandatoryEquipmentKey) {
  return MANDATORY_EQUIPMENT_TEMPLATES.find((item) => item.key === key) ?? null
}

export function isEquipmentCertificateFile(file: File) {
  return isPdfOrImageFile(file)
}

export function isEquipmentPhotoFile(file: File) {
  return isImageFile(file)
}

export {
  isImageFile,
  isPdfOrImageFile,
}
