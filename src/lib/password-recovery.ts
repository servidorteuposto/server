export const PASSWORD_RECOVERY_KEY = 'teuposto_password_recovery'

export function markPasswordRecovery() {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearPasswordRecoveryFlag() {
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_KEY)
  } catch {
    /* ignore */
  }
}

export function isPasswordRecoveryMarked() {
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

/** Detecta link de recovery do Supabase (hash legado ou query). */
export function urlIndicatesPasswordRecovery() {
  if (typeof window === 'undefined') return false

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  if (hashParams.get('type') === 'recovery') return true

  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('type') === 'recovery'
}

export function getRecoveryTokenHashFromUrl() {
  if (typeof window === 'undefined') return null
  const searchParams = new URLSearchParams(window.location.search)
  if (searchParams.get('type') !== 'recovery') return null
  return searchParams.get('token_hash')
}

export function cleanRecoveryParamsFromUrl() {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  url.searchParams.delete('type')
  url.searchParams.delete('code')
  url.searchParams.delete('token_hash')
  const nextHash = new URLSearchParams(url.hash.replace(/^#/, ''))
  nextHash.delete('type')
  nextHash.delete('access_token')
  nextHash.delete('refresh_token')
  nextHash.delete('expires_in')
  nextHash.delete('expires_at')
  nextHash.delete('token_type')
  const hash = nextHash.toString()
  const clean = `${url.pathname}${url.search}${hash ? `#${hash}` : ''}`
  window.history.replaceState({}, '', clean || '/')
}
