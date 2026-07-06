import { useCallback, useEffect, useMemo, useState } from 'react'
import { REGULATORY_DOCUMENT_TEMPLATES, type RegulatoryTemplateKey } from '../config/regulatory-documents'
import AddCustomDocumentModal from '../components/regulatory/AddCustomDocumentModal'
import ConfirmDialog from '../components/regulatory/ConfirmDialog'
import DocumentUploadCard from '../components/regulatory/DocumentUploadCard'
import PdfPreviewModal from '../components/regulatory/PdfPreviewModal'
import {
  deleteCustomRegulatoryDocument,
  downloadRegulatoryDocument,
  getDocumentPreviewPath,
  getMyPostoId,
  getRegulatoryDocumentUrl,
  listRegulatoryDocuments,
  saveRegulatoryDocument,
  type RegulatoryDocument,
} from '../lib/regulatory-documents'
import './RegulatoryDocumentsPage.css'

type RegulatoryDocumentsPageProps = {
  isReadOnly: boolean
}

export default function RegulatoryDocumentsPage({ isReadOnly }: RegulatoryDocumentsPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<RegulatoryDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RegulatoryDocument | null>(null)

  const documentsByTemplate = useMemo(() => {
    const map = new Map<RegulatoryTemplateKey, RegulatoryDocument>()
    for (const doc of documents) {
      if (doc.template_key) map.set(doc.template_key, doc)
    }
    return map
  }, [documents])

  const customDocuments = useMemo(() => documents.filter((doc) => doc.is_custom), [documents])

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setPageError(null)

    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const rows = await listRegulatoryDocuments(id)
      setDocuments(rows)
    } catch {
      setPageError('Não foi possível carregar os documentos regulatórios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  async function handleSaveTemplate(
    templateKey: RegulatoryTemplateKey,
    title: string,
    payload: { issuedAt: string; expiresAt: string; file: File },
  ) {
    if (!postoId) return

    const existing = documentsByTemplate.get(templateKey)
    setBusyKey(templateKey)

    try {
      const saved = await saveRegulatoryDocument({
        postoId,
        title,
        templateKey,
        isCustom: false,
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

  async function handleSaveCustom(payload: {
    title: string
    issuedAt: string
    expiresAt: string
    file: File
  }) {
    if (!postoId) return

    setBusyKey('custom-new')

    try {
      const saved = await saveRegulatoryDocument({
        postoId,
        title: payload.title,
        isCustom: true,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt || null,
        file: payload.file,
      })

      setDocuments((current) => [...current, saved])
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSaveCustomExisting(
    document: RegulatoryDocument,
    payload: { issuedAt: string; expiresAt: string; file: File },
  ) {
    if (!postoId) return

    setBusyKey(document.id)

    try {
      const saved = await saveRegulatoryDocument({
        postoId,
        title: document.title,
        isCustom: true,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt || null,
        file: payload.file,
        existingId: document.id,
        existingStoragePath: document.storage_path,
        existingPreviewPath: document.preview_storage_path,
      })

      setDocuments((current) => current.map((doc) => (doc.id === saved.id ? saved : doc)))
    } finally {
      setBusyKey(null)
    }
  }

  function requestDeleteCustom(document: RegulatoryDocument) {
    if (isReadOnly) return
    setDeleteTarget(document)
  }

  async function confirmDeleteCustom() {
    if (!deleteTarget) return

    setBusyKey(deleteTarget.id)

    try {
      await deleteCustomRegulatoryDocument(deleteTarget)
      setDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      setPageError('Não foi possível remover o documento.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handlePreview(document: RegulatoryDocument) {
    setPreviewOpen(true)
    setPreviewTitle(document.title)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    setActionBusyId(document.id)

    try {
      const url = await getRegulatoryDocumentUrl(getDocumentPreviewPath(document))
      setPreviewUrl(url)
    } catch {
      setPreviewError('Não foi possível carregar a visualização do documento.')
    } finally {
      setPreviewLoading(false)
      setActionBusyId(null)
    }
  }

  function closePreview() {
    setPreviewOpen(false)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(false)
  }

  async function handleDownload(document: RegulatoryDocument) {
    setActionBusyId(document.id)

    try {
      await downloadRegulatoryDocument(document)
    } catch {
      setPageError('Não foi possível baixar o documento original.')
    } finally {
      setActionBusyId(null)
    }
  }

  const cardActions = {
    onPreview: handlePreview,
    onDownload: handleDownload,
    actionBusy: actionBusyId,
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando documentos...</p>
  }

  if (pageError && !postoId) {
    return <p className="reg-doc-form__error">{pageError}</p>
  }

  return (
    <section className="reg-docs-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Documentos Regulatórios</h1>
          <p>
            Anexe a documentação municipal, estadual e federal exigida para o controle do posto. Somente
            arquivos PDF, um por setor.
          </p>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            className="reg-docs-page__add-btn"
            onClick={() => setModalOpen(true)}
          >
            + Adicionar
          </button>
        )}
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      <div className="reg-docs-page__grid">
        {REGULATORY_DOCUMENT_TEMPLATES.map((template) => (
          <DocumentUploadCard
            key={template.key}
            title={template.title}
            document={documentsByTemplate.get(template.key) ?? null}
            isReadOnly={isReadOnly}
            busy={busyKey === template.key}
            onSave={(payload) => handleSaveTemplate(template.key, template.title, payload)}
            onPreview={cardActions.onPreview}
            onDownload={cardActions.onDownload}
            actionBusy={cardActions.actionBusy === documentsByTemplate.get(template.key)?.id}
          />
        ))}

        {customDocuments.map((document) => (
          <div key={document.id} className="reg-docs-page__custom-wrap">
            <DocumentUploadCard
              title={document.title}
              document={document}
              isReadOnly={isReadOnly}
              busy={busyKey === document.id}
              onSave={(payload) => handleSaveCustomExisting(document, payload)}
              onPreview={cardActions.onPreview}
              onDownload={cardActions.onDownload}
              actionBusy={cardActions.actionBusy === document.id}
            />
            {!isReadOnly && (
              <button
                type="button"
                className="reg-docs-page__remove"
                onClick={() => requestDeleteCustom(document)}
                disabled={busyKey === document.id}
              >
                Remover documento
              </button>
            )}
          </div>
        ))}
      </div>

      <AddCustomDocumentModal
        open={modalOpen}
        busy={busyKey === 'custom-new'}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSaveCustom}
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
        open={Boolean(deleteTarget)}
        title="Remover documento"
        message={
          deleteTarget
            ? `Deseja remover o documento "${deleteTarget.title}"? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Remover"
        busy={Boolean(deleteTarget && busyKey === deleteTarget.id)}
        onConfirm={confirmDeleteCustom}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
