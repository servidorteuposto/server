import { supabase } from './supabase'
import { SUBSCRIPTION_PRICE_CENTS, SUBSCRIPTION_PRICE_LABEL } from './payment'

export { SUBSCRIPTION_PRICE_CENTS, SUBSCRIPTION_PRICE_LABEL }

export type MpCheckoutAction =
  | 'create_pix'
  | 'create_boleto'
  | 'create_card_once'
  | 'create_card_recurring'
  | 'get_payment_status'
  | 'get_subscription_status'

export type CardBillingChoice = 'once' | 'recurring'

async function parsePayload<T>(data: T | null, error: unknown): Promise<T | null> {
  if (data) return data
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (context instanceof Response) {
    try {
      return (await context.json()) as T
    } catch {
      return null
    }
  }
  return null
}

async function invokeCheckout<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('mercadopago-checkout', { body })
  const payload = await parsePayload<T>(data as T | null, error)
  return { payload, invokeFailed: !payload && Boolean(error) }
}

export type PixCheckoutResult = {
  ok: boolean
  message?: string
  payment_id?: string
  status?: string
  qr_code?: string | null
  qr_code_base64?: string | null
  ticket_url?: string | null
}

export type BoletoCheckoutResult = {
  ok: boolean
  message?: string
  payment_id?: string
  status?: string
  ticket_url?: string | null
  barcode?: string | null
  digitable_line?: string | null
}

export type CardCheckoutResult = {
  ok: boolean
  message?: string
  init_point?: string
  sandbox_init_point?: string
  preference_id?: string
  preapproval_id?: string
}

export type PaymentStatusResult = {
  ok: boolean
  message?: string
  payment_id?: string
  status?: string
  approved?: boolean
  subscription_status?: string
}

export type SubscriptionStatusResult = {
  ok: boolean
  message?: string
  subscription_status?: string
  subscription_ends_at?: string | null
  billing_mode?: string | null
  activated?: boolean
}

export async function createPixPayment(input: {
  cnpj: string
  email: string
  nome: string
}): Promise<PixCheckoutResult> {
  const { payload, invokeFailed } = await invokeCheckout<PixCheckoutResult>({
    action: 'create_pix',
    ...input,
  })
  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível gerar o PIX.')
  }
  return payload
}

export async function createBoletoPayment(input: {
  cnpj: string
  email: string
  nome: string
}): Promise<BoletoCheckoutResult> {
  const { payload, invokeFailed } = await invokeCheckout<BoletoCheckoutResult>({
    action: 'create_boleto',
    ...input,
  })
  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível gerar o boleto.')
  }
  return payload
}

export async function createCardCheckout(input: {
  cnpj: string
  email: string
  nome: string
  billing: CardBillingChoice
}): Promise<CardCheckoutResult> {
  const { payload, invokeFailed } = await invokeCheckout<CardCheckoutResult>({
    action: input.billing === 'recurring' ? 'create_card_recurring' : 'create_card_once',
    cnpj: input.cnpj,
    email: input.email,
    nome: input.nome,
  })
  if (invokeFailed || !payload?.ok || !payload.init_point) {
    throw new Error(payload?.message || 'Não foi possível iniciar o pagamento no cartão.')
  }
  return payload
}

export async function getMpPaymentStatus(input: {
  cnpj: string
  email: string
  payment_id: string
}): Promise<PaymentStatusResult> {
  const { payload, invokeFailed } = await invokeCheckout<PaymentStatusResult>({
    action: 'get_payment_status',
    ...input,
  })
  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível consultar o pagamento.')
  }
  return payload
}

export async function getMpSubscriptionStatus(input: {
  cnpj: string
  email: string
}): Promise<SubscriptionStatusResult> {
  const { payload, invokeFailed } = await invokeCheckout<SubscriptionStatusResult>({
    action: 'get_subscription_status',
    ...input,
  })
  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível consultar a assinatura.')
  }
  return payload
}

export type BillingActionResult = {
  ok: boolean
  message?: string
  already_cancelled?: boolean
  already_requested?: boolean
  ticket_id?: string
  subscription_ends_at?: string | null
  cancel_at_period_end?: boolean
  refund_requested_at?: string | null
}

async function invokeBilling<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('mercadopago-billing', { body })
  const payload = await parsePayload<T>(data as T | null, error)
  return { payload, invokeFailed: !payload && Boolean(error) }
}

export async function cancelPlan(): Promise<BillingActionResult> {
  const { payload, invokeFailed } = await invokeBilling<BillingActionResult>({
    action: 'cancel_plan',
  })
  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível cancelar o plano.')
  }
  return payload
}

export async function requestRefund(reason?: string): Promise<BillingActionResult> {
  const { payload, invokeFailed } = await invokeBilling<BillingActionResult>({
    action: 'request_refund',
    reason: reason?.trim() || undefined,
  })
  if (invokeFailed || !payload?.ok) {
    throw new Error(payload?.message || 'Não foi possível solicitar o reembolso.')
  }
  return payload
}
