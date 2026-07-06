import { FormEvent, useEffect, useState } from 'react'
import {
  formatCpf,
  formatDatePtBr,
  formatPhone,
  IDENTITY_KIND_LABELS,
  isPdfFile,
  stripCpf,
  TRAINING_TYPE_LABELS,
  validateCpf,
  WORK_SAFETY_MAX_FILE_BYTES,
  type IdentityDocumentKind,
  type TrainingType,
} from '../../config/work-safety'
import {
  deleteEmployeeAso,
  downloadEmployeeFile,
  getEmployeeFilePreviewPath,
  getEmployeeFileUrl,
  getEmployeeIdentity,
  listEmployeeAsos,
  saveEmployeeAso,
  saveEmployeeIdentity,
  saveEmployeeTraining,
  updateEmployee,
  type WorkSafetyEmployeeAso,
  type WorkSafetyEmployeeIdentity,
  type WorkSafetyEmployeeTraining,
  type WorkSafetyEmployeeWithTrainings,
} from '../../lib/work-safety-employees'
import { formatFileSize } from '../../lib/pdf-compress'
import ConfirmDialog from '../regulatory/ConfirmDialog'
import {
  DocumentActionIconButton,
  IconDownload,
  IconEye,
} from '../regulatory/PdfPreviewModal'

type ProfileTab = 'dados' | 'treinamentos' | 'asos' | 'epis' | 'documentos'

type EmployeeProfileModalProps = {
  open: boolean
  postoId: string
  employee: WorkSafetyEmployeeWithTrainings | null
  isReadOnly: boolean
  onClose: () => void
  onUpdated: (employee: WorkSafetyEmployeeWithTrainings) => void
  onPreview: (title: string, urlPromise: Promise<string>) => void
}

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'dados', label: 'Dados' },
  { id: 'treinamentos', label: 'Treinamentos' },
  { id: 'asos', label: 'ASOs' },
  { id: 'epis', label: 'EPIs' },
  { id: 'documentos', label: 'Documentos' },
]

function validateDates(issuedAt: string, expiresAt: string, expiresOptional = true) {
  if (!issuedAt) return 'Informe a data de expedição.'
  if (!expiresOptional && !expiresAt) return 'Informe a data de validade.'
  if (expiresAt && expiresAt < issuedAt) {
    return 'A data de validade deve ser igual ou posterior à expedição.'
  }
  return null
}

