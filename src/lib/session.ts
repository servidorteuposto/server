const LAST_CLOSED_KEY = 'teuposto:lastClosedAt'
const ACTIVE_TABS_KEY = 'teuposto:activeTabs'
const REMEMBERED_IDENTIFIER_KEY = 'teuposto:rememberedIdentifier'

const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const TAB_STALE_MS = 15 * 1000
const TAB_HEARTBEAT_MS = 5 * 1000

export function getRememberedIdentifier(): string | null {
  return localStorage.getItem(REMEMBERED_IDENTIFIER_KEY)
}

export function setRememberedIdentifier(identifier: string | null) {
  if (identifier) {
    localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, identifier)
  } else {
    localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY)
  }
}

function readActiveTabs(): Record<string, number> {
  return JSON.parse(localStorage.getItem(ACTIVE_TABS_KEY) || '{}') as Record<string, number>
}

function writeActiveTabs(tabs: Record<string, number>) {
  localStorage.setItem(ACTIVE_TABS_KEY, JSON.stringify(tabs))
}

function pruneStaleTabs(tabs: Record<string, number>) {
  const now = Date.now()
  for (const [id, timestamp] of Object.entries(tabs)) {
    if (now - timestamp > TAB_STALE_MS) {
      delete tabs[id]
    }
  }
}

export function shouldExpireSessionAfterAbsence(): boolean {
  const lastClosed = localStorage.getItem(LAST_CLOSED_KEY)
  if (!lastClosed) {
    return false
  }

  return Date.now() - Number(lastClosed) > SESSION_TIMEOUT_MS
}

function markSessionClosed() {
  localStorage.setItem(LAST_CLOSED_KEY, String(Date.now()))
}

function clearSessionClosed() {
  localStorage.removeItem(LAST_CLOSED_KEY)
}

export function startTabSession(): () => void {
  const tabId = crypto.randomUUID()

  const heartbeat = () => {
    const tabs = readActiveTabs()
    pruneStaleTabs(tabs)
    tabs[tabId] = Date.now()
    writeActiveTabs(tabs)
    clearSessionClosed()
  }

  const unregister = () => {
    const tabs = readActiveTabs()
    delete tabs[tabId]
    writeActiveTabs(tabs)

    pruneStaleTabs(tabs)
    if (Object.keys(tabs).length === 0) {
      markSessionClosed()
    }
  }

  heartbeat()
  const interval = setInterval(heartbeat, TAB_HEARTBEAT_MS)

  window.addEventListener('pagehide', unregister)

  return () => {
    clearInterval(interval)
    window.removeEventListener('pagehide', unregister)
    unregister()
  }
}
