import { FormEvent, useState } from 'react'
import { isValidPassword, PASSWORD_RULE_MESSAGE } from '../lib/password'
import { clearPasswordRecoveryFlag, cleanRecoveryParamsFromUrl } from '../lib/password-recovery'
import { supabase } from '../lib/supabase'
import './LoginPage.css'

type Props = {
  onCompleted: () => void
}

function translatePasswordUpdateError(message: string | undefined) {
  const normalized = (message ?? '').toLowerCase()

  if (normalized.includes('different from the old password')) {
    return 'A nova senha deve ser diferente da senha atual.'
  }
  if (normalized.includes('same as the old password') || normalized.includes('same password')) {
    return 'A nova senha deve ser diferente da senha atual.'
  }
  if (normalized.includes('password should be at least')) {
    return 'A senha deve ter no mínimo 6 caracteres.'
  }
  if (normalized.includes('weak') || normalized.includes('not strong enough')) {
    return PASSWORD_RULE_MESSAGE
  }
  if (normalized.includes('session') || normalized.includes('expired') || normalized.includes('jwt')) {
    return 'Link de recuperação expirado ou inválido. Solicite um novo e-mail.'
  }

  return message?.trim() || 'Não foi possível atualizar a senha.'
}

export default function ResetPasswordPage({ onCompleted }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!isValidPassword(password)) {
      setError(PASSWORD_RULE_MESSAGE)
      return
    }

    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(translatePasswordUpdateError(updateError.message))
        return
      }

      try {
        await supabase.rpc('security_clear_my_login_lockout')
      } catch {
        // ignora falha de desbloqueio
      }

      clearPasswordRecoveryFlag()
      cleanRecoveryParamsFromUrl()
      setSuccess('Senha atualizada com sucesso. Entrando no painel…')
      window.setTimeout(() => onCompleted(), 700)
    } catch {
      setError('Não foi possível atualizar a senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page login-page--focused">
      <div className="login-page__bg" aria-hidden="true" />
      <div className="login-page__layout login-page__layout--focused">
        <aside className="login-branding">
          <div className="login-branding__header">
            <img
              src="/imagens/logo_teuposto.png"
              alt="teu posto"
              className="login-branding__logo"
            />
            <p className="login-branding__tagline">MENOS PAPEL, MAIS EFICIÊNCIA</p>
          </div>
        </aside>

        <main className="login-form-section">
          <div className="login-card">
            <header className="login-card__header">
              <h1>Nova senha</h1>
              <p>Defina uma nova senha para liberar o acesso à sua conta</p>
            </header>

            <form className="login-form" onSubmit={handleSubmit}>
              {error && (
                <div className="login-form__error" role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div className="login-form__success" role="status">
                  {success}
                </div>
              )}

              <div className="form-field">
                <label htmlFor="new-password">Nova senha</label>
                <div className="form-field__input-wrap">
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Digite a nova senha"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                <p className="form-field__hint">{PASSWORD_RULE_MESSAGE}</p>
              </div>

              <div className="form-field">
                <label htmlFor="confirm-password">Confirmar senha</label>
                <div className="form-field__input-wrap">
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}
