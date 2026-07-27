import { useAuth } from './hooks/useAuth'
import AppShell from './components/AppShell'
import CookieConsent from './components/CookieConsent'
import LoginPage from './pages/LoginPage'
import PublicPostoPage from './pages/PublicPostoPage'
import ImpersonatePage from './pages/ImpersonatePage'
import LegalPage from './pages/LegalPage'
import { getLegalDocument, type LegalDocId } from './config/legal'

function getPublicSlugFromPath() {
  const match = window.location.pathname.match(/^\/p\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

function isImpersonatePath() {
  return /^\/impersonate\/?$/.test(window.location.pathname)
}

function getLegalDocIdFromPath(): LegalDocId | null {
  const match = window.location.pathname.match(/^\/legal\/([^/]+)\/?$/)
  if (!match) return null
  const doc = getLegalDocument(match[1])
  return doc?.id ?? null
}

function App() {
  const publicSlug = getPublicSlugFromPath()
  const legalDocId = getLegalDocIdFromPath()
  const { user, loading, isReadOnly, isAdmin } = useAuth()

  if (legalDocId) {
    return (
      <>
        <LegalPage docId={legalDocId} />
        <CookieConsent />
      </>
    )
  }

  if (isImpersonatePath()) {
    return <ImpersonatePage />
  }

  if (publicSlug) {
    return (
      <>
        <PublicPostoPage slug={publicSlug} />
        <CookieConsent />
      </>
    )
  }

  if (loading) {
    return null
  }

  if (user) {
    return (
      <>
        <AppShell user={user} isReadOnly={isReadOnly} isAdmin={isAdmin} />
        <CookieConsent />
      </>
    )
  }

  return (
    <>
      <LoginPage />
      <CookieConsent />
    </>
  )
}

export default App
