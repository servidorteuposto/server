import { FormEvent, useCallback, useEffect, useState } from 'react'
import LiveCameraCapture from '../components/fuel-analyses/LiveCameraCapture'
import SignaturePad from '../components/fuel-analyses/SignaturePad'
import {
  RESIDUE_COLLECTION_MAX_FILE_BYTES,
  RESIDUE_COLLECTION_NOTES_MAX_LENGTH,
} from '../config/residue-collection'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  formatCoords,
  formatDateTimePtBr,
} from '../config/fuel-analyses'
import {
  getMyPostoId,
  getResidueCollectionPhotoUrl,
  getResidueCollectionSignatureUrl,
  listResidueCollections,
  saveResidueCollection,
  type ResidueCollection,
} from '../lib/residue-collection'
import { describeOperationalSaveError } from '../lib/storage-errors'
import '../pages/RegulatoryDocumentsPage.css'
import '../pages/FuelAnalysesPage.css'
import './CompressorInspectionPage.css'
import './PumpMaintenancePage.css'

type ResidueCollectionPageProps = {
  isReadOnly: boolean
}

type LivePhotoState = {
  file: File | null
  previewUrl: string | null
  latitude: number | null
  longitude: number | null
  capturedAt: string | null
  error: string | null
}

function emptyLivePhoto(): LivePhotoState {
  return {
    file: null,
    previewUrl: null,
    latitude: null,
    longitude: null,
    capturedAt: null,
    error: null,
  }
}

function clearLivePhotoState(state: LivePhotoState) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl)
}

function readGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não disponível neste dispositivo.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}

