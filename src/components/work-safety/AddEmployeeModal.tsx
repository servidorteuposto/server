import { FormEvent, useState } from 'react'
import { formatCpf, formatPhone, stripCpf, validateCpf } from '../../config/work-safety'

type AddEmployeeModalProps = {
  open: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (payload: { fullName: string; cpf: string; phone: string }) => Promise<void>
}

export default function AddEmployeeModal({ open, busy, onClose, onSubmit }: AddEmployeeModalProps) {
  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function reset() {
    setFullName('')
    setCpf('')
    setPhone('')
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

    if (!fullName.trim()) {
      setError('Informe o nome do funcionário.')
      return
    }

    const cpfError = validateCpf(cpf)
    if (cpfError) {
      setError(cpfError)
      return
    }

    try {
      await onSubmit({
        fullName: fullName.trim(),
        cpf: stripCpf(cpf),
        phone: phone.replace(/\D/g, ''),
      })
      reset()
      onClose()
    } catch {
      setError('Não foi possível cadastrar o funcionário. Verifique se o CPF já está em uso.')
    }
  }

  return (
    <div className="reg-doc-modal" role="presentation" onClick={handleClose}>
      <div
        className="reg-doc-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reg-doc-modal__header">
          <h2 id="add-employee-title">Novo funcionário</h2>
          <button type="button" className="reg-doc-modal__close" onClick={handleClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <label className="reg-doc-form__field">
            <span>Nome completo *</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={busy}
              autoFocus
            />
          </label>

          <label className="reg-doc-form__field">
            <span>CPF *</span>
            <input
              type="text"
              inputMode="numeric"
              value={cpf}
              onChange={(event) => setCpf(formatCpf(event.target.value))}
              disabled={busy}
              placeholder="000.000.000-00"
            />
          </label>

          <label className="reg-doc-form__field">
            <span>Telefone</span>
            <input
              type="text"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(formatPhone(event.target.value))}
              disabled={busy}
              placeholder="(00) 00000-0000"
            />
          </label>

          {error && <p className="reg-doc-form__error">{error}</p>}

          <div className="reg-doc-modal__actions">
            <button type="button" className="btn btn--secondary" onClick={handleClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
