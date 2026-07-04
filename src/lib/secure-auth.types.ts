export type SecureLoginResult =
  | { ok: true }
  | {
      ok: false
      code:
        | 'locked'
        | 'invalid_credentials'
        | 'pending_payment'
        | 'rate_limited'
        | 'not_found'
        | 'subscription_inactive'
        | 'network'
      message: string
      posto?: {
        nome: string
        cnpj: string
        telefone: string
        email: string
      }
      attempts_left?: number
    }

export type SecureRegisterResult =
  | { ok: true; needs_payment: true }
  | { ok: false; code: string; message: string }
