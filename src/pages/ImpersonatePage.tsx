import { useEffect, useState } from 'react'
import { startImpersonateMode, supabase } from '../lib/supabase'
import './LoginPage.css'

export default function ImpersonatePage() {
  const [message, setMessage] = useState('Abrindo a conta do usuário...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token')
      const label = params.get('label') || 'Conta do usuário'

      if (!tokenHash) {
        setError('Link de acesso inválido.')
        return
      }

      startImpersonateMode(label)

      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      })

      if (cancelled) return

      if (otpError) {
        setError(otpError.message || 'Não foi possível abrir a conta do usuário.')
        return
      }

      setMessage('Conta aberta. Redirecionando...')
      window.location.replace('/')
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="login-page">
      <div className="login-page__bg" aria-hidden="true" />
      <div className="login-page__layout" style={{ justifyContent: 'center' }}>
        <main className="login-form-section">
          <div className="login-card">
            <header className="login-card__header">
              <h1>Acesso administrativo</h1>
              <p>{error ? 'Falha ao entrar' : message}</p>
            </header>
            {error && (
              <div className="login-form__error" role="alert">
                {error}
              </div>
            )}
            {error && (
              <button type="button" className="btn btn--primary" onClick={() => window.close()}>
                Fechar aba
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
