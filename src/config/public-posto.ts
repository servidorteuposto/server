import type { RegulatoryTemplateKey } from './regulatory-documents'

/** Documentos regulatórios visíveis na página pública do posto. */
export const PUBLIC_REGULATORY_TEMPLATE_KEYS: RegulatoryTemplateKey[] = [
  'alvara-prefeitura',
  'alvara-bombeiros-appci',
  'licenca-operacao-ambiental',
  'certificado-ibama',
  'alvara-sanitario',
  'certificado-revendedor-anp',
]

export function isPublicRegulatoryTemplate(key: string | null | undefined) {
  return Boolean(key && PUBLIC_REGULATORY_TEMPLATE_KEYS.includes(key as RegulatoryTemplateKey))
}

export function buildPublicPostoUrl(slug: string, origin = window.location.origin) {
  return `${origin}/p/${slug}`
}
