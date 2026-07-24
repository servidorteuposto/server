import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias.')
}

export const IMPERSONATE_MODE_KEY = 'teuposto_auth_mode'
export const IMPERSONATE_LABEL_KEY = 'teuposto_impersonate_label'
export const AUTH_STORAGE_KEY = 'teuposto-auth-v1'

function isImpersonateMode() {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(IMPERSONATE_MODE_KEY) === 'impersonate'
}

function getAuthStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  return isImpersonateMode() ? window.sessionStorage : window.localStorage
}

const authStorage = {
  getItem: (key: string) => getAuthStorage()?.getItem(key) ?? null,
  setItem: (key: string, value: string) => {
    getAuthStorage()?.setItem(key, value)
  },
  removeItem: (key: string) => {
    getAuthStorage()?.removeItem(key)
  },
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export function isImpersonating() {
  return isImpersonateMode()
}

export function getImpersonateLabel() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(IMPERSONATE_LABEL_KEY)
}

export function startImpersonateMode(label: string) {
  window.sessionStorage.setItem(IMPERSONATE_MODE_KEY, 'impersonate')
  window.sessionStorage.setItem(IMPERSONATE_LABEL_KEY, label)
}

export async function endImpersonateMode() {
  try {
    await supabase.auth.signOut()
  } catch {
    // ignore
  }
  window.sessionStorage.removeItem(IMPERSONATE_MODE_KEY)
  window.sessionStorage.removeItem(IMPERSONATE_LABEL_KEY)
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
  window.close()
  // Se o navegador bloquear o close, volta ao login limpo nesta aba.
  window.location.href = '/'
}
