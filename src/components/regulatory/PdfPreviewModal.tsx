import type { ReactNode } from 'react'

type PdfPreviewModalProps = {
  open: boolean
  title: string
  url: string | null
  loading: boolean
  error: string | null
  onClose: () => void
}

export default function PdfPreviewModal({
  open,
  title,
  url,
  loading,
  error,
  onClose,
}: PdfPreviewModalProps) {
  if (!open) return null

  return (
    <div className="reg-doc-modal reg-doc-preview" role="presentation" onClick={onClose}>
      <div
        className="reg-doc-preview__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reg-doc-preview__header">
          <h2 id="pdf-preview-title">{title}</h2>
          <button type="button" className="reg-doc-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="reg-doc-preview__body">
          {loading && <p className="reg-doc-preview__status">Carregando documento...</p>}
          {error && <p className="reg-doc-form__error">{error}</p>}
          {!loading && !error && url && (
            <iframe
              className="reg-doc-preview__frame"
              src={url}
              title={title}
              loading="lazy"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function DocumentActionIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="reg-doc-card__icon-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export { IconDownload, IconEye }
