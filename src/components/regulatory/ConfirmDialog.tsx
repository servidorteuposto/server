type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="reg-doc-modal" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="reg-doc-modal__dialog reg-doc-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reg-doc-modal__header">
          <h2 id="confirm-dialog-title">{title}</h2>
        </header>

        <p id="confirm-dialog-message" className="reg-doc-confirm__message">
          {message}
        </p>

        <div className="reg-doc-modal__actions reg-doc-confirm__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Removendo...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
