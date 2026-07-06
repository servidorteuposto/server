import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  formatDatePtBr,
  formatPhone,
  WORK_SAFETY_DOCUMENT_TEMPLATES,
  type WorkSafetyTemplateKey,
} from '../config/work-safety'
import DocumentUploadCard from '../components/regulatory/DocumentUploadCard'
import PdfPreviewModal from '../components/regulatory/PdfPreviewModal'
import ConfirmDialog from '../components/regulatory/ConfirmDialog'
import AddEmployeeModal from '../components/work-safety/AddEmployeeModal'
import EmployeeProfileModal from '../components/work-safety/EmployeeProfileModal'
import {
  createEmployee,
  deleteEmployee,
  listEmployeesWithTrainings,
  type WorkSafetyEmployeeWithTrainings,
} from '../lib/work-safety-employees'
import {
  downloadWorkSafetyDocument,
  getMyPostoId,
  getWorkSafetyDocumentPreviewPath,
  getWorkSafetyDocumentUrl,
  listWorkSafetyDocuments,
  saveWorkSafetyDocument,
  type WorkSafetyDocument,
} from '../lib/work-safety-documents'
import type { RegulatoryDocument } from '../lib/regulatory-documents'
import '../pages/RegulatoryDocumentsPage.css'
import './WorkSafetyPage.css'

type WorkSafetyPageProps = {
  isReadOnly: boolean
}

function toCardDocument(doc: WorkSafetyDocument): RegulatoryDocument {
  return {
    ...doc,
    is_custom: false,
    template_key: doc.template_key as RegulatoryDocument['template_key'],
  }
}

