import { FormEvent, useEffect, useState, type ReactNode } from 'react'
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_MAX_PHOTOS,
  submitSupportTicket,
  type SupportAudience,
  type SupportCategory,
  validateSupportPhotos,
} from '../lib/support-contact'
import './SupportContactForm.css'

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

const CATEGORIES: SupportCategory[] = ['duvida', 'sugestao', 'reclamacao']

export type SupportContactFormProps = {
  variant: 'login' | 'app'
  audience: SupportAudience
  defaultName?: string
  defaultEmail?: string
  defaultPhone?: string
  defaultCnpj?: string
  postoId?: string | null
  footer?: ReactNode
}

export default function SupportContactForm({
  variant,
  audience,
  defaultName = '',
  defaultEmail = '',
  defaultPhone = '',
  defaultCnpj = '',
  postoId = null,
  footer,
}: SupportContactFormProps) {
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [phone, setPhone] = useState(defaultPhone)
  const [category, setCategory] = useState<SupportCategory | ''>('')
  const [message, setMessage] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [honeypot, setHoneypot] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([])

  useEffect(() => {
    const next = photos.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }))
    setPreviews(next)
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [photos])

  function handlePhotosChange(fileList: FileList | null) {
    setError(null)
    const next = Array.from(fileList ?? [])
    const photoError = validateSupportPhotos(next)
    if (photoError) {
      setError(photoError)
      return
    }
    setPhotos(next.slice(0, SUPPORT_MAX_PHOTOS))
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!category) {
      setError('Selecione se é dúvida, sugestão ou reclamação.')
      setLoading(false)
      return
    }

    try {
      const result = await submitSupportTicket({
        audience,
        category,
        name,
        email,
        phone,
        message,
        postoId,
        photos,
        website: honeypot,
      })

      if (!result.ok) {
        setError(result.message)
        return
      }

      setSuccess(result.message)
      setCategory('')
      setMessage('')
      setPhotos([])
      if (!defaultName) setName('')
      if (!defaultEmail) setEmail('')
      if (!defaultPhone) setPhone('')
    } catch {
      setError('Não foi possível enviar sua solicitação. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const formClass =
    variant === 'login' ? 'login-form support-form support-form--login' : 'support-form support-form--app'

  const categoryField =
    variant === 'login' ? (
      <div className="form-field">
        <label htmlFor="support-category">Tipo</label>
        <select
          id="support-category"
          className="support-form__input"
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCategory | '')}
          required
        >
          <option value="">Selecione...</option>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {SUPPORT_CATEGORY_LABELS[item]}
            </option>
          ))}
        </select>
      </div>
    ) : (
      <label className="reg-doc-form__field">
        <span>Tipo</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCategory | '')}
          required
        >
          <option value="">Selecione...</option>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {SUPPORT_CATEGORY_LABELS[item]}
            </option>
          ))}
        </select>
      </label>
    )

  const photosField = (
    <div className={variant === 'login' ? 'form-field' : 'reg-doc-form__field support-form__photos'}>
      {variant === 'login' ? (
        <label htmlFor="support-photos">Prints (até {SUPPORT_MAX_PHOTOS} fotos)</label>
      ) : (
        <span>Prints (até {SUPPORT_MAX_PHOTOS} fotos)</span>
      )}
      <input
        id="support-photos"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => handlePhotosChange(e.target.files)}
      />
      <p className={variant === 'login' ? 'form-field__hint' : 'settings-hint'}>
        Opcional. JPG, PNG ou WebP, até 5 MB cada.
      </p>
      {previews.length > 0 && (
        <ul className="support-form__preview-list">
          {previews.map((item, index) => (
            <li key={`${item.name}-${index}`} className="support-form__preview-item">
              <img src={item.url} alt={`Print ${index + 1}`} />
              <button type="button" onClick={() => removePhoto(index)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <form className={formClass} onSubmit={handleSubmit}>
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
        <div className={variant === 'login' ? 'login-form__error' : 'reg-doc-form__error'} role="alert">
          {error}
        </div>
      )}

      {success && (
        <div
          className={variant === 'login' ? 'login-form__success' : 'support-form__success'}
          role="status"
        >
          {success}
        </div>
      )}

      {variant === 'login' ? (
        <>
          <div className="form-field">
            <label htmlFor="support-name">Nome</label>
            <input
              id="support-name"
              className="support-form__input"
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              maxLength={120}
            />
          </div>

          <div className="form-field">
            <label htmlFor="support-email">E-mail</label>
            <input
              id="support-email"
              className="support-form__input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              maxLength={254}
            />
          </div>

          <div className="form-field">
            <label htmlFor="support-phone">Telefone</label>
            <input
              id="support-phone"
              className="support-form__input"
              type="tel"
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              required
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          {categoryField}

          <div className="form-field">
            <label htmlFor="support-message">Mensagem</label>
            <textarea
              id="support-message"
              className="support-form__textarea"
              placeholder="Descreva sua dúvida, sugestão ou reclamação"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              maxLength={5000}
            />
          </div>

          {photosField}

          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </>
      ) : (
        <>
          <label className="reg-doc-form__field">
            <span>Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              maxLength={120}
            />
          </label>

          <label className="reg-doc-form__field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              maxLength={254}
            />
          </label>

          <label className="reg-doc-form__field">
            <span>Telefone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              required
              autoComplete="tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
            />
          </label>

          {defaultCnpj ? (
            <label className="reg-doc-form__field">
              <span>CNPJ</span>
              <input type="text" value={defaultCnpj} disabled readOnly />
            </label>
          ) : null}

          {categoryField}

          <label className="reg-doc-form__field">
            <span>Mensagem</span>
            <textarea
              className="support-form__textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={6}
              maxLength={5000}
              placeholder="Descreva sua dúvida, sugestão ou reclamação"
            />
          </label>

          {photosField}

          <div className="support-form__actions">
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </div>
        </>
      )}

      {footer}
    </form>
  )
}
