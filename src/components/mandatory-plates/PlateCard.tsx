import { FormEvent, useEffect, useState } from 'react'
import LiveCameraCapture from '../fuel-analyses/LiveCameraCapture'
import { MANDATORY_PLATES_MAX_FILE_BYTES } from '../../config/mandatory-plates'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  formatCoords,
  formatDateTimePtBr,
  isImageFile,
} from '../../config/fuel-analyses'
import {
  getMandatoryPlateFileUrl,
  type LivePhotoCapture,
  type MandatoryPlate,
} from '../../lib/mandatory-plates'
import { describeOperationalSaveError } from '../../lib/storage-errors'
import PhotoLightbox from '../PhotoLightbox'

type PlateCardProps = {
  title: string
  description?: string
  plate: MandatoryPlate | null
  isStandard: boolean
  isReadOnly: boolean
  busy: boolean
  onSave: (payload: { photo: LivePhotoCapture }) => Promise<void>
  onDelete?: () => Promise<void>
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

export default function PlateCard({
  title,
  description,
  plate,
  isStandard,
  isReadOnly,
  busy,
  onSave,
  onDelete,
}: PlateCardProps) {
  const hasPhoto = Boolean(plate?.photo_path)
  const [replacing, setReplacing] = useState(!hasPhoto)
  const [error, setError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<LivePhotoState>(emptyLivePhoto())
  const [existingUrl, setExistingUrl] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null)

  const status = hasPhoto ? 'registrada' : 'pendente'

  useEffect(() => {
    setPhoto((current) => {
      clearLivePhotoState(current)
      return emptyLivePhoto()
    })
    setReplacing(!hasPhoto)
    setError(null)
  }, [plate?.id, plate?.photo_path, hasPhoto])

  useEffect(() => {
    let cancelled = false
    async function loadUrl() {
      if (!plate?.photo_path) {
        setExistingUrl(null)
        return
      }
      try {
        const url = await getMandatoryPlateFileUrl(plate.photo_path)
        if (!cancelled) setExistingUrl(url)
      } catch {
        if (!cancelled) setExistingUrl(null)
      }
    }
    void loadUrl()
    return () => {
      cancelled = true
    }
  }, [plate?.photo_path])

  async function captureInto(file: File) {
    if (!isImageFile(file)) {
      setPhoto((current) => {
        clearLivePhotoState(current)
        return { ...emptyLivePhoto(), error: 'A foto precisa ser uma imagem.' }
      })
      return
    }
    if (file.size > MANDATORY_PLATES_MAX_FILE_BYTES || file.size > FUEL_ANALYSES_MAX_FILE_BYTES) {
      setPhoto((current) => {
        clearLivePhotoState(current)
        return { ...emptyLivePhoto(), error: 'A foto deve ter no máximo 10 MB.' }
      })
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

  function toLiveCapture(state: LivePhotoState): LivePhotoCapture | null {
    if (!state.file || state.latitude == null || state.longitude == null || !state.capturedAt) {
      return null
    }
    return {
      file: state.file,
      latitude: state.latitude,
      longitude: state.longitude,
      capturedAt: state.capturedAt,
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const capture = toLiveCapture(photo)
    if (!capture) {
      setError('Tire a foto da placa e aguarde o horário e o GPS.')
      return
    }
    try {
      await onSave({ photo: capture })
      setReplacing(false)
    } catch (err) {
      setError(describeOperationalSaveError(err, 'mandatory_plates'))
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    const confirmed = window.confirm(`Remover a placa “${title}”?`)
    if (!confirmed) return
    setError(null)
    try {
      await onDelete()
    } catch {
      setError('Não foi possível remover a placa. Tente novamente.')
    }
  }

  const showForm = replacing || !hasPhoto

  return (
    <article className="reg-doc-card equip-card plates-card">
      <header className="plates-card__header">
        <div className="plates-card__title-row">
          <h3>{title}</h3>
          <span className={`reg-doc-card__badge equip-card__badge--${hasPhoto ? 'de_acordo' : 'pendente'}`}>
            {status === 'registrada' ? 'REGISTRADA' : 'PENDENTE'}
          </span>
        </div>
        {description ? <p className="plates-card__desc">{description}</p> : null}
        {(hasPhoto && !replacing && !isReadOnly) || (!isStandard && !isReadOnly) ? (
          <div className="plates-card__header-actions">
            {hasPhoto && !replacing && !isReadOnly && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => setReplacing(true)}
              >
                Trocar foto
              </button>
            )}
            {!isStandard && !isReadOnly && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                Remover
              </button>
            )}
          </div>
        ) : null}
      </header>

      {!showForm && plate?.photo_path ? (
        <div className="equip-card__summary">
          {existingUrl && (
            <div className="equip-card__media">
              <button
                type="button"
                className="equip-card__photo-btn"
                onClick={() => setLightbox({ url: existingUrl, alt: title })}
                aria-label={`Ampliar foto de ${title}`}
              >
                <img src={existingUrl} alt={title} />
              </button>
              <span>
                {plate.photo_captured_at ? formatDateTimePtBr(plate.photo_captured_at) : '—'}
                {plate.photo_latitude != null && plate.photo_longitude != null
                  ? ` · ${formatCoords(plate.photo_latitude, plate.photo_longitude)}`
                  : ''}
              </span>
            </div>
          )}
        </div>
      ) : (
        <form className="reg-doc-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="reg-doc-form__field">
            <span>Foto da placa (ao vivo)</span>
            <LiveCameraCapture
              label="Câmera ao vivo"
              hint="A foto precisa ser tirada agora, com horário e localização."
              disabled={isReadOnly || busy}
              previewUrl={photo.previewUrl}
              onCapture={(file) => void captureInto(file)}
              onClear={() => {
                clearLivePhotoState(photo)
                setPhoto(emptyLivePhoto())
              }}
            />
            {photo.error && <p className="reg-doc-form__error">{photo.error}</p>}
            {photo.latitude != null && photo.longitude != null && (
              <p className="equip-card__meta">
                {formatDateTimePtBr(photo.capturedAt || new Date().toISOString())} ·{' '}
                {formatCoords(photo.latitude, photo.longitude)}
              </p>
            )}
          </div>
          {!isReadOnly && (
            <div className="reg-doc-card__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Salvando...' : hasPhoto ? 'Salvar nova foto' : 'Salvar foto'}
              </button>
              {hasPhoto && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => {
                    clearLivePhotoState(photo)
                    setPhoto(emptyLivePhoto())
                    setReplacing(false)
                    setError(null)
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {error && <p className="reg-doc-form__error">{error}</p>}

      {lightbox && (
        <PhotoLightbox url={lightbox.url} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </article>
  )
}
