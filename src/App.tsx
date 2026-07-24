import { useAuth } from './hooks/useAuth'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import PublicPostoPage from './pages/PublicPostoPage'
import ImpersonatePage from './pages/ImpersonatePage'

function getPublicSlugFromPath() {
  const match = window.location.pathname.match(/^\/p\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

function isImpersonatePath() {
  return /^\/impersonate\/?$/.test(window.location.pathname)
}

function App() {
  const publicSlug = getPublicSlugFromPath()
  const { user, loading, isReadOnly, isAdmin } = useAuth()

  if (isImpersonatePath()) {
    return <ImpersonatePage />
  }

  if (publicSlug) {
    return <PublicPostoPage slug={publicSlug} />
  }

  if (loading) {
    return null
  }

  if (user) {
    return <AppShell user={user} isReadOnly={isReadOnly} isAdmin={isAdmin} />
  }

  return <LoginPage />
}

export default App