export default function EmployeeProfileModal({
  open,
  postoId,
  employee,
  isReadOnly,
  onClose,
  onUpdated,
  onPreview,
}: EmployeeProfileModalProps) {
  const [tab, setTab] = useState<ProfileTab>('dados')
  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [epiDescription, setEpiDescription] = useState('')
  const [asos, setAsos] = useState<WorkSafetyEmployeeAso[]>([])
  const [identity, setIdentity] = useState<WorkSafetyEmployeeIdentity | null>(null)
  const [nr20, setNr20] = useState<WorkSafetyEmployeeTraining | null>(null)
  const [nr35, setNr35] = useState<WorkSafetyEmployeeTraining | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteAsoTarget, setDeleteAsoTarget] = useState<WorkSafetyEmployeeAso | null>(null)

  useEffect(() => {
    if (!employee) return

    setTab('dados')
    setFullName(employee.full_name)
    setCpf(formatCpf(employee.cpf))
    setPhone(employee.phone ? formatPhone(employee.phone) : '')
    setEpiDescription(employee.epi_description)
    setNr20(employee.nr20)
    setNr35(employee.nr35)
    setError(null)

    listEmployeeAsos(employee.id)
      .then(setAsos)
      .catch(() => setAsos([]))

    getEmployeeIdentity(employee.id)
      .then(setIdentity)
      .catch(() => setIdentity(null))
  }, [employee])

  if (!open || !employee) return null

  const profile = employee

  async function refreshEmployee(base?: Partial<WorkSafetyEmployeeWithTrainings>) {
    const updated = {
      ...profile,
      full_name: fullName.trim(),
      cpf: stripCpf(cpf),
      phone: phone.replace(/\D/g, '') || null,
      epi_description: epiDescription,
      nr20,
      nr35,
      ...base,
    }
    onUpdated(updated)
  }

  async function handleSaveDados(event: FormEvent) {
    event.preventDefault()
    if (isReadOnly) return

    setError(null)
    const cpfError = validateCpf(cpf)
    if (cpfError) {
      setError(cpfError)
      return
    }

    setBusyKey('dados')
    try {
      const saved = await updateEmployee(profile.id, {
        fullName,
        cpf,
        phone,
      })
      setFullName(saved.full_name)
      setCpf(formatCpf(saved.cpf))
      setPhone(saved.phone ? formatPhone(saved.phone) : '')
      await refreshEmployee(saved)
    } catch {
      setError('Não foi possível salvar os dados.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSaveEpis(event: FormEvent) {
    event.preventDefault()
    if (isReadOnly) return

    setBusyKey('epis')
    setError(null)
    try {
      const saved = await updateEmployee(profile.id, {
        fullName: profile.full_name,
        cpf: profile.cpf,
        phone: profile.phone ?? '',
        epiDescription,
      })
      setEpiDescription(saved.epi_description)
      await refreshEmployee(saved)
    } catch {
      setError('Não foi possível salvar os EPIs.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSaveTraining(
    trainingType: TrainingType,
    payload: { issuedAt: string; expiresAt: string; file: File | null },
  ) {
    if (isReadOnly || !payload.file) return

    const dateError = validateDates(payload.issuedAt, payload.expiresAt, false)
    if (dateError) {
      setError(dateError)
      return
    }

    if (!isPdfFile(payload.file)) {
      setError('Somente arquivos PDF são permitidos.')
      return
    }

    if (payload.file.size > WORK_SAFETY_MAX_FILE_BYTES) {
      setError('O PDF deve ter no máximo 10 MB.')
      return
    }

    const existing = trainingType === 'nr20' ? nr20 : nr35
    setBusyKey(trainingType)
    setError(null)

    try {
      const saved = await saveEmployeeTraining({
        postoId,
        employeeId: profile.id,
        trainingType,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt || null,
        file: payload.file,
        existing,
      })

      if (trainingType === 'nr20') setNr20(saved)
      else setNr35(saved)

      await refreshEmployee(trainingType === 'nr20' ? { nr20: saved } : { nr35: saved })
    } catch {
      setError('Não foi possível salvar o certificado.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSaveAso(payload: { title: string; issuedAt: string; file: File }) {
    if (isReadOnly) return

    if (!payload.title.trim()) {
      setError('Informe o nome do ASO.')
      return
    }

    if (!payload.issuedAt) {
      setError('Informe a data de expedição do ASO.')
      return
    }

    if (!isPdfFile(payload.file)) {
      setError('Somente arquivos PDF são permitidos.')
      return
    }

    if (payload.file.size > WORK_SAFETY_MAX_FILE_BYTES) {
      setError('O PDF deve ter no máximo 10 MB.')
      return
    }

    setBusyKey('aso-new')
    setError(null)

    try {
      const saved = await saveEmployeeAso({
        postoId,
        employeeId: profile.id,
        title: payload.title,
        issuedAt: payload.issuedAt,
        file: payload.file,
      })
      setAsos((current) => [saved, ...current])
    } catch {
      setError('Não foi possível salvar o ASO.')
    } finally {
      setBusyKey(null)
    }
  }

  async function confirmDeleteAso() {
    if (!deleteAsoTarget) return

    setBusyKey(deleteAsoTarget.id)
    try {
      await deleteEmployeeAso(deleteAsoTarget)
      setAsos((current) => current.filter((aso) => aso.id !== deleteAsoTarget.id))
      setDeleteAsoTarget(null)
    } catch {
      setError('Não foi possível remover o ASO.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSaveIdentity(payload: {
    documentKind: IdentityDocumentKind
    file: File
  }) {
    if (isReadOnly) return

    if (!isPdfFile(payload.file)) {
      setError('Somente arquivos PDF são permitidos.')
      return
    }

    if (payload.file.size > WORK_SAFETY_MAX_FILE_BYTES) {
      setError('O PDF deve ter no máximo 10 MB.')
      return
    }

    setBusyKey('identity')
    setError(null)

    try {
      const saved = await saveEmployeeIdentity({
        postoId,
        employeeId: profile.id,
        documentKind: payload.documentKind,
        file: payload.file,
        existing: identity,
      })
      setIdentity(saved)
    } catch {
      setError('Não foi possível salvar o documento de identificação.')
    } finally {
      setBusyKey(null)
    }
  }

  function previewFile(title: string, doc: { preview_storage_path: string | null; storage_path: string }) {
    onPreview(title, getEmployeeFileUrl(getEmployeeFilePreviewPath(doc)))
  }

  async function downloadFile(fileName: string, doc: { storage_path: string }) {
    setBusyKey(`dl-${doc.storage_path}`)
    try {
      await downloadEmployeeFile(fileName, doc.storage_path)
    } catch {
      setError('Não foi possível baixar o arquivo.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <>
      <div className="reg-doc-modal ws-profile-modal" role="presentation" onClick={onClose}>
        <div
          className="ws-profile-modal__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-profile-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="ws-profile-modal__header">
            <div>
              <h2 id="employee-profile-title">{profile.full_name}</h2>
              <p className="ws-profile-modal__subtitle">Perfil do funcionário</p>
            </div>
            <button type="button" className="reg-doc-modal__close" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </header>

          <nav className="ws-profile-modal__tabs" aria-label="Seções do perfil">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ws-profile-modal__tab"
                data-active={tab === item.id}
                onClick={() => {
                  setTab(item.id)
                  setError(null)
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ws-profile-modal__body">
            {error && <p className="reg-doc-form__error ws-profile-modal__error">{error}</p>}

            {tab === 'dados' && (
              <form onSubmit={handleSaveDados}>
                <label className="reg-doc-form__field">
                  <span>Nome completo *</span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    disabled={isReadOnly || busyKey === 'dados'}
                  />
                </label>
                <label className="reg-doc-form__field">
                  <span>CPF *</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cpf}
                    onChange={(event) => setCpf(formatCpf(event.target.value))}
                    disabled={isReadOnly || busyKey === 'dados'}
                  />
                </label>
                <label className="reg-doc-form__field">
                  <span>Telefone</span>
                  <input
                    type="text"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(formatPhone(event.target.value))}
                    disabled={isReadOnly || busyKey === 'dados'}
                  />
                </label>
                {!isReadOnly && (
                  <div className="ws-profile-modal__actions">
                    <button type="submit" className="btn btn--primary" disabled={busyKey === 'dados'}>
                      {busyKey === 'dados' ? 'Salvando...' : 'Salvar dados'}
                    </button>
                  </div>
                )}
              </form>
            )}

            {tab === 'treinamentos' && (
              <div className="ws-profile-modal__stack">
                {(['nr20', 'nr35'] as TrainingType[]).map((trainingType) => (
                  <TrainingUploadSection
                    key={trainingType}
                    trainingType={trainingType}
                    training={trainingType === 'nr20' ? nr20 : nr35}
                    isReadOnly={isReadOnly}
                    busy={busyKey === trainingType}
                    onPreview={(doc) =>
                      previewFile(`${TRAINING_TYPE_LABELS[trainingType]} — ${profile.full_name}`, doc)
                    }
                    onDownload={(doc) => downloadFile(doc.file_name, doc)}
                    onSave={(payload) => handleSaveTraining(trainingType, payload)}
                  />
                ))}
              </div>
            )}

            {tab === 'asos' && (
              <div className="ws-profile-modal__stack">
                {!isReadOnly && (
                  <AsoUploadForm busy={busyKey === 'aso-new'} onSubmit={handleSaveAso} />
                )}
                {asos.length === 0 ? (
                  <p className="ws-profile-modal__empty">Nenhum ASO cadastrado.</p>
                ) : (
                  <ul className="ws-aso-list">
                    {asos.map((aso) => (
                      <li key={aso.id} className="ws-aso-list__item">
                        <div>
                          <strong>{aso.title}</strong>
                          <span>{formatDatePtBr(aso.issued_at)}</span>
                        </div>
                        <div className="ws-aso-list__actions">
                          <DocumentActionIconButton
                            label="Visualizar ASO"
                            onClick={() => previewFile(aso.title, aso)}
                            disabled={Boolean(busyKey)}
                          >
                            <IconEye />
                          </DocumentActionIconButton>
                          <DocumentActionIconButton
                            label="Baixar ASO"
                            onClick={() => downloadFile(aso.file_name, aso)}
                            disabled={Boolean(busyKey)}
                          >
                            <IconDownload />
                          </DocumentActionIconButton>
                          {!isReadOnly && (
                            <button
                              type="button"
                              className="ws-aso-list__remove"
                              onClick={() => setDeleteAsoTarget(aso)}
                              disabled={busyKey === aso.id}
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'epis' && (
              <form onSubmit={handleSaveEpis}>
                <label className="reg-doc-form__field">
                  <span>EPIs disponibilizados para o funcionário</span>
                  <textarea
                    className="ws-profile-modal__textarea"
                    value={epiDescription}
                    onChange={(event) => setEpiDescription(event.target.value)}
                    disabled={isReadOnly || busyKey === 'epis'}
                    rows={6}
                    placeholder="Descreva os equipamentos de proteção individual fornecidos..."
                  />
                </label>
                {!isReadOnly && (
                  <div className="ws-profile-modal__actions">
                    <button type="submit" className="btn btn--primary" disabled={busyKey === 'epis'}>
                      {busyKey === 'epis' ? 'Salvando...' : 'Salvar EPIs'}
                    </button>
                  </div>
                )}
              </form>
            )}

            {tab === 'documentos' && (
              <IdentityUploadSection
                identity={identity}
                isReadOnly={isReadOnly}
                busy={busyKey === 'identity'}
                onPreview={(doc) =>
                  previewFile(
                    `${IDENTITY_KIND_LABELS[doc.document_kind]} — ${profile.full_name}`,
                    doc,
                  )
                }
                onDownload={(doc) => downloadFile(doc.file_name, doc)}
                onSave={handleSaveIdentity}
              />
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteAsoTarget)}
        title="Remover ASO"
        message={
          deleteAsoTarget
            ? `Deseja remover o ASO "${deleteAsoTarget.title}"? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Remover"
        busy={Boolean(deleteAsoTarget && busyKey === deleteAsoTarget.id)}
        onConfirm={confirmDeleteAso}
        onCancel={() => setDeleteAsoTarget(null)}
      />
    </>
  )
}

type TrainingUploadSectionProps = {
  trainingType: TrainingType
  training: WorkSafetyEmployeeTraining | null
  isReadOnly: boolean
  busy: boolean
  onPreview: (doc: WorkSafetyEmployeeTraining) => void
  onDownload: (doc: WorkSafetyEmployeeTraining) => void
  onSave: (payload: { issuedAt: string; expiresAt: string; file: File | null }) => void
}

function TrainingUploadSection({
  trainingType,
  training,
  isReadOnly,
  busy,
  onPreview,
  onDownload,
  onSave,
}: TrainingUploadSectionProps) {
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    setIssuedAt(training?.issued_at ?? '')
    setExpiresAt(training?.expires_at ?? '')
    setFile(null)
  }, [training])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave({ issuedAt, expiresAt, file })
  }

  return (
    <section className="ws-training-section">
      <header className="ws-training-section__header">
        <h3>{TRAINING_TYPE_LABELS[trainingType]}</h3>
        {training && (
          <div className="ws-training-section__file-actions">
            <DocumentActionIconButton
              label="Visualizar certificado"
              onClick={() => onPreview(training)}
              disabled={busy}
            >
              <IconEye />
            </DocumentActionIconButton>
            <DocumentActionIconButton
              label="Baixar certificado"
              onClick={() => onDownload(training)}
              disabled={busy}
            >
              <IconDownload />
            </DocumentActionIconButton>
          </div>
        )}
      </header>

      {training && (
        <dl className="reg-doc-card__meta ws-training-section__meta">
          <div>
            <dt>Arquivo</dt>
            <dd>{training.file_name}</dd>
          </div>
          <div>
            <dt>Tamanho</dt>
            <dd>{formatFileSize(training.file_size)}</dd>
          </div>
          <div>
            <dt>Expedição</dt>
            <dd>{formatDatePtBr(training.issued_at)}</dd>
          </div>
          <div>
            <dt>Validade reciclagem</dt>
            <dd>{training.expires_at ? formatDatePtBr(training.expires_at) : 'Sem vencimento'}</dd>
          </div>
        </dl>
      )}

      {!isReadOnly && (
        <form onSubmit={handleSubmit}>
          <div className="reg-doc-form__grid">
            <label className="reg-doc-form__field">
              <span>Data de expedição *</span>
              <input
                type="date"
                value={issuedAt}
                onChange={(event) => setIssuedAt(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Validade reciclagem *</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={busy}
                required
              />
            </label>
          </div>
          <label className="reg-doc-form__field reg-doc-form__field--file">
            <span>Certificado PDF (máx. 10 MB)</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={busy}
            />
            {file && <small>{file.name}</small>}
          </label>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Salvando...' : training ? 'Atualizar certificado' : 'Anexar certificado'}
          </button>
        </form>
      )}
    </section>
  )
}

type AsoUploadFormProps = {
  busy: boolean
  onSubmit: (payload: { title: string; issuedAt: string; file: File }) => void
}

function AsoUploadForm({ busy, onSubmit }: AsoUploadFormProps) {
  const [title, setTitle] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [file, setFile] = useState<File | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    onSubmit({ title, issuedAt, file })
    setTitle('')
    setIssuedAt('')
    setFile(null)
  }

  return (
    <form className="ws-aso-form" onSubmit={handleSubmit}>
      <h3>Novo ASO</h3>
      <label className="reg-doc-form__field">
        <span>Nome do documento *</span>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
          placeholder="Ex.: ASO admissional"
        />
      </label>
      <label className="reg-doc-form__field">
        <span>Data de expedição *</span>
        <input
          type="date"
          value={issuedAt}
          onChange={(event) => setIssuedAt(event.target.value)}
          disabled={busy}
          required
        />
      </label>
      <label className="reg-doc-form__field reg-doc-form__field--file">
        <span>Arquivo PDF (máx. 10 MB)</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={busy}
          required
        />
      </label>
      <button type="submit" className="btn btn--primary" disabled={busy || !file}>
        {busy ? 'Salvando...' : 'Anexar ASO'}
      </button>
    </form>
  )
}

type IdentityUploadSectionProps = {
  identity: WorkSafetyEmployeeIdentity | null
  isReadOnly: boolean
  busy: boolean
  onPreview: (doc: WorkSafetyEmployeeIdentity) => void
  onDownload: (doc: WorkSafetyEmployeeIdentity) => void
  onSave: (payload: { documentKind: IdentityDocumentKind; file: File }) => void
}

function IdentityUploadSection({
  identity,
  isReadOnly,
  busy,
  onPreview,
  onDownload,
  onSave,
}: IdentityUploadSectionProps) {
  const [documentKind, setDocumentKind] = useState<IdentityDocumentKind>('cnh')
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    setDocumentKind(identity?.document_kind ?? 'cnh')
    setFile(null)
  }, [identity])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    onSave({ documentKind, file })
    setFile(null)
  }

  return (
    <section className="ws-identity-section">
      {identity && (
        <>
          <dl className="reg-doc-card__meta ws-training-section__meta">
            <div>
              <dt>Tipo</dt>
              <dd>{IDENTITY_KIND_LABELS[identity.document_kind]}</dd>
            </div>
            <div>
              <dt>Arquivo</dt>
              <dd>{identity.file_name}</dd>
            </div>
            <div>
              <dt>Tamanho</dt>
              <dd>{formatFileSize(identity.file_size)}</dd>
            </div>
          </dl>
          <div className="ws-training-section__file-actions ws-identity-section__actions">
            <DocumentActionIconButton
              label="Visualizar documento"
              onClick={() => onPreview(identity)}
              disabled={busy}
            >
              <IconEye />
            </DocumentActionIconButton>
            <DocumentActionIconButton
              label="Baixar documento"
              onClick={() => onDownload(identity)}
              disabled={busy}
            >
              <IconDownload />
            </DocumentActionIconButton>
          </div>
        </>
      )}

      {!isReadOnly && (
        <form onSubmit={handleSubmit}>
          <label className="reg-doc-form__field">
            <span>Tipo de documento</span>
            <select
              className="ws-profile-modal__select"
              value={documentKind}
              onChange={(event) => setDocumentKind(event.target.value as IdentityDocumentKind)}
              disabled={busy}
            >
              <option value="cnh">CNH</option>
              <option value="identidade">Identidade</option>
            </select>
          </label>
          <label className="reg-doc-form__field reg-doc-form__field--file">
            <span>Documento PDF (máx. 10 MB)</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={busy}
              required={!identity}
            />
            {file && <small>{file.name}</small>}
          </label>
          <button type="submit" className="btn btn--primary" disabled={busy || !file}>
            {busy ? 'Salvando...' : identity ? 'Substituir documento' : 'Anexar documento'}
          </button>
        </form>
      )}

      {!identity && isReadOnly && (
        <p className="ws-profile-modal__empty">Nenhum documento de identificação anexado.</p>
      )}
    </section>
  )
}
