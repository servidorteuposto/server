export const SUBSCRIPTION_PRICE_CENTS = 9900

export const SUBSCRIPTION_PRICE_LABEL = 'R$ 99,00'

export const SUBSCRIPTION_PERIOD_LABEL = '30 dias corridos'

export type PaymentMethod = 'card' | 'boleto' | 'pix'

export type PaymentActivation = 'instant' | 'pending'

export type BillingMode = 'one_time' | 'recurring'

export function getPaymentActivation(method: PaymentMethod): PaymentActivation {
  return method === 'boleto' ? 'pending' : 'instant'
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

/** Dias restantes até o vencimento (ceil). null se sem data. */
export function subscriptionDaysLeft(endsAt: string | null | undefined): number | null {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export type RenewalNoticeKind = 'day_before' | 'due_day' | null

export function getRenewalNoticeKind(input: {
  status?: string | null
  endsAt?: string | null
  daysLeft?: number | null
}): RenewalNoticeKind {
  if (input.status !== 'active') return null
  const days =
    typeof input.daysLeft === 'number'
      ? Math.ceil(input.daysLeft)
      : subscriptionDaysLeft(input.endsAt)
  if (days === null) return null
  if (days <= 0) return 'due_day'
  if (days === 1) return 'day_before'
  return null
}
