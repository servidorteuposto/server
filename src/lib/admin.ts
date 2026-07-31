import type { User } from '@supabase/supabase-js'
import { ADMIN_EMAIL } from './auth'

export function isAdminUser(user: User | null) {
  if (!user) return false
  if (user.app_metadata?.role === 'admin') return true
  return String(user.email ?? '')
    .trim()
    .toLowerCase() === ADMIN_EMAIL
}
