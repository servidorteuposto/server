export const MANDATORY_PLATES_STORAGE_BUCKET = 'mandatory-plates'
export const MANDATORY_PLATES_MAX_FILE_BYTES = 10 * 1024 * 1024
export const MANDATORY_PLATES_MAX_CUSTOM = 20
export const MANDATORY_PLATES_TITLE_MAX_LENGTH = 80

export const STANDARD_PLATE_KEYS = ['orgao-ambiental', 'anp'] as const

export type StandardPlateKey = (typeof STANDARD_PLATE_KEYS)[number]

export type StandardPlateTemplate = {
  key: StandardPlateKey
  title: string
  description: string
  sortOrder: number
}

export const STANDARD_PLATE_TEMPLATES: StandardPlateTemplate[] = [
  {
    key: 'orgao-ambiental',
    title: 'Placa do órgão ambiental',
    description: 'Foto ao vivo da placa, com horário e localização.',
    sortOrder: 0,
  },
  {
    key: 'anp',
    title: 'Placa da ANP',
    description: 'Foto ao vivo da placa, com horário e localização.',
    sortOrder: 1,
  },
]

export function isStandardPlateKey(value: string): value is StandardPlateKey {
  return (STANDARD_PLATE_KEYS as readonly string[]).includes(value)
}

export function getStandardPlateTemplate(key: string) {
  return STANDARD_PLATE_TEMPLATES.find((item) => item.key === key) ?? null
}

export function createCustomPlateKey() {
  return `custom-${crypto.randomUUID()}`
}
