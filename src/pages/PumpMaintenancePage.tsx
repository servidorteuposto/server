import { FormEvent, useCallback, useEffect, useState } from 'react'
import LiveCameraCapture from '../components/fuel-analyses/LiveCameraCapture'
import SignaturePad from '../components/fuel-analyses/SignaturePad'
import {
  PUMP_MAINTENANCE_MAX_FILE_BYTES,
  PUMP_MAINTENANCE_NOTES_MAX_LENGTH,
} from '../config/pump-maintenance'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  formatCoords,
  formatDateTimePtBr,
} from '../config/fuel-analyses'
import {
  getMyPostoId,
  getPumpMaintenancePhotoUrl,
  getPumpMaintenanceSignatureUrl,
  listPumpMaintenances,
  savePumpMaintenance,
  type PumpMaintenance,
} from '../lib/pump-maintenance'
import { describeOperationalSaveError } from '../lib/storage-errors'
import PhotoLightbox from '../components/PhotoLightbox'
import '../pages/RegulatoryDocumentsPage.css'
import '../pages/FuelAnalysesPage.css'
import './CompressorInspectionPage.css'
import './PumpMaintenancePage.css'

type PumpMaintenancePageProps = {
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

export default function PumpMaintenancePage({ isReadOnly }: PumpMaintenancePageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [records, setRecords] = useState<PumpMaintenance[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [signatureKey, setSignatureKey] = useState(0)
  const [maintenancePhoto, setMaintenancePhoto] = useState<LivePhotoState>(emptyLivePhoto())
  const [viewRecord, setViewRecord] = useState<PumpMaintenance | null>(null)
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null)

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const rows = await listPumpMaintenances(id)
      setRecords(rows)
    } catch {
      setPageError('Não foi possível carregar as manutenções de bombas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    return () => {
      clearLivePhotoState(maintenancePhoto)
    }
  }, [maintenancePhoto])

  useEffect(() => {
    let cancelled = false
    async function loadViewUrl() {
      if (!viewRecord) {
        setViewPhotoUrl(null)
        return
      }
      try {
        const url = await getPumpMaintenancePhotoUrl(viewRecord.maintenance_photo_path)
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

  async function capturePhoto(
    setter: (updater: (current: LivePhotoState) => LivePhotoState) => void,
    file: File,
  ) {
    if (!file.type.startsWith('image/')) {
      setter((current) => ({ ...current, error: 'Use uma foto (JPG, PNG ou WEBP).' }))
      return
    }
    if (file.size > PUMP_MAINTENANCE_MAX_FILE_BYTES) {
      setter((current) => ({
        ...current,
        error: `A foto deve ter no máximo ${FUEL_ANALYSES_MAX_FILE_BYTES / (1024 * 1024)} MB.`,
      }))
      return
    }

    setter((current) => {
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
      setter((current) => ({
        ...current,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        capturedAt: new Date().toISOString(),
        error: null,
      }))
    } catch {
      setter((current) => ({
        ...current,
        latitude: null,
        longitude: null,
        error: 'Não foi possível obter a localização. Permita o GPS e tire a foto novamente.',
      }))
    }
  }

  function resetForm() {
    clearLivePhotoState(maintenancePhoto)
    setNotes('')
    setOperatorName('')
    setSignatureBlob(null)
    setSignatureKey((current) => current + 1)
    setMaintenancePhoto(emptyLivePhoto())
    setFormError(null)
  }

  function validatePhoto(state: LivePhotoState, label: string): string | null {
    if (!state.file) return `Tire a ${label}.`
    if (state.latitude == null || state.longitude == null || !state.capturedAt) {
      return `Aguarde as coordenadas GPS da ${label} antes de lançar.`
    }
    if (state.error) return state.error
    return null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!postoId || isReadOnly) return

    if (notes.trim().length > PUMP_MAINTENANCE_NOTES_MAX_LENGTH) {
      setFormError(`A observação deve ter no máximo ${PUMP_MAINTENANCE_NOTES_MAX_LENGTH} caracteres.`)
      return
    }
    if (!operatorName.trim()) {
      setFormError('Informe o nome de quem fez a manutenção.')
      return
    }
    if (!signatureBlob) {
      setFormError('Assine no campo em branco antes de lançar a manutenção.')
      return
    }

    const maintenanceError = validatePhoto(maintenancePhoto, 'foto da manutenção')
    if (maintenanceError) {
      setFormError(maintenanceError)
      return
    }

    setBusy(true)
    setFormError(null)

    try {
      const saved = await savePumpMaintenance({
        postoId,
        maintainedAt: new Date().toISOString(),
        notes,
        operatorFullName: operatorName,
        signatureBlob,
        maintenancePhoto: {
          file: maintenancePhoto.file!,
          latitude: maintenancePhoto.latitude!,
          longitude: maintenancePhoto.longitude!,
          capturedAt: maintenancePhoto.capturedAt!,
        },
      })
      setRecords((current) => [saved, ...current])
      resetForm()
    } catch (error) {
      setFormError(describeOperationalSaveError(error, 'pump_maintenances'))
    } finally {
      setBusy(false)
    }
  }

  function renderPhotoMeta(state: LivePhotoState) {
    return (
      <dl className="fuel-photo__meta">
        <div>
          <dt>Data e hora da foto</dt>
          <dd>{state.capturedAt ? formatDateTimePtBr(state.capturedAt) : '—'}</dd>
        </div>
        <div>
          <dt>Coordenadas</dt>
          <dd>
            {state.latitude != null && state.longitude != null
              ? formatCoords(state.latitude, state.longitude)
              : '—'}
          </dd>
        </div>
      </dl>
    )
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando manutenções de bombas...</p>
  }

  return (
    <div className="compressor-page pump-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Manutenção de Bombas</h1>
          <p>
            Lance a foto da manutenção ao vivo, com data, hora e localização. Informe o nome e a
            assinatura de quem fez. Se quiser identificar a bomba, escreva na observação. Depois é
            só lançar as outras.
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
                maxLength={PUMP_MAINTENANCE_NOTES_MAX_LENGTH}
                placeholder="Ex.: Bomba 3, ilha 2"
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
                <h3>Foto da manutenção *</h3>
                <LiveCameraCapture
                  label="Câmera ao vivo"
                  hint="A foto precisa ser tirada agora, com horário e localização."
                  disabled={busy}
                  previewUrl={maintenancePhoto.previewUrl}
                  onCapture={(file) => void capturePhoto((updater) => setMaintenancePhoto(updater), file)}
                  onClear={() => {
                    clearLivePhotoState(maintenancePhoto)
                    setMaintenancePhoto(emptyLivePhoto())
                  }}
                />
                {maintenancePhoto.error && <p className="reg-doc-form__error">{maintenancePhoto.error}</p>}
                {renderPhotoMeta(maintenancePhoto)}
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
                {busy ? 'Salvando...' : 'Lançar manutenção'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="compressor-page__history">
        <h2 className="compressor-page__section-title">Histórico</h2>
        {records.length === 0 ? (
          <p className="compressor-page__empty">Nenhuma manutenção registrada ainda.</p>
        ) : (
          <ul className="compressor-page__list">
            {records.map((record) => (
              <li key={record.id} className="compressor-page__list-item">
                <div>
                  <strong>{record.notes?.trim() || 'Manutenção de bomba'}</strong>
                  <p className="compressor-page__meta">
                    {formatDateTimePtBr(record.maintained_at)}
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
        <PumpMaintenanceDetailsModal
          record={viewRecord}
          photoUrl={viewPhotoUrl}
          onClose={() => setViewRecord(null)}
        />
      )}
    </div>
  )
}

function PumpMaintenanceDetailsModal({
  record,
  photoUrl,
  onClose,
}: {
  record: PumpMaintenance
  photoUrl: string | null
  onClose: () => void
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    let active = true
    if (!record.signature_storage_path) {
      setSignatureUrl(null)
      return
    }
    getPumpMaintenanceSignatureUrl(record.signature_storage_path)
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
        aria-labelledby="pump-maintenance-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reg-doc-modal__header">
          <h2 id="pump-maintenance-detail-title">Manutenção da bomba</h2>
          <button type="button" className="reg-doc-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <dl className="compressor-page__detail-grid">
          <div>
            <dt>Lançado em</dt>
            <dd>{formatDateTimePtBr(record.maintained_at)}</dd>
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
            <h3>Foto da manutenção</h3>
            {photoUrl ? (
              <button
                type="button"
                className="photo-open-btn"
                onClick={() => setLightboxOpen(true)}
                aria-label="Ampliar foto da manutenção"
              >
                <img src={photoUrl} alt="Foto da manutenção" className="compressor-page__photo-preview" />
              </button>
            ) : (
              <p className="compressor-page__empty">Foto indisponível.</p>
            )}
            <dl className="fuel-photo__meta">
              <div>
                <dt>Data e hora da foto</dt>
                <dd>{formatDateTimePtBr(record.maintenance_photo_captured_at)}</dd>
              </div>
              <div>
                <dt>Coordenadas</dt>
                <dd>
                  {formatCoords(record.maintenance_photo_latitude, record.maintenance_photo_longitude)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {signatureUrl && (
          <div className="pump-page__signature-preview">
            <h3>Assinatura</h3>
            <img src={signatureUrl} alt="Assinatura de quem fez a manutenção" />
          </div>
        )}
      </div>
      {lightboxOpen && photoUrl && (
        <PhotoLightbox url={photoUrl} alt="Foto da manutenção" onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  )
}
