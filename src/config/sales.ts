/** WhatsApp do gestor comercial (E.164 sem +). */
export const GESTOR_WHATSAPP_DIGITS = '5551983010901'

export const SIMULAR_GRATIS_WHATSAPP_MESSAGE = 'Olá! Quero simular o Teu Posto grátis.'

export function buildSimularGratisWhatsAppUrl() {
  return `https://wa.me/${GESTOR_WHATSAPP_DIGITS}?text=${encodeURIComponent(
    SIMULAR_GRATIS_WHATSAPP_MESSAGE,
  )}`
}
