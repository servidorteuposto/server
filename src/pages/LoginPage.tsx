import { FormEvent, useCallback, useEffect, useState, type ReactNode } from 'react'
import PaymentForm from '../components/PaymentForm'
import { ADMIN_CNPJ_DIGITS, requestPasswordResetByIdentifier } from '../lib/auth'
import {
  cnpjDigits,
  formatCnpj,
  isValidCnpj,
  isValidCnpjLength,
  CNPJ_INVALID_MESSAGE,
  looksLikeEmail,
} from '../lib/cnpj'
import type { PaymentActivation, PaymentMethod } from '../lib/payment'
import { getPaymentActivation } from '../lib/payment'
import { isValidPassword, PASSWORD_RULE_MESSAGE } from '../lib/password'
import {
  clearPreRegistration,
  getPreRegistration,
  savePreRegistration,
} from '../lib/pre-register'
import {
  activateSubscription,
  getAccountAccessByIdentifier,
  getRegistrationConflictMessage,
  type AccountAccess,
} from '../lib/subscription'
import { getRememberedIdentifier, setRememberedIdentifier } from '../lib/session'
import { secureLogin, secureRegister } from '../lib/secure-auth'
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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

type AuthView = 'login' | 'register' | 'forgot-password' | 'payment'

export default function LoginPage() {
  const [view, setView] = useState<AuthView>('login')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [postoName, setPostoName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [forgotCnpj, setForgotCnpj] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [paymentActivation, setPaymentActivation] = useState<PaymentActivation | null>(null)
  const [preRegisterHint, setPreRegisterHint] = useState(false)
  const [pendingPaymentAlert, setPendingPaymentAlert] = useState(false)
  const [honeypot, setHoneypot] = useState('')

  useEffect(() => {
    const savedIdentifier = getRememberedIdentifier()
    if (savedIdentifier) {
      setIdentifier(savedIdentifier)
      setRememberMe(true)
    }
  }, [])

  function switchView(nextView: AuthView) {
    setView(nextView)
    setError(null)
    setSuccess(null)
    setPaymentError(null)
    setPaymentSuccess(false)
    setPaymentActivation(null)
    setPreRegisterHint(false)
    setPendingPaymentAlert(false)
  }

  function fillRegistrationFromAccess(access: AccountAccess) {
    setPostoName(access.nome ?? '')
    setCnpj(access.cnpj ?? '')
    setEmail(access.email ?? '')
    setPhone(access.telefone ?? '')
    setPassword('')

    if (access.cnpj) {
      savePreRegistration(access.cnpj, {
        postoName: access.nome ?? '',
        email: access.email ?? '',
        phone: access.telefone ?? '',
        reachedPayment: true,
      })
    }
  }

  function goToPendingPayment(access: AccountAccess) {
    fillRegistrationFromAccess(access)
    setPreRegisterHint(true)
    setPendingPaymentAlert(true)
    setView('register')
  }

  function goToPaymentFromRegister() {
    setError(null)

    if (!isValidCnpjLength(cnpj)) {
      setError('Informe um CNPJ válido para continuar o pagamento.')
      return
    }

    if (!isValidCnpj(cnpj)) {
      setError(CNPJ_INVALID_MESSAGE)
      return
    }

    persistPreRegistration(true)
    setPendingPaymentAlert(false)
    switchView('payment')
  }

  function persistPreRegistration(reachedPayment = true) {
    if (!isValidCnpjLength(cnpj)) return

    savePreRegistration(cnpj, {
      postoName,
      email,
      phone,
      reachedPayment,
    })
  }

  function handleRegisterCnpjChange(value: string) {
    const formatted = formatCnpj(value)
    setCnpj(formatted)

    if (!isValidCnpjLength(formatted)) {
      setPreRegisterHint(false)
      return
    }

    const saved = getPreRegistration(formatted)
    if (!saved) {
      setPreRegisterHint(false)
      return
    }

    setPostoName(saved.postoName)
    setEmail(saved.email)
    setPhone(saved.phone)
    setPassword('')
    setPreRegisterHint(true)
  }

  function completePayment() {
    clearPreRegistration(cnpj)
    setPaymentSuccess(true)
  }

  useEffect(() => {
    if (view === 'payment' && isValidCnpjLength(cnpj)) {
      savePreRegistration(cnpj, { postoName, email, phone, reachedPayment: true })
    }
  }, [view, cnpj, postoName, email, phone])

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setPendingPaymentAlert(false)

    try {
      const result = await secureLogin(identifier, password)

      if (!result.ok) {
        if (result.code === 'pending_payment' && result.posto) {
          goToPendingPayment({
            found: true,
            subscription_status: 'pending_payment',
            nome: result.posto.nome,
            cnpj: result.posto.cnpj,
            telefone: result.posto.telefone,
            email: result.posto.email,
          })
          return
        }

        setError(result.message)
        return
      }

      setRememberedIdentifier(rememberMe ? identifier.trim() : null)
    } catch {
      setError('Não foi possível realizar o login. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const identifier = forgotCnpj.trim()

    if (!looksLikeEmail(identifier)) {
      if (!isValidCnpjLength(identifier)) {
        setLoading(false)
        setError('Informe o e-mail ou um CNPJ com 14 dígitos.')
        return
      }

      const isAdminCnpj = cnpjDigits(identifier) === ADMIN_CNPJ_DIGITS
      if (!isAdminCnpj && !isValidCnpj(identifier)) {
        setLoading(false)
        setError(CNPJ_INVALID_MESSAGE)
        return
      }
    }

    try {
      const result = await requestPasswordResetByIdentifier(identifier)

      if (!result.sent) {
        setError('E-mail ou CNPJ não encontrado.')
        return
      }

      setSuccess('E-mail de recuperação enviado! Verifique sua caixa de entrada.')
    } catch {
      setError('Não foi possível enviar o e-mail de recuperação. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!isValidCnpjLength(cnpj)) {
      setLoading(false)
      setError('Informe um CNPJ válido com 14 dígitos.')
      return
    }

    if (!isValidCnpj(cnpj)) {
      setLoading(false)
      setError(CNPJ_INVALID_MESSAGE)
      return
    }

    if (!isValidPassword(password)) {
      setLoading(false)
      setError(PASSWORD_RULE_MESSAGE)
      return
    }

    try {
      const registerResult = await secureRegister({
        email,
        password,
        postoName,
        cnpj,
        phone,
        website: honeypot,
      })

      if (!registerResult.ok) {
        if (registerResult.code === 'pending_payment') {
          const access = await getAccountAccessByIdentifier(cnpj)
          if (access.found) {
            persistPreRegistration(true)
            setPendingPaymentAlert(false)
            switchView('payment')
            return
          }
        }

        if (registerResult.code === 'duplicate') {
          setError(getRegistrationConflictMessage('cnpj'))
          return
        }

        setError(registerResult.message)
        return
      }
    } catch {
      setLoading(false)
      setError('Não foi possível concluir o cadastro. Tente novamente.')
      return
    }

    setLoading(false)
    setPendingPaymentAlert(false)
    persistPreRegistration(true)
    switchView('payment')
  }

  async function finalizePayment(method: PaymentMethod) {
    setPaymentLoading(true)
    setPaymentError(null)

    try {
      // Integração com Stripe será implementada em seguida
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await activateSubscription(cnpj)
      completePayment()
      setPaymentActivation(getPaymentActivation(method))
    } catch {
      setPaymentError('Não foi possível confirmar o pagamento. Tente novamente.')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handlePixConfirmed = useCallback(async () => {
    try {
      await activateSubscription(cnpj)
      clearPreRegistration(cnpj)
      setPaymentSuccess(true)
      setPaymentActivation('instant')
    } catch {
      setPaymentError('Não foi possível confirmar o pagamento PIX. Tente novamente.')
    }
  }, [cnpj])

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
          <div
            className={`login-card ${
              view === 'register' || view === 'payment' ? 'login-card--register' : ''
            }`}
          >
            {view === 'login' ? (
              <>
                <header className="login-card__header">
                  <h1>Bem-vindo!</h1>
                  <p>Acesse sua conta para continuar</p>
                </header>

                <form className="login-form" onSubmit={handleLogin}>
                  {error && (
                    <div className="login-form__error" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="form-field">
                    <label htmlFor="identifier">E-mail ou CNPJ</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <MailIcon />
                      </span>
                      <input
                        id="identifier"
                        type="text"
                        placeholder="Digite seu e-mail ou CNPJ"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        required
                        autoComplete="username"
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
                    <button
                      type="button"
                      className="login-card__link login-form__forgot-link"
                      onClick={() => switchView('forgot-password')}
                    >
                      Esqueci minha senha
                    </button>
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
            ) : view === 'forgot-password' ? (
              <>
                <header className="login-card__header">
                  <h1>Esqueci minha senha</h1>
                  <p>Informe o CNPJ da sua conta para receber o e-mail de recuperação</p>
                </header>

                <form className="login-form" onSubmit={handleForgotPassword}>
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
                    <label htmlFor="forgot-cnpj">E-mail ou CNPJ</label>
                    <div className="form-field__input-wrap">
                      <span className="form-field__icon">
                        <DocumentIcon />
                      </span>
                      <input
                        id="forgot-cnpj"
                        type="text"
                        placeholder="email@exemplo.com ou CNPJ"
                        value={forgotCnpj}
                        onChange={(e) => {
                          const value = e.target.value
                          setForgotCnpj(looksLikeEmail(value) ? value : formatCnpj(value))
                        }}
                        required
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn--primary" disabled={loading}>
                    {loading ? 'Enviando...' : 'Enviar e-mail de recuperação'}
                  </button>
                </form>

                <p className="login-card__footer">
                  Lembrou a senha?{' '}
                  <button type="button" className="login-card__link" onClick={() => switchView('login')}>
                    Voltar para login
                  </button>
                </p>
              </>
            ) : view === 'payment' ? (
              <>
                <header className="login-card__header">
                  <h1>Assinatura</h1>
                  <p>Finalize o pagamento para ativar sua conta</p>
                </header>

                {paymentSuccess ? (
                  <div className="payment-success">
                    <div className="login-form__success" role="status">
                      {paymentActivation === 'pending'
                        ? 'Boleto gerado e enviado para seu e-mail! Sua conta será ativada no próximo dia útil após a confirmação do pagamento.'
                        : 'Pagamento confirmado! Sua conta foi ativada e você já pode acessar o sistema.'}
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => switchView('login')}
                    >
                      {paymentActivation === 'pending' ? 'Ir para login' : 'Acessar o sistema'}
                    </button>
                  </div>
                ) : (
                  <PaymentForm
                    postoName={postoName}
                    cnpj={cnpj}
                    email={email}
                    loading={paymentLoading}
                    error={paymentError}
                    onSubmit={finalizePayment}
                    onPixConfirmed={handlePixConfirmed}
                  />
                )}
              </>
            ) : (
              <>
                <header className="login-card__header">
                  <h1>Cadastre-se</h1>
                  <p>Preencha os dados do seu posto</p>
                </header>

                <form className="login-form login-form--register" onSubmit={handleRegister}>
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    className="form-field__honeypot"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                  />

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

                  {pendingPaymentAlert && (
                    <div className="login-form__warning" role="alert">
                      Finalize o pagamento para ativar sua conta antes de fazer login. Confira seus
                      dados abaixo e prossiga para o pagamento.
                    </div>
                  )}

                  {preRegisterHint && !pendingPaymentAlert && (
                    <div className="login-form__success" role="status">
                      Cadastro em andamento recuperado. Você pode editar os dados abaixo.
                    </div>
                  )}

                  <div className="form-field">
                    <label htmlFor="posto-name">Razão Social</label>
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
                        onChange={(e) => handleRegisterCnpjChange(e.target.value)}
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

                  {pendingPaymentAlert ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={goToPaymentFromRegister}
                    >
                      Ir para pagamento
                    </button>
                  ) : (
                    <button type="submit" className="btn btn--primary" disabled={loading}>
                      {loading ? 'Cadastrando...' : 'Cadastrar'}
                    </button>
                  )}
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
