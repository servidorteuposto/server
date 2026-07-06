import { useAuth } from './hooks/useAuth'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'

function App() {
  const { user, loading, isReadOnly, isAdmin } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return <AppShell user={user} isReadOnly={isReadOnly} isAdmin={isAdmin} />
  }

  return <LoginPage />
}

export default App