export default function ResidueCollectionPage({ isReadOnly }: ResidueCollectionPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [records, setRecords] = useState<ResidueCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [signatureKey, setSignatureKey] = useState(0)
  const [photo, setPhoto] = useState<LivePhotoState>(emptyLivePhoto())
  const [viewRecord, setViewRecord] = useState<ResidueCollection | null>(null)
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null)

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const rows = await listResidueCollections(id)
      setRecords(rows)
    } catch {
      setPageError('Não foi possível carregar os recolhimentos de resíduos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    return () => {
      clearLivePhotoState(photo)
    }
  }, [photo])

  useEffect(() => {
    let cancelled = false
    async function loadViewUrl() {
      if (!viewRecord) {
        setViewPhotoUrl(null)
        return
      }
      try {
        const url = await getResidueCollectionPhotoUrl(viewRecord.photo_path)
        if (!cancelled) setViewPhotoUrl(url)
      } catch {
        if (!cancelled) setViewPhotoUrl(null)
      }
    }
    void loadViewUrl()
    return () => {
      cancelled = true
    }
  }, [viewRecord])

  async function capturePhoto(file: File) {
    if (!file.type.startsWith('image/')) {
      setPhoto((current) => ({ ...current, error: 'Use uma foto (JPG, PNG ou WEBP).' }))
      return
    }
    if (file.size > RESIDUE_COLLECTION_MAX_FILE_BYTES) {
      setPhoto((current) => ({
        ...current,
        error: `A foto deve ter no máximo ${FUEL_ANALYSES_MAX_FILE_BYTES / (1024 * 1024)} MB.`,
      }))
      return
    }

    setPhoto((current) => {
      clearLivePhotoState(current)
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        latitude: null,
        longitude: null,
        capturedAt: new Date().toISOString(),
        error: 'Obtendo coordenadas GPS...',
      }
    })

    try {
      const position = await readGeolocation()
      setPhoto((current) => ({
        ...current,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        capturedAt: new Date().toISOString(),
        error: null,
      }))
    } catch {
      setPhoto((current) => ({
        ...current,
        latitude: null,
        longitude: null,
        error: 'Não foi possível obter a localização. Permita o GPS e tire a foto novamente.',
      }))
    }
  }

  function resetForm() {
    clearLivePhotoState(photo)
    setNotes('')
    setOperatorName('')
    setSignatureBlob(null)
    setSignatureKey((current) => current + 1)
    setPhoto(emptyLivePhoto())
    setFormError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!postoId || isReadOnly) return

    if (notes.trim().length > RESIDUE_COLLECTION_NOTES_MAX_LENGTH) {
      setFormError(`A observação deve ter no máximo ${RESIDUE_COLLECTION_NOTES_MAX_LENGTH} caracteres.`)
      return
    }
    if (!operatorName.trim()) {
      setFormError('Informe o nome de quem fez o recolhimento.')
      return
    }
    if (!signatureBlob) {
      setFormError('Assine no campo em branco antes de lançar o recolhimento.')
      return
    }
    if (!photo.file) {
      setFormError('Tire a foto do recolhimento de resíduos.')
      return
    }
    if (photo.latitude == null || photo.longitude == null || !photo.capturedAt) {
      setFormError('Aguarde as coordenadas GPS da foto antes de lançar.')
      return
    }
    if (photo.error) {
      setFormError(photo.error)
      return
    }

    setBusy(true)
    setFormError(null)

    try {
      const saved = await saveResidueCollection({
        postoId,
        collectedAt: new Date().toISOString(),
        notes,
        operatorFullName: operatorName,
        signatureBlob,
        photo: {
          file: photo.file,
          latitude: photo.latitude,
          longitude: photo.longitude,
          capturedAt: photo.capturedAt,
        },
      })
      setRecords((current) => [saved, ...current])
      resetForm()
    } catch (error) {
      setFormError(describeOperationalSaveError(error, 'residue_collections'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando recolhimentos de resíduos...</p>
  }

  return (
    <div className="compressor-page pump-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Recolhimento de Resíduos</h1>
          <p>
            Lance a foto ao vivo do recolhimento, com data, hora e localização. Informe o nome e a
            assinatura de quem fez. Depois é só lançar os próximos.
          </p>
        </div>
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      {!isReadOnly && (
        <section className="compressor-page__form-card reg-doc-form">
          <h2 className="compressor-page__section-title">Novo lançamento</h2>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label className="reg-doc-form__field pump-page__notes">
              <span>Observação (opcional)</span>
              <textarea
                value={notes}
                maxLength={RESIDUE_COLLECTION_NOTES_MAX_LENGTH}
                placeholder="Ex.: Resíduo da bomba 3"
                onChange={(event) => setNotes(event.target.value)}
                disabled={busy}
                rows={3}
              />
            </label>

            <label className="reg-doc-form__field pump-page__operator">
              <span>Nome de quem fez *</span>
              <input
                type="text"
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                disabled={busy}
                required
              />
            </label>

            <div className="compressor-page__photos">
              <div className="fuel-photo">
                <h3>Foto do recolhimento *</h3>
                <LiveCameraCapture
                  label="Câmera ao vivo"
                  hint="A foto precisa ser tirada agora, com horário e localização."
                  disabled={busy}
                  previewUrl={photo.previewUrl}
                  onCapture={(file) => void capturePhoto(file)}
                  onClear={() => {
                    clearLivePhotoState(photo)
                    setPhoto(emptyLivePhoto())
                  }}
                />
                {photo.error && <p className="reg-doc-form__error">{photo.error}</p>}
                <dl className="fuel-photo__meta">
                  <div>
                    <dt>Data e hora da foto</dt>
                    <dd>{photo.capturedAt ? formatDateTimePtBr(photo.capturedAt) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Coordenadas</dt>
                    <dd>
                      {photo.latitude != null && photo.longitude != null
                        ? formatCoords(photo.latitude, photo.longitude)
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="compressor-page__signature">
              <label className="reg-doc-form__field">
                <span>Assinatura de quem fez *</span>
              </label>
              <SignaturePad key={signatureKey} disabled={busy} onChange={setSignatureBlob} />
            </div>

            {formError && <p className="reg-doc-form__error">{formError}</p>}

            <div className="compressor-page__actions">
              <button type="submit" className="reg-docs-page__add-btn" disabled={busy}>
                {busy ? 'Salvando...' : 'Lançar recolhimento'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="compressor-page__history">
        <h2 className="compressor-page__section-title">Histórico</h2>
        {records.length === 0 ? (
          <p className="compressor-page__empty">Nenhum recolhimento registrado ainda.</p>
        ) : (
          <ul className="compressor-page__list">
            {records.map((record) => (
              <li key={record.id} className="compressor-page__list-item">
                <div>
                  <strong>{record.notes?.trim() || 'Recolhimento de resíduos'}</strong>
                  <p className="compressor-page__meta">
                    {formatDateTimePtBr(record.collected_at)}
                    {record.operator_full_name ? ` · ${record.operator_full_name}` : ''}
                  </p>
                </div>
                <div className="diesel-history__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setViewRecord(record)}
                  >
                    Ver detalhes
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewRecord && (
        <ResidueCollectionDetailsModal
          record={viewRecord}
          photoUrl={viewPhotoUrl}
          onClose={() => setViewRecord(null)}
        />
      )}
    </div>
  )
}

function ResidueCollectionDetailsModal({
  record,
  photoUrl,
  onClose,
}: {
  record: ResidueCollection
  photoUrl: string | null
  onClose: () => void
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!record.signature_storage_path) {
      setSignatureUrl(null)
      return
    }
    getResidueCollectionSignatureUrl(record.signature_storage_path)
      .then((url) => {
        if (active) setSignatureUrl(url)
      })
      .catch(() => {
        if (active) setSignatureUrl(null)
      })
    return () => {
      active = false
    }
  }, [record.signature_storage_path])

  return (
    <div className="reg-doc-modal" role="presentation" onClick={onClose}>
      <div
        className="reg-doc-modal__dialog compressor-page__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="residue-collection-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reg-doc-modal__header">
          <h2 id="residue-collection-detail-title">Recolhimento de resíduos</h2>
          <button type="button" className="reg-doc-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <dl className="compressor-page__detail-grid">
          <div>
            <dt>Lançado em</dt>
            <dd>{formatDateTimePtBr(record.collected_at)}</dd>
          </div>
          <div>
            <dt>Observação</dt>
            <dd>{record.notes?.trim() || '—'}</dd>
          </div>
          <div>
            <dt>Executado por</dt>
            <dd>{record.operator_full_name || '—'}</dd>
          </div>
        </dl>

        <div className="compressor-page__modal-photos">
          <div className="compressor-page__modal-photo">
            <h3>Foto do recolhimento</h3>
            {photoUrl ? (
              <img src={photoUrl} alt="Foto do recolhimento" className="compressor-page__photo-preview" />
            ) : (
              <p className="compressor-page__empty">Foto indisponível.</p>
            )}
            <dl className="fuel-photo__meta">
              <div>
                <dt>Data e hora da foto</dt>
                <dd>{formatDateTimePtBr(record.photo_captured_at)}</dd>
              </div>
              <div>
                <dt>Coordenadas</dt>
                <dd>{formatCoords(record.photo_latitude, record.photo_longitude)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {signatureUrl && (
          <div className="pump-page__signature-preview">
            <h3>Assinatura</h3>
            <img src={signatureUrl} alt="Assinatura de quem fez o recolhimento" />
          </div>
        )}
      </div>
    </div>
  )
}
