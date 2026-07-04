import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import './App.css'

function App() {
  const { user, loading, isReadOnly, isAdmin, subscriptionStatus } = useAuth()

  if (loading) {
    return null
  }

  if (user) {
    return (
      <div className="app-shell">
        {isReadOnly && (
          <div className="readonly-banner" role="status">
            Sua assinatura venceu. O sistema está em modo visualização — você pode consultar os
            dados, mas não preencher ou alterar nada até renovar a assinatura.
          </div>
        )}

        <main className="app-shell__content">
          <p>Sessão ativa — {user.email}</p>
          {isAdmin && <p>Conta administrativa</p>}
          {subscriptionStatus === 'active' && !isAdmin && <p>Plano ativo</p>}
          {isReadOnly && (
            <button type="button" className="btn-renew">
              Renovar assinatura
            </button>
          )}
        </main>
      </div>
    )
  }

  return <LoginPage />
}

export default App
