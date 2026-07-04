import { secureActivatePayment } from './secure-auth'
import { supabase } from './supabase'

export type SubscriptionStatus = 'pending_payment' | 'active' | 'expired'

export interface AccountAccess {
  found: boolean
  subscription_status?: SubscriptionStatus
  nome?: string
  cnpj?: string
  telefone?: string
  email?: string
}

export interface RegistrationAvailability {
  available: boolean
  field: 'cnpj' | 'email' | 'telefone' | null
  subscription_status?: SubscriptionStatus
}

export interface MySubscription {
  found: boolean
  subscription_status?: SubscriptionStatus
  subscription_ends_at?: string | null
  is_read_only?: boolean
}

const FIELD_LABELS: Record<string, string> = {
  cnpj: 'CNPJ',
  email: 'e-mail',
  telefone: 'telefone',
}

export function getRegistrationConflictMessage(field: string | null) {
  if (!field) return 'Já existe uma conta com estes dados.'
  return `Já existe uma conta cadastrada com este ${FIELD_LABELS[field] ?? field}.`
}

export async function getAccountAccessByIdentifier(identifier: string): Promise<AccountAccess> {
  const { data, error } = await supabase.rpc('get_account_access_by_identifier', {
    p_identifier: identifier.trim(),
  })

  if (error) throw error
  return (data ?? { found: false }) as AccountAccess
}

export async function checkRegistrationAvailability(
  cnpj: string,
  email: string,
  phone: string,
): Promise<RegistrationAvailability> {
  const { data, error } = await supabase.rpc('check_registration_availability', {
    p_cnpj: cnpj,
    p_email: email,
    p_telefone: phone,
  })

  if (error) throw error
  return (data ?? { available: true, field: null }) as RegistrationAvailability
}

export async function activateSubscription(cnpj: string) {
  await secureActivatePayment(cnpj)
}

export async function getMySubscription(): Promise<MySubscription> {
  const { data, error } = await supabase.rpc('get_my_subscription')

  if (error) throw error
  return (data ?? { found: false }) as MySubscription
}
