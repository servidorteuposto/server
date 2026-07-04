export const SUBSCRIPTION_PRICE_CENTS = 9900

export const SUBSCRIPTION_PRICE_LABEL = 'R$ 99,00'

export const SUBSCRIPTION_PERIOD_LABEL = '30 dias corridos'

export type PaymentMethod = 'card' | 'boleto' | 'pix'

export type PaymentActivation = 'instant' | 'pending'

export function getPaymentActivation(method: PaymentMethod): PaymentActivation {
  return method === 'boleto' ? 'pending' : 'instant'
}

export function generateMockPixPayload(email: string, cnpj: string) {
  const document = cnpj.replace(/\D/g, '')
  return `teuposto|${SUBSCRIPTION_PRICE_LABEL}|${document}|${email}`
}
export function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

export function formatCardExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }
  return digits
}

export function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}
