import { FormEvent, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  fetchAddressByCep,
  formatCep,
  stripCep,
} from '../config/posto-settings'
import {
  createBoletoPayment,
  createCardCheckout,
  createPixPayment,
  getMpPaymentStatus,
  getMpSubscriptionStatus,
  type CardBillingChoice,
} from '../lib/mercadopago'
import {
  PaymentMethod,
  SUBSCRIPTION_PERIOD_LABEL,
  SUBSCRIPTION_PRICE_LABEL,
} from '../lib/payment'

export type PaymentFormOutcome =
  | { kind: 'activated'; activation: 'instant' | 'pending' }
  | { kind: 'redirect' }

interface PaymentFormProps {
  postoName: string
  cnpj: string
  email: string
  loading?: boolean
  error?: string | null
  onBusy?: (busy: boolean) => void
  onError?: (message: string | null) => void
  onActivated: (activation: 'instant' | 'pending') => void
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
  onBusy,
  onError,
  onActivated,
}: PaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [cardBilling, setCardBilling] = useState<CardBillingChoice>('once')
  const [localBusy, setLocalBusy] = useState(false)
  const [pixCode, setPixCode] = useState('')
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null)
  const [pixPaymentId, setPixPaymentId] = useState<string | null>(null)
  const [pixWaiting, setPixWaiting] = useState(false)
  const [pixCopied, setPixCopied] = useState(false)
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null)
  const [boletoLine, setBoletoLine] = useState<string | null>(null)
  const [boletoReady, setBoletoReady] = useState(false)
  const [boletoCep, setBoletoCep] = useState('')
  const [boletoStreet, setBoletoStreet] = useState('')
  const [boletoNumber, setBoletoNumber] = useState('')
  const [boletoNeighborhood, setBoletoNeighborhood] = useState('')
  const [boletoCity, setBoletoCity] = useState('')
  const [boletoUf, setBoletoUf] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const pollRef = useRef<number | null>(null)

  const busy = loading || localBusy

  function setBusy(value: boolean) {
    setLocalBusy(value)
    onBusy?.(value)
  }

  function setErr(message: string | null) {
    onError?.(message)
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    if (method !== 'pix') {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    let cancelled = false

    async function setupPix() {
      setBusy(true)
      setErr(null)
      setPixWaiting(false)
      setPixCode('')
      setPixQrDataUrl(null)
      setPixPaymentId(null)

      try {
        const result = await createPixPayment({ cnpj, email, nome: postoName })
        if (cancelled) return

        const code = result.qr_code ?? ''
        setPixPaymentId(result.payment_id ?? null)
        setPixCode(code)
        setPixWaiting(true)

        if (result.qr_code_base64) {
          setPixQrDataUrl(`data:image/png;base64,${result.qr_code_base64}`)
        } else if (code) {
          const qr = await QRCode.toDataURL(code, {
            width: 200,
            margin: 1,
            color: { dark: '#0c3b7a', light: '#ffffff' },
          })
          if (!cancelled) setPixQrDataUrl(qr)
        }

        if (result.payment_id) {
          pollRef.current = window.setInterval(() => {
            void checkPixStatus(result.payment_id!)
          }, 4000)
        }
      } catch (err) {
        if (!cancelled) {
          setErr(err instanceof Error ? err.message : 'Falha ao gerar PIX.')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void setupPix()

    return () => {
      cancelled = true
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, cnpj, email, postoName])

  async function checkPixStatus(paymentId: string) {
    try {
      const status = await getMpPaymentStatus({ cnpj, email, payment_id: paymentId })
      if (status.approved) {
        if (pollRef.current) {
          window.clearInterval(pollRef.current)
          pollRef.current = null
        }
        setPixWaiting(false)
        // Confirma ativação no banco (webhook pode já ter rodado)
        const sub = await getMpSubscriptionStatus({ cnpj, email })
        if (sub.activated) {
          onActivated('instant')
        } else {
          // Aguarda webhook processar
          window.setTimeout(async () => {
            const again = await getMpSubscriptionStatus({ cnpj, email })
            if (again.activated) onActivated('instant')
            else setErr('Pagamento recebido. Se o acesso não liberar em instantes, atualize a página.')
          }, 2500)
        }
      }
    } catch {
      // silencioso no polling
    }
  }

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

  async function lookupBoletoCep(value: string) {
    const digits = stripCep(value)
    setBoletoCep(formatCep(digits))
    if (digits.length !== 8) return

    setCepLoading(true)
    try {
      const data = await fetchAddressByCep(digits)
      if (!data) {
        setErr('CEP não encontrado. Preencha o endereço manualmente.')
        return
      }
      setErr(null)
      setBoletoStreet(data.logradouro ?? '')
      setBoletoNeighborhood(data.bairro ?? '')
      setBoletoCity(data.localidade ?? '')
      setBoletoUf((data.uf ?? '').toUpperCase())
    } catch {
      setErr('Não foi possível consultar o CEP. Preencha o endereço manualmente.')
    } finally {
      setCepLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErr(null)
    setBusy(true)

    try {
      if (method === 'boleto') {
        const zip = stripCep(boletoCep)
        const street = boletoStreet.trim()
        const number = boletoNumber.trim()
        const neighborhood = boletoNeighborhood.trim()
        const city = boletoCity.trim()
        const uf = boletoUf.trim().toUpperCase()

        if (zip.length !== 8 || !street || !number || !neighborhood || !city || uf.length !== 2) {
          setErr('Preencha CEP, rua, número, bairro, cidade e UF para gerar o boleto.')
          return
        }

        const result = await createBoletoPayment({
          cnpj,
          email,
          nome: postoName,
          address: {
            zip_code: zip,
            street_name: street,
            street_number: number,
            neighborhood,
            city,
            federal_unit: uf,
          },
        })
        setBoletoUrl(result.ticket_url ?? null)
        setBoletoLine(result.digitable_line ?? result.barcode ?? null)
        setBoletoReady(true)
        onActivated('pending')
        return
      }

      if (method === 'card') {
        const result = await createCardCheckout({
          cnpj,
          email,
          nome: postoName,
          billing: cardBilling,
        })
        window.location.assign(result.init_point!)
        return
      }

      if (method === 'pix' && pixPaymentId) {
        await checkPixStatus(pixPaymentId)
      }
    } catch (err) {
      setErr(err instanceof Error ? err.message : 'Não foi possível processar o pagamento.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login-form payment-form" onSubmit={(e) => void handleSubmit(e)}>
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
              onClick={() => {
                setMethod(id)
                setBoletoReady(false)
                setErr(null)
              }}
              disabled={busy}
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
            Você será redirecionado ao Mercado Pago para pagar com segurança.
          </p>
          <div className="payment-methods" role="radiogroup" aria-label="Tipo de cobrança no cartão">
            <button
              type="button"
              role="radio"
              aria-checked={cardBilling === 'once'}
              className={`payment-method ${cardBilling === 'once' ? 'payment-method--active' : ''}`}
              onClick={() => setCardBilling('once')}
              disabled={busy}
            >
              <span>Único</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={cardBilling === 'recurring'}
              className={`payment-method ${cardBilling === 'recurring' ? 'payment-method--active' : ''}`}
              onClick={() => setCardBilling('recurring')}
              disabled={busy}
            >
              <span>Recorrente</span>
            </button>
          </div>
          <p className="payment-form__info">
            {cardBilling === 'recurring'
              ? 'Cobrança automática a cada 30 dias. Você também receberá lembretes no app.'
              : 'Pagamento único de 30 dias. Renove manualmente ao vencer.'}
          </p>
        </>
      )}

      {method === 'boleto' && !boletoReady && (
        <>
          <p className="payment-form__info">
            O acesso é liberado quando o boleto for compensado (geralmente no próximo dia útil).
            Informe o endereço do posto para emitir o boleto registrado.
          </p>
          <div className="payment-form__address">
            <label className="form-field">
              <span className="form-field__label">CEP</span>
              <input
                type="text"
                className="form-field__input"
                inputMode="numeric"
                value={boletoCep}
                onChange={(event) => void lookupBoletoCep(event.target.value)}
                disabled={busy || cepLoading}
                placeholder="00000-000"
                required
              />
              {cepLoading && <small className="payment-form__hint">Consultando CEP...</small>}
            </label>
            <label className="form-field">
              <span className="form-field__label">Rua / logradouro</span>
              <input
                type="text"
                className="form-field__input"
                value={boletoStreet}
                onChange={(event) => setBoletoStreet(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <div className="payment-form__row">
              <label className="form-field">
                <span className="form-field__label">Número</span>
                <input
                  type="text"
                  className="form-field__input"
                  value={boletoNumber}
                  onChange={(event) => setBoletoNumber(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">UF</span>
                <input
                  type="text"
                  className="form-field__input"
                  value={boletoUf}
                  onChange={(event) => setBoletoUf(event.target.value.toUpperCase().slice(0, 2))}
                  disabled={busy}
                  maxLength={2}
                  required
                />
              </label>
            </div>
            <label className="form-field">
              <span className="form-field__label">Bairro</span>
              <input
                type="text"
                className="form-field__input"
                value={boletoNeighborhood}
                onChange={(event) => setBoletoNeighborhood(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">Cidade</span>
              <input
                type="text"
                className="form-field__input"
                value={boletoCity}
                onChange={(event) => setBoletoCity(event.target.value)}
                disabled={busy}
                required
              />
            </label>
          </div>
        </>
      )}

      {method === 'boleto' && boletoReady && (
        <div className="pix-payment">
          <p className="payment-form__info">
            Boleto gerado. Após a compensação, sua conta será ativada automaticamente.
          </p>
          {boletoLine && (
            <div className="pix-payment__copy">
              <input
                type="text"
                className="form-field__input pix-payment__code"
                value={boletoLine}
                readOnly
                aria-label="Linha digitável do boleto"
              />
            </div>
          )}
          {boletoUrl && (
            <a className="btn btn--secondary" href={boletoUrl} target="_blank" rel="noreferrer">
              Abrir boleto
            </a>
          )}
        </div>
      )}

      {method === 'pix' && (
        <div className="pix-payment">
          <p className="payment-form__info payment-form__info--instant">
            Escaneie o QR Code ou copie o código. O acesso libera automaticamente após o pagamento.
          </p>

          <div className="pix-payment__qr-wrap">
            {pixQrDataUrl ? (
              <img src={pixQrDataUrl} alt="QR Code PIX" className="pix-payment__qr" />
            ) : (
              <div className="pix-payment__qr-loading">
                {busy ? 'Gerando QR Code...' : 'Não foi possível gerar o QR Code.'}
              </div>
            )}
          </div>

          <div className="pix-payment__amount">
            Valor: <strong>{SUBSCRIPTION_PRICE_LABEL}</strong>
          </div>

          {pixCode && (
            <div className="pix-payment__copy">
              <input
                type="text"
                className="form-field__input pix-payment__code"
                value={pixCode}
                readOnly
                aria-label="Código PIX copia e cola"
              />
              <button type="button" className="btn btn--secondary" onClick={() => void handleCopyPixCode()}>
                {pixCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          )}

          {pixWaiting && (
            <p className="pix-payment__status" role="status">
              <span className="pix-payment__pulse" aria-hidden="true" />
              Aguardando confirmação do pagamento...
            </p>
          )}

          {pixPaymentId && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => void checkPixStatus(pixPaymentId)}
            >
              Já paguei — verificar
            </button>
          )}
        </div>
      )}

      {method !== 'pix' && !boletoReady && (
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy
            ? 'Processando...'
            : method === 'boleto'
              ? 'Gerar boleto'
              : cardBilling === 'recurring'
                ? `Assinar ${SUBSCRIPTION_PRICE_LABEL}/mês`
                : `Pagar ${SUBSCRIPTION_PRICE_LABEL}`}
        </button>
      )}
    </form>
  )
}
