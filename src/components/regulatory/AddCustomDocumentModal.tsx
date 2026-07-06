import { FormEvent, useState } from 'react'
import { isPdfFile, REGULATORY_MAX_FILE_BYTES } from '../../config/regulatory-documents'

type AddCustomDocumentModalProps = {
  open: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (payload: {
    title: string
    issuedAt: string
    expiresAt: string
    file: File
  }) => Promise<void>
}

function validateDates(issuedAt: string, expiresAt: string) {
  if (!issuedAt) return 'Informe a data de expedição.'
  if (expiresAt && expiresAt < issuedAt) {
    return 'A data de validade deve ser igual ou posterior à expedição.'
  }
  return null
}

export default function AddCustomDocumentModal({
  open,
  busy,
  onClose,
  onSubmit,
}: AddCustomDocumentModalProps) {
  const [title, setTitle] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function reset() {
    setTitle('')
    setIssuedAt('')
    setExpiresAt('')
    setFile(null)
    setError(null)
  }

  function handleClose() {
    if (busy) return
    reset()
    onClose()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Informe o título do documento.')
      return
    }

    const dateError = validateDates(issuedAt, expiresAt)
    if (dateError) {
      setError(dateError)
      return
    }

    if (!file) {
      setError('Selecione um arquivo PDF.')
      return
    }

    if (!isPdfFile(file)) {
      setError('Somente arquivos PDF são permitidos.')
      return
    }

    if (file.size > REGULATORY_MAX_FILE_BYTES) {
      setError('O PDF deve ter no máximo 10 MB.')
      return
    }

    try {
      await onSubmit({
        title: trimmedTitle,
        issuedAt,
        expiresAt,
        file,
      })
      reset()
      onClose()
    } catch {
      setError('Não foi possível adicionar o documento. Tente novamente.')
    }
  }

  return (
    <div className="reg-doc-modal" role="presentation" onClick={handleClose}>
      <div
        className="reg-doc-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-custom-doc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reg-doc-modal__header">
          <h2 id="add-custom-doc-title">Adicionar documento</h2>
          <button type="button" className="reg-doc-modal__close" onClick={handleClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <form className="reg-doc-modal__form" onSubmit={handleSubmit}>
          <label className="reg-doc-form__field">
            <span>Título do documento</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Licença ambiental complementar"
              maxLength={120}
              required
              disabled={busy}
            />
          </label>

          <div className="reg-doc-form__grid">
            <label className="reg-doc-form__field">
              <span>Data de expedição *</span>
              <input
                type="date"
                value={issuedAt}
                onChange={(event) => setIssuedAt(event.target.value)}
                required
                disabled={busy}
              />
            </label>

            <label className="reg-doc-form__field">
              <span>Data de validade (opcional)</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <label className="reg-doc-form__field reg-doc-form__field--file">
            <span>Arquivo PDF</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
              disabled={busy}
            />
            {file && <small>{file.name}</small>}
          </label>

          {error && <p className="reg-doc-form__error">{error}</p>}

          <div className="reg-doc-modal__actions">
            <button type="button" className="btn btn--secondary" onClick={handleClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Salvando...' : 'Adicionar documento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
