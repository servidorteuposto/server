import { FormEvent, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { isValidPassword, PASSWORD_RULE_MESSAGE } from '../lib/password'
import './LoginPage.css'

function FeatureIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div className="feature-bar__icon" style={{ backgroundColor: color }}>
      {children}
    </div>
  )
}

function ShieldIcon() {
  return (
    <FeatureIcon color="#0c3b7a">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2.5L5 5.75V11.25C5 15.6 8.13 19.62 12 20.5C15.87 19.62 19 15.6 19 11.25V5.75L12 2.5Z"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 12.5L11 14L14.5 10.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </FeatureIcon>
  )
}

function ChartIcon() {
  return (
    <FeatureIcon color="#4db8e8">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 4H17C18.1 4 19 4.9 19 6V18C19 19.1 18.1 20 17 20H7C5.9 20 5 19.1 5 18V6C5 4.9 5.9 4 7 4Z"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M8.5 15V17" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 11V17" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M15.5 8V17" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </FeatureIcon>
  )
}

function DropIcon() {
  return (
    <FeatureIcon color="#22c55e">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21C15.5 21 18 17.8 18 14.5C18 10.5 12 4 12 4C12 4 6 10.5 6 14.5C6 17.8 8.5 21 12 21Z"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </FeatureIcon>
  )
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="var(--gray-400)" strokeWidth="1.5" />
      <path d="M3 7L12 13L21 7" stroke="var(--gray-400)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" stroke="var(--gray-400)" strokeWidth="1.5" />
      <path
        d="M8 10V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7V10"
        stroke="var(--gray-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z"
          stroke="var(--gray-400)"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="12" r="3" stroke="var(--gray-400)" strokeWidth="1.5" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3L21 21M10.58 10.58C10.21 10.95 10 11.45 10 12C10 13.1 10.9 14 12 14C12.55 14 13.05 13.79 13.42 13.42"
        stroke="var(--gray-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9.88 5.09C10.57 5.03 11.28 5 12 5C18.5 5 22 12 22 12C21.27 13.36 20.23 14.56 19 15.5"
        stroke="var(--gray-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6.61 6.61C4.62 8.07 3.17 10.03 2 12C2 12 5.5 19 12 19C13.66 19 15.2 18.64 16.6 18"
        stroke="var(--gray-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function StoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10V20H20V10M4 10L12 4L20 10M4 10H20"
        stroke="var(--gray-400)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 20V14H15V20" stroke="var(--gray-400)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4H16L20 8V20C20 20.55 19.55 21 19 21H5C4.45 21 4 20.55 4 20V5C4 4.45 4.45 4 5 4H8Z"
        stroke="var(--gray-400)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 4V8H16" stroke="var(--gray-400)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 13H16M8 17H13" stroke="var(--gray-400)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 4H9L10.5 8.5L8.5 10C9.57 12.16 11.84 14.43 14 15.5L15.5 13.5L20 15V17.5C20 18.33 19.33 19 18.5 19C10.16 19 3 11.84 3 3.5C3 2.67 3.67 2 4.5 2H6.5V4Z"
        stroke="var(--gray-400)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

type AuthView = 'login' | 'register'

export default function LoginPage() {
  const [view, setView] = useState<AuthView>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [postoName, setPostoName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function switchView(nextView: AuthView) {
    setView(nextView)
    setError(null)
    setSuccess(null)
  }

  async function handleEmailLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (cnpj.replace(/\D/g, '').length !== 14) {
      setLoading(false)
      setError('Informe um CNPJ válido com 14 dígitos.')
      return
    }

    if (!isValidPassword(password)) {
      setLoading(false)
      setError(PASSWORD_RULE_MESSAGE)
      return
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome_posto: postoName,
          cnpj,
          telefone: phone,
        },
      },
    })

    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    setSuccess('Cadastro realizado! Verifique seu e-mail para confirmar a conta.')
  }

  return (
    <div className="login-page">
      <div className="login-page__bg" aria-hidden="true" />

      <div className="login-page__layout">
        <aside className="login-branding">
          <div className="login-branding__header">
            <img
              src="/imagens/logo_teuposto.png"
              alt="teu posto"
              className="login-branding__logo"
            />
            <p className="login-branding__tagline">MENOS PAPEL, MAIS EFICIÊNCIA</p>
          </div>

          <div className="feature-bar">
            <div className="feature-bar__item">
              <ShieldIcon />
              <div className="feature-bar__text">
                <span>Conformidade</span>
                <span>Regulatória</span>
              </div>
            </div>
            <div className="feature-bar__item">
              <ChartIcon />
              <div className="feature-bar__text">
                <span>Gestão</span>
                <span>Inteligente</span>
              </div>
            </div>
            <div className="feature-bar__item">
              <DropIcon />
              <div className="feature-bar__text">
                <span>Combustível</span>
                <span>em Conformidade</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="login-form-section">
          <div className={`login-card ${view === 'register' ? 'login-card--register' : ''}`}>
            {view === 'login' ? (
              <>
                <header className="login-card__header">
                  <h1>Bem-vindo!</h1>
                  <p>Acesse sua conta para continuar</p>
                </header>

                <form className="login-form" onSubmit={handleEmailLogin}>
                  {error && (
                    <div className="login-form__error" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="form-field">
                    <label htmlFor="email">E-mail</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <MailIcon />
                      </span>
                      <input
                        id="email"
                        type="email"
                        placeholder="Digite seu e-mail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="password">Senha</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <LockIcon />
                      </span>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Digite sua senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="form-field__toggle"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        <EyeIcon open={showPassword} />
                      </button>
                    </div>
                  </div>

                  <div className="login-form__options">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Lembrar-me</span>
                    </label>
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      Esqueci minha senha
                    </a>
                  </div>

                  <button type="submit" className="btn btn--primary" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>
                </form>

                <p className="login-card__footer">
                  Não tem uma conta?{' '}
                  <button type="button" className="login-card__link" onClick={() => switchView('register')}>
                    Cadastre-se
                  </button>
                </p>
              </>
            ) : (
              <>
                <header className="login-card__header">
                  <h1>Cadastre-se</h1>
                  <p>Preencha os dados do seu posto</p>
                </header>

                <form className="login-form login-form--register" onSubmit={handleRegister}>
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
                    <label htmlFor="posto-name">Nome completo do posto</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <StoreIcon />
                      </span>
                      <input
                        id="posto-name"
                        type="text"
                        placeholder="Digite o nome do posto"
                        value={postoName}
                        onChange={(e) => setPostoName(e.target.value)}
                        required
                        autoComplete="organization"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="cnpj">CNPJ</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <DocumentIcon />
                      </span>
                      <input
                        id="cnpj"
                        type="text"
                        placeholder="00.000.000/0000-00"
                        value={cnpj}
                        onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                        required
                        inputMode="numeric"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="phone">Telefone</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <PhoneIcon />
                      </span>
                      <input
                        id="phone"
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        required
                        autoComplete="tel"
                        inputMode="tel"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="register-email">E-mail</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <MailIcon />
                      </span>
                      <input
                        id="register-email"
                        type="email"
                        placeholder="Digite seu e-mail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="register-password">Senha</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <LockIcon />
                      </span>
                      <input
                        id="register-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Crie uma senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="form-field__toggle"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        <EyeIcon open={showPassword} />
                      </button>
                    </div>
                    <p className="form-field__hint">{PASSWORD_RULE_MESSAGE}</p>
                  </div>

                  <button type="submit" className="btn btn--primary" disabled={loading}>
                    {loading ? 'Cadastrando...' : 'Cadastrar'}
                  </button>
                </form>

                <p className="login-card__footer">
                  Já tem uma conta?{' '}
                  <button type="button" className="login-card__link" onClick={() => switchView('login')}>
                    Entrar
                  </button>
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
