import { FormEvent, useEffect, useState } from 'react'
import type { RegulatoryDocument } from '../../lib/regulatory-documents'
import {
  DocumentActionIconButton,
  IconDownload,
  IconEye,
} from './PdfPreviewModal'
import {
  EXPIRY_STATUS_LABELS,
  formatDatePtBr,
  getDocumentExpiryStatus,
  isPdfFile,
  NO_EXPIRY_LABEL,
  REGULATORY_MAX_FILE_BYTES,
} from '../../config/regulatory-documents'
import { formatFileSize } from '../../lib/pdf-compress'

type DocumentUploadCardProps = {
  title: string
  document: RegulatoryDocument | null
  isReadOnly: boolean
  busy: boolean
  onSave: (payload: {
    issuedAt: string
    expiresAt: string
    file: File
  }) => Promise<void>
  onPreview: (document: RegulatoryDocument) => void
  onDownload: (document: RegulatoryDocument) => void
  actionBusy?: boolean
}

function validateDates(issuedAt: string, expiresAt: string) {
  if (!issuedAt) return 'Informe a data de expedição.'
  if (expiresAt && expiresAt < issuedAt) {
    return 'A data de validade deve ser igual ou posterior à expedição.'
  }
  return null
}

export default function DocumentUploadCard({
  title,
  document,
  isReadOnly,
  busy,
  onSave,
  onPreview,
  onDownload,
  actionBusy = false,
}: DocumentUploadCardProps) {
  const [issuedAt, setIssuedAt] = useState(document?.issued_at ?? '')
  const [expiresAt, setExpiresAt] = useState(document?.expires_at ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [replacing, setReplacing] = useState(!document)

  useEffect(() => {
    setIssuedAt(document?.issued_at ?? '')
    setExpiresAt(document?.expires_at ?? '')
    setFile(null)
    setReplacing(!document)
    setError(null)
  }, [document])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const dateError = validateDates(issuedAt, expiresAt)
    if (dateError) {
      setError(dateError)
      return
    }

    if (!file && !document) {
      setError('Selecione um arquivo PDF.')
      return
    }

    if (!file && document && !replacing) {
      setError('Selecione o novo PDF para substituir.')
      return
    }

    if (file) {
      if (!isPdfFile(file)) {
        setError('Somente arquivos PDF são permitidos.')
        return
      }
      if (file.size > REGULATORY_MAX_FILE_BYTES) {
        setError('O PDF deve ter no máximo 10 MB.')
        return
      }
    }

    if (!file) return

    try {
      await onSave({ issuedAt, expiresAt, file })
      setFile(null)
      setReplacing(false)
    } catch {
      setError('Não foi possível salvar o documento. Tente novamente.')
    }
  }

  const expiryStatus = document ? getDocumentExpiryStatus(document.expires_at) : null

  return (
    <article className="reg-doc-card">
      <header className="reg-doc-card__header">
        <h3>{title}</h3>
        <div className="reg-doc-card__header-actions">
          {document && expiryStatus && (
            <span className={`reg-doc-card__badge reg-doc-card__badge--${expiryStatus}`}>
              {EXPIRY_STATUS_LABELS[expiryStatus]}
            </span>
          )}
          {document && !replacing && (
            <>
              <DocumentActionIconButton
                label="Visualizar documento"
                onClick={() => onPreview(document)}
                disabled={actionBusy}
              >
                <IconEye />
              </DocumentActionIconButton>
              <DocumentActionIconButton
                label="Baixar documento original"
                onClick={() => onDownload(document)}
                disabled={actionBusy}
              >
                <IconDownload />
              </DocumentActionIconButton>
            </>
          )}
        </div>
      </header>

      {document && !replacing ? (
        <div className="reg-doc-card__filled">
          <dl className="reg-doc-card__meta">
            <div>
              <dt>Arquivo</dt>
              <dd>{document.file_name}</dd>
            </div>
            <div>
              <dt>Tamanho original</dt>
              <dd>{formatFileSize(document.file_size)}</dd>
            </div>
            <div>
              <dt>Expedição</dt>
              <dd>{formatDatePtBr(document.issued_at)}</dd>
            </div>
            <div>
              <dt>Validade</dt>
              <dd>
                {document.expires_at ? formatDatePtBr(document.expires_at) : NO_EXPIRY_LABEL}
              </dd>
            </div>
          </dl>

          {!isReadOnly && (
            <div className="reg-doc-card__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setReplacing(true)}>
                Substituir
              </button>
            </div>
          )}
        </div>
      ) : (
        !isReadOnly && (
          <form className="reg-doc-card__form" onSubmit={handleSubmit}>
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
              <span>Arquivo PDF (máx. 10 MB)</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={busy}
              />
              {file && <small>{file.name}</small>}
            </label>

            {error && <p className="reg-doc-form__error">{error}</p>}

            <div className="reg-doc-card__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Salvando...' : document ? 'Salvar substituição' : 'Anexar PDF'}
              </button>
              {document && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setReplacing(false)
                    setFile(null)
                    setError(null)
                  }}
                  disabled={busy}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )
      )}

      {!document && isReadOnly && (
        <p className="reg-doc-card__empty">Nenhum documento anexado.</p>
      )}
    </article>
  )
}