export default function WorkSafetyPage({ isReadOnly }: WorkSafetyPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<WorkSafetyDocument[]>([])
  const [employees, setEmployees] = useState<WorkSafetyEmployeeWithTrainings[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false)
  const [profileEmployee, setProfileEmployee] = useState<WorkSafetyEmployeeWithTrainings | null>(null)
  const [deleteEmployeeTarget, setDeleteEmployeeTarget] = useState<WorkSafetyEmployeeWithTrainings | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const documentsByTemplate = useMemo(() => {
    const map = new Map<WorkSafetyTemplateKey, WorkSafetyDocument>()
    for (const doc of documents) {
      if (doc.template_key) map.set(doc.template_key, doc)
    }
    return map
  }, [documents])

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)

    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const [docs, rows] = await Promise.all([
        listWorkSafetyDocuments(id),
        listEmployeesWithTrainings(id),
      ])
      setDocuments(docs)
      setEmployees(rows)
    } catch {
      setPageError('Não foi possível carregar a Segurança do Trabalho.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  async function handleSaveTemplate(
    templateKey: WorkSafetyTemplateKey,
    title: string,
    payload: { issuedAt: string; expiresAt: string; file: File },
  ) {
    if (!postoId) return

    const existing = documentsByTemplate.get(templateKey)
    setBusyKey(templateKey)

    try {
      const saved = await saveWorkSafetyDocument({
        postoId,
        title,
        templateKey,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt || null,
        file: payload.file,
        existingId: existing?.id,
        existingStoragePath: existing?.storage_path,
        existingPreviewPath: existing?.preview_storage_path,
      })

      setDocuments((current) => {
        const without = current.filter((doc) => doc.id !== saved.id && doc.template_key !== templateKey)
        return [...without, saved]
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function handleAddEmployee(payload: { fullName: string; cpf: string; phone: string }) {
    if (!postoId) return

    setBusyKey('employee-new')
    try {
      const created = await createEmployee({ postoId, ...payload })
      setEmployees((current) => [
        ...current,
        { ...created, nr20: null, nr35: null },
      ].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')))
    } finally {
      setBusyKey(null)
    }
  }

  async function confirmDeleteEmployee() {
    if (!deleteEmployeeTarget) return

    setBusyKey(deleteEmployeeTarget.id)
    try {
      await deleteEmployee(deleteEmployeeTarget)
      setEmployees((current) => current.filter((row) => row.id !== deleteEmployeeTarget.id))
      if (profileEmployee?.id === deleteEmployeeTarget.id) {
        setProfileEmployee(null)
      }
      setDeleteEmployeeTarget(null)
    } catch {
      setPageError('Não foi possível remover o funcionário.')
    } finally {
      setBusyKey(null)
    }
  }

  function handleEmployeeUpdated(updated: WorkSafetyEmployeeWithTrainings) {
    setEmployees((current) =>
      current
        .map((row) => (row.id === updated.id ? updated : row))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')),
    )
    setProfileEmployee(updated)
  }

  async function handlePreviewDocument(document: WorkSafetyDocument) {
    setPreviewOpen(true)
    setPreviewTitle(document.title)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    setActionBusyId(document.id)

    try {
      const url = await getWorkSafetyDocumentUrl(getWorkSafetyDocumentPreviewPath(document))
      setPreviewUrl(url)
    } catch {
      setPreviewError('Não foi possível carregar a visualização do documento.')
    } finally {
      setPreviewLoading(false)
      setActionBusyId(null)
    }
  }

  async function handleDownloadDocument(document: WorkSafetyDocument) {
    setActionBusyId(document.id)
    try {
      await downloadWorkSafetyDocument(document)
    } catch {
      setPageError('Não foi possível baixar o documento original.')
    } finally {
      setActionBusyId(null)
    }
  }

  async function handlePreviewFile(title: string, urlPromise: Promise<string>) {
    setPreviewOpen(true)
    setPreviewTitle(title)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)

    try {
      const url = await urlPromise
      setPreviewUrl(url)
    } catch {
      setPreviewError('Não foi possível carregar a visualização do documento.')
    } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    setPreviewOpen(false)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(false)
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando Segurança do Trabalho...</p>
  }

  if (pageError && !postoId) {
    return <p className="reg-doc-form__error">{pageError}</p>
  }

  return (
    <section className="ws-page">
      <header className="reg-docs-page__header ws-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Segurança do Trabalho</h1>
          <p>
            Laudos de engenharia e saúde ocupacional do posto, além do controle de treinamentos e
            documentação dos funcionários.
          </p>
        </div>
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      <section className="ws-section">
        <header className="ws-section__header">
          <h2>Laudos de Engenharia e Saúde Ocupacional</h2>
          <p>Anexe os laudos e programas exigidos para o posto. Somente PDF, máx. 10 MB.</p>
        </header>

        <div className="reg-docs-page__grid">
          {WORK_SAFETY_DOCUMENT_TEMPLATES.map((template) => {
            const document = documentsByTemplate.get(template.key) ?? null
            const cardDocument = document ? toCardDocument(document) : null

            return (
              <DocumentUploadCard
                key={template.key}
                title={template.title}
                document={cardDocument}
                isReadOnly={isReadOnly}
                busy={busyKey === template.key}
                onSave={(payload) => handleSaveTemplate(template.key, template.title, payload)}
                onPreview={() => document && handlePreviewDocument(document)}
                onDownload={() => document && handleDownloadDocument(document)}
                actionBusy={document ? actionBusyId === document.id : false}
              />
            )
          })}
        </div>
      </section>

      <section className="ws-section">
        <header className="ws-section__header ws-section__header--row">
          <div>
            <h2>Treinamentos de Funcionários</h2>
            <p>Controle de NR-20, NR-35 e demais documentos por colaborador.</p>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              className="reg-docs-page__add-btn"
              onClick={() => setAddEmployeeOpen(true)}
            >
              + Funcionário
            </button>
          )}
        </header>

        {employees.length === 0 ? (
          <p className="ws-page__empty">Nenhum funcionário cadastrado.</p>
        ) : (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>NR-20</th>
                  <th>NR-35</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <strong>{employee.full_name}</strong>
                      <span className="ws-table__sub">
                        {employee.phone ? formatPhone(employee.phone) : 'Sem telefone'}
                      </span>
                    </td>
                    <td>
                      <span className="ws-table__dates">
                        {employee.nr20 ? (
                          <>
                            <span>Exp.: {formatDatePtBr(employee.nr20.issued_at)}</span>
                            <span>
                              Val.:{' '}
                              {employee.nr20.expires_at
                                ? formatDatePtBr(employee.nr20.expires_at)
                                : 'Sem vencimento'}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="ws-table__dates">
                        {employee.nr35 ? (
                          <>
                            <span>Exp.: {formatDatePtBr(employee.nr35.issued_at)}</span>
                            <span>
                              Val.:{' '}
                              {employee.nr35.expires_at
                                ? formatDatePtBr(employee.nr35.expires_at)
                                : 'Sem vencimento'}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </td>
                    <td className="ws-table__actions">
                      <button
                        type="button"
                        className="btn btn--secondary ws-table__verify"
                        onClick={() => setProfileEmployee(employee)}
                      >
                        Verificar
                      </button>
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="ws-table__remove"
                          onClick={() => setDeleteEmployeeTarget(employee)}
                          disabled={busyKey === employee.id}
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddEmployeeModal
        open={addEmployeeOpen}
        busy={busyKey === 'employee-new'}
        onClose={() => setAddEmployeeOpen(false)}
        onSubmit={handleAddEmployee}
      />

      <EmployeeProfileModal
        open={Boolean(profileEmployee)}
        postoId={postoId ?? ''}
        employee={profileEmployee}
        isReadOnly={isReadOnly}
        onClose={() => setProfileEmployee(null)}
        onUpdated={handleEmployeeUpdated}
        onPreview={handlePreviewFile}
      />

      <PdfPreviewModal
        open={previewOpen}
        title={previewTitle}
        url={previewUrl}
        loading={previewLoading}
        error={previewError}
        onClose={closePreview}
      />

      <ConfirmDialog
        open={Boolean(deleteEmployeeTarget)}
        title="Remover funcionário"
        message={
          deleteEmployeeTarget
            ? `Deseja remover "${deleteEmployeeTarget.full_name}" e todos os documentos vinculados? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Remover"
        busy={Boolean(deleteEmployeeTarget && busyKey === deleteEmployeeTarget.id)}
        onConfirm={confirmDeleteEmployee}
        onCancel={() => setDeleteEmployeeTarget(null)}
      />
    </section>
  )
}
