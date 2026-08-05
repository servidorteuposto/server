import type { User } from '@supabase/supabase-js'
import { ADMIN_EMAIL } from './auth'

/** Somente a conta oficial Teu Posto — não use role genérica. */
export function isAdminUser(user: User | null) {
  if (!user) return false
  return String(user.email ?? '')
    .trim()
    .toLowerCase() === ADMIN_EMAIL
}
