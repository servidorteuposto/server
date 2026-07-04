import { FormEvent, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  formatCardExpiry,
  formatCardNumber,
  generateMockPixPayload,
  PaymentMethod,
  SUBSCRIPTION_PERIOD_LABEL,
  SUBSCRIPTION_PRICE_LABEL,
} from '../lib/payment'

interface PaymentFormProps {
  postoName: string
  cnpj: string
  email: string
  loading?: boolean
  error?: string | null
  onSubmit: (method: PaymentMethod) => void
  onPixConfirmed: () => void
}

function CreditCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 10H22" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 15H10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function BoletoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5H20V19H4V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 8V16M10 8V16M13 8V16M16 8V16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function PixIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 8.5L4 13L8.5 17.5M15.5 8.5L20 13L15.5 17.5M13 6L11 20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: typeof CreditCardIcon }[] = [
  { id: 'card', label: 'Cartão', icon: CreditCardIcon },
  { id: 'boleto', label: 'Boleto', icon: BoletoIcon },
  { id: 'pix', label: 'PIX', icon: PixIcon },
]

export default function PaymentForm({
  postoName,
  cnpj,
  email,
  loading = false,
  error = null,
  onSubmit,
  onPixConfirmed,
}: PaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>('card')
  const [cardNumber, setCardNumber] = useState('')
  const [cardName, setCardName] = useState(postoName)
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [holderName, setHolderName] = useState(postoName)
  const [holderDocument, setHolderDocument] = useState(cnpj)
  const [pixCode, setPixCode] = useState('')
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null)
  const [pixWaiting, setPixWaiting] = useState(false)
  const [pixCopied, setPixCopied] = useState(false)

  useEffect(() => {
    if (method !== 'pix') {
      setPixWaiting(false)
      return
    }

    let cancelled = false
    const payload = generateMockPixPayload(email, cnpj)

    async function setupPix() {
      setPixCode(payload)
      setPixWaiting(true)
      setPixCopied(false)

      try {
        const qr = await QRCode.toDataURL(payload, {
          width: 200,
          margin: 1,
          color: { dark: '#0c3b7a', light: '#ffffff' },
        })

        if (!cancelled) {
          setPixQrDataUrl(qr)
        }
      } catch {
        if (!cancelled) {
          setPixQrDataUrl(null)
        }
      }
    }

    setupPix()

    // Simula confirmação automática via webhook após pagamento PIX
    const confirmTimer = window.setTimeout(() => {
      if (!cancelled) {
        setPixWaiting(false)
        onPixConfirmed()
      }
    }, 4000)

    return () => {
      cancelled = true
      window.clearTimeout(confirmTimer)
    }
  }, [method, email, cnpj, onPixConfirmed])

  async function handleCopyPixCode() {
    if (!pixCode) return

    try {
      await navigator.clipboard.writeText(pixCode)
      setPixCopied(true)
      window.setTimeout(() => setPixCopied(false), 2000)
    } catch {
      setPixCopied(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (method !== 'pix') {
      onSubmit(method)
    }
  }

  return (
    <form className="login-form payment-form" onSubmit={handleSubmit}>
      {error && (
        <div className="login-form__error" role="alert">
          {error}
        </div>
      )}

      <div className="payment-summary">
        <div className="payment-summary__row">
          <span>Plano mensal</span>
          <strong>{SUBSCRIPTION_PRICE_LABEL}</strong>
        </div>
        <p className="payment-summary__period">{SUBSCRIPTION_PERIOD_LABEL}</p>
      </div>

      <div className="form-field">
        <span className="form-field__label">Forma de pagamento</span>
        <div className="payment-methods" role="radiogroup" aria-label="Forma de pagamento">
          {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={method === id}
              className={`payment-method ${method === id ? 'payment-method--active' : ''}`}
              onClick={() => setMethod(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {method === 'card' && (
        <>
          <p className="payment-form__info payment-form__info--instant">
            Ativação instantânea após a confirmação do pagamento.
          </p>

          <div className="form-field">
            <label htmlFor="card-number">Número do cartão</label>
            <input
              id="card-number"
              type="text"
              className="form-field__input"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              required
              inputMode="numeric"
              autoComplete="cc-number"
            />
          </div>

          <div className="form-field">
            <label htmlFor="card-name">Nome no cartão</label>
            <input
              id="card-name"
              type="text"
              className="form-field__input"
              placeholder="Como impresso no cartão"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              required
              autoComplete="cc-name"
            />
          </div>

          <div className="payment-form__row">
            <div className="form-field">
              <label htmlFor="card-expiry">Validade</label>
              <input
                id="card-expiry"
                type="text"
                className="form-field__input"
                placeholder="MM/AA"
                value={cardExpiry}
                onChange={(e) => setCardExpiry(formatCardExpiry(e.target.value))}
                required
                inputMode="numeric"
                autoComplete="cc-exp"
              />
            </div>
            <div className="form-field">
              <label htmlFor="card-cvv">CVV</label>
              <input
                id="card-cvv"
                type="text"
                className="form-field__input"
                placeholder="000"
                value={cardCvv}
                onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
                inputMode="numeric"
                autoComplete="cc-csc"
              />
            </div>
          </div>
        </>
      )}

      {method === 'boleto' && (
        <>
          <p className="payment-form__info">
            O boleto será enviado para seu e-mail. A ativação ocorre no próximo dia útil após a
            confirmação do pagamento.
          </p>

          <div className="form-field">
            <label htmlFor="boleto-name">Razão social / Nome</label>
            <input
              id="boleto-name"
              type="text"
              className="form-field__input"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="boleto-document">CNPJ / CPF</label>
            <input
              id="boleto-document"
              type="text"
              className="form-field__input"
              value={holderDocument}
              onChange={(e) => setHolderDocument(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="boleto-email">E-mail para envio do boleto</label>
            <input
              id="boleto-email"
              type="email"
              className="form-field__input form-field__input--readonly"
              value={email}
              readOnly
            />
          </div>
        </>
      )}

      {method === 'pix' && (
        <div className="pix-payment">
          <p className="payment-form__info payment-form__info--instant">
            Escaneie o QR Code ou copie o código abaixo. A ativação é instantânea após o pagamento.
          </p>

          <div className="pix-payment__qr-wrap">
            {pixQrDataUrl ? (
              <img src={pixQrDataUrl} alt="QR Code PIX" className="pix-payment__qr" />
            ) : (
              <div className="pix-payment__qr-loading">Gerando QR Code...</div>
            )}
          </div>

          <div className="pix-payment__amount">
            Valor: <strong>{SUBSCRIPTION_PRICE_LABEL}</strong>
          </div>

          <div className="pix-payment__copy">
            <input
              type="text"
              className="form-field__input pix-payment__code"
              value={pixCode}
              readOnly
              aria-label="Código PIX copia e cola"
            />
            <button type="button" className="btn btn--secondary" onClick={handleCopyPixCode}>
              {pixCopied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>

          {pixWaiting && (
            <p className="pix-payment__status" role="status">
              <span className="pix-payment__pulse" aria-hidden="true" />
              Aguardando confirmação do pagamento...
            </p>
          )}
        </div>
      )}

      {method !== 'pix' && (
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading
            ? 'Processando...'
            : method === 'boleto'
              ? 'Gerar boleto'
              : `Pagar ${SUBSCRIPTION_PRICE_LABEL}`}
        </button>
      )}
    </form>
  )
}
