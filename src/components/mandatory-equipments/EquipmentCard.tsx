import { FormEvent, useEffect, useState } from 'react'
import LiveCameraCapture from '../fuel-analyses/LiveCameraCapture'
import {
  EQUIPMENT_STATUS_LABELS,
  isEquipmentCertificateFile,
  isEquipmentPhotoFile,
  MANDATORY_EQUIPMENTS_MAX_FILE_BYTES,
  type MandatoryEquipmentTemplate,
} from '../../config/mandatory-equipments'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  formatCoords,
  formatDateTimePtBr,
} from '../../config/fuel-analyses'
import {
  evaluateEquipmentCompliance,
  getMandatoryEquipmentFileUrl,
  type LivePhotoCapture,
  type MandatoryEquipment,
} from '../../lib/mandatory-equipments'

type EquipmentCardProps = {
  template: MandatoryEquipmentTemplate
  equipment: MandatoryEquipment | null
  isReadOnly: boolean
  busy: boolean
  onSave: (payload: {
    serialNumber?: string
    brand?: string
    equipmentPhoto?: LivePhotoCapture | null
    keepExistingEquipmentPhoto?: boolean
    bucketPhotos?: Array<LivePhotoCapture | null>
    keepExistingBucketPhotos?: boolean[]
    certificateFile?: File | null
    keepExistingCertificate?: boolean
    serialPhoto?: LivePhotoCapture | null
    keepExistingSerialPhoto?: boolean
  }) => Promise<void>
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

export default function EquipmentCard({
  template,
  equipment,
  isReadOnly,
  busy,
  onSave,
}: EquipmentCardProps) {
  const [replacing, setReplacing] = useState(!equipment)
  const [error, setError] = useState<string | null>(null)
  const [serialNumber, setSerialNumber] = useState(equipment?.serial_number ?? '')
  const [brand, setBrand] = useState(equipment?.brand ?? '')
  const [equipmentPhoto, setEquipmentPhoto] = useState<LivePhotoState>(emptyLivePhoto())
  const [bucketPhotos, setBucketPhotos] = useState<LivePhotoState[]>([
    emptyLivePhoto(),
    emptyLivePhoto(),
    emptyLivePhoto(),
  ])
  const [serialPhoto, setSerialPhoto] = useState<LivePhotoState>(emptyLivePhoto())
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [existingUrls, setExistingUrls] = useState<{
    equipment?: string | null
    certificate?: string | null
    serial?: string | null
    bucket?: Array<string | null>
  }>({})

  const status = evaluateEquipmentCompliance(equipment, template.key)

  useEffect(() => {
    setSerialNumber(equipment?.serial_number ?? '')
    setBrand(equipment?.brand ?? '')
    setCertificateFile(null)
    setEquipmentPhoto((current) => {
      clearLivePhotoState(current)
      return emptyLivePhoto()
    })
    setBucketPhotos((current) => {
      current.forEach(clearLivePhotoState)
      return [emptyLivePhoto(), emptyLivePhoto(), emptyLivePhoto()]
    })
    setSerialPhoto((current) => {
      clearLivePhotoState(current)
      return emptyLivePhoto()
    })
    setReplacing(!equipment)
    setError(null)
  }, [equipment])

  useEffect(() => {
    let cancelled = false
    async function loadUrls() {
      if (!equipment) {
        setExistingUrls({})
        return
      }
      try {
        const [eq, cert, serial, ...bucket] = await Promise.all([
          equipment.equipment_photo_path
            ? getMandatoryEquipmentFileUrl(equipment.equipment_photo_path)
            : Promise.resolve(null),
          equipment.certificate_path
            ? getMandatoryEquipmentFileUrl(equipment.certificate_path)
            : Promise.resolve(null),
          equipment.serial_photo_path
            ? getMandatoryEquipmentFileUrl(equipment.serial_photo_path)
            : Promise.resolve(null),
          ...[0, 1, 2].map((index) =>
            equipment.extra_photos[index]?.path
              ? getMandatoryEquipmentFileUrl(equipment.extra_photos[index].path)
              : Promise.resolve(null),
          ),
        ])
        if (cancelled) return
        setExistingUrls({
          equipment: eq,
          certificate: cert,
          serial,
          bucket,
        })
      } catch {
        if (!cancelled) setExistingUrls({})
      }
    }
    void loadUrls()
    return () => {
      cancelled = true
    }
  }, [equipment])

  async function captureInto(
    setter: (updater: (current: LivePhotoState) => LivePhotoState) => void,
    file: File,
  ) {
    if (!isEquipmentPhotoFile(file)) {
      setter((current) => ({
        ...current,
        error: 'Use uma foto (JPG, PNG ou WEBP).',
      }))
      return
    }
    if (file.size > FUEL_ANALYSES_MAX_FILE_BYTES) {
      setter((current) => ({
        ...current,
        error: 'A foto deve ter no máximo 10 MB.',
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

    if (certificateFile) {
      if (!isEquipmentCertificateFile(certificateFile)) {
        setError('O certificado deve ser PDF ou imagem.')
        return
      }
      if (certificateFile.size > MANDATORY_EQUIPMENTS_MAX_FILE_BYTES) {
        setError('O certificado deve ter no máximo 10 MB.')
        return
      }
    }

    try {
      if (template.kind === 'standard') {
        const capture = toLiveCapture(equipmentPhoto)
        const keepPhoto = Boolean(equipment?.equipment_photo_path) && !capture
        if (!capture && !keepPhoto) {
          setError('Tire a foto do equipamento e aguarde o GPS.')
          return
        }
        if (!serialNumber.trim()) {
          setError('Informe o número de série.')
          return
        }
        const keepCert = Boolean(equipment?.certificate_path) && !certificateFile
        if (!certificateFile && !keepCert) {
          setError('Anexe o certificado (foto ou PDF).')
          return
        }
        await onSave({
          serialNumber,
          equipmentPhoto: capture,
          keepExistingEquipmentPhoto: keepPhoto,
          certificateFile,
          keepExistingCertificate: keepCert,
        })
      } else if (template.kind === 'bucket') {
        if (!serialNumber.trim()) {
          setError('Informe o número de série.')
          return
        }
        if (!brand.trim()) {
          setError('Informe a marca do balde.')
          return
        }
        const captures = bucketPhotos.map(toLiveCapture)
        const keepFlags = captures.map((capture, index) =>
          Boolean(equipment?.extra_photos[index]?.path) && !capture,
        )
        if (captures.some((capture, index) => !capture && !keepFlags[index])) {
          setError('Anexe as 3 fotos do balde (com GPS quando novas).')
          return
        }
        await onSave({
          serialNumber,
          brand,
          bucketPhotos: captures,
          keepExistingBucketPhotos: keepFlags,
        })
      } else {
        const capture = toLiveCapture(serialPhoto)
        const keepSerial = Boolean(equipment?.serial_photo_path) && !capture
        if (!capture && !keepSerial) {
          setError('Tire a foto do número de série e aguarde o GPS.')
          return
        }
        const keepCert = Boolean(equipment?.certificate_path) && !certificateFile
        if (!certificateFile && !keepCert) {
          setError('Anexe o certificado (foto ou PDF).')
          return
        }
        await onSave({
          serialPhoto: capture,
          keepExistingSerialPhoto: keepSerial,
          certificateFile,
          keepExistingCertificate: keepCert,
        })
      }
      setReplacing(false)
      setCertificateFile(null)
    } catch {
      setError('Não foi possível salvar o equipamento. Tente novamente.')
    }
  }

  const showForm = replacing || !equipment

  return (
    <article className="reg-doc-card equip-card">
      <header className="reg-doc-card__header">
        <div>
          <h3>{template.title}</h3>
          <p className="equip-card__desc">{template.description}</p>
        </div>
        <div className="reg-doc-card__header-actions">
          <span className={`reg-doc-card__badge equip-card__badge--${status}`}>
            {EQUIPMENT_STATUS_LABELS[status]}
          </span>
          {equipment && !replacing && !isReadOnly && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => setReplacing(true)}
            >
              Substituir
            </button>
          )}
        </div>
      </header>

      {!showForm && equipment ? (
        <div className="equip-card__summary">
          {template.kind !== 'cylinder' && (
            <p>
              <strong>Nº de série:</strong> {equipment.serial_number || '—'}
            </p>
          )}
          {template.kind === 'bucket' && (
            <p>
              <strong>Marca:</strong> {equipment.brand || '—'}
            </p>
          )}
          {template.kind === 'standard' && existingUrls.equipment && (
            <div className="equip-card__media">
              <img src={existingUrls.equipment} alt="Foto do equipamento" />
              <span>
                {equipment.equipment_photo_captured_at
                  ? formatDateTimePtBr(equipment.equipment_photo_captured_at)
                  : '—'}
                {equipment.equipment_photo_latitude != null &&
                equipment.equipment_photo_longitude != null
                  ? ` · ${formatCoords(equipment.equipment_photo_latitude, equipment.equipment_photo_longitude)}`
                  : ''}
              </span>
            </div>
          )}
          {template.kind === 'bucket' && (
            <div className="equip-card__thumbs">
              {(existingUrls.bucket ?? []).map((url, index) =>
                url ? (
                  <img key={index} src={url} alt={`Foto ${index + 1} do balde`} />
                ) : null,
              )}
            </div>
          )}
          {template.kind === 'cylinder' && existingUrls.serial && (
            <div className="equip-card__media">
              <img src={existingUrls.serial} alt="Foto do número de série" />
              <span>
                {equipment.serial_photo_captured_at
                  ? formatDateTimePtBr(equipment.serial_photo_captured_at)
                  : '—'}
                {equipment.serial_photo_latitude != null &&
                equipment.serial_photo_longitude != null
                  ? ` · ${formatCoords(equipment.serial_photo_latitude, equipment.serial_photo_longitude)}`
                  : ''}
              </span>
            </div>
          )}
          {equipment.certificate_path && (
            <p>
              <strong>Certificado:</strong>{' '}
              {existingUrls.certificate ? (
                <a href={existingUrls.certificate} target="_blank" rel="noreferrer">
                  {equipment.certificate_name || 'Abrir anexo'}
                </a>
              ) : (
                equipment.certificate_name || 'Anexado'
              )}
            </p>
          )}
        </div>
      ) : (
        <form className="reg-doc-form" onSubmit={(event) => void handleSubmit(event)}>
          {template.kind === 'standard' && (
            <>
              <label className="reg-doc-form__field">
                <span>Número de série</span>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(event) => setSerialNumber(event.target.value)}
                  disabled={isReadOnly || busy}
                  required
                />
              </label>
              <div className="reg-doc-form__field">
                <span>Foto do equipamento</span>
                <LiveCameraCapture
                  label="Câmera ao vivo"
                  disabled={isReadOnly || busy}
                  previewUrl={equipmentPhoto.previewUrl ?? existingUrls.equipment}
                  onCapture={(file) =>
                    void captureInto((updater) => setEquipmentPhoto(updater), file)
                  }
                  onClear={() => {
                    clearLivePhotoState(equipmentPhoto)
                    setEquipmentPhoto(emptyLivePhoto())
                  }}
                />
                {equipmentPhoto.error && (
                  <p className="reg-doc-form__error">{equipmentPhoto.error}</p>
                )}
                {equipmentPhoto.latitude != null && equipmentPhoto.longitude != null && (
                  <p className="equip-card__meta">
                    {formatDateTimePtBr(equipmentPhoto.capturedAt || new Date().toISOString())} ·{' '}
                    {formatCoords(equipmentPhoto.latitude, equipmentPhoto.longitude)}
                  </p>
                )}
              </div>
              <label className="reg-doc-form__field">
                <span>Certificado (foto ou PDF)</span>
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  disabled={isReadOnly || busy}
                  onChange={(event) => setCertificateFile(event.target.files?.[0] ?? null)}
                />
                {(certificateFile || equipment?.certificate_name) && (
                  <span className="equip-card__meta">
                    {certificateFile?.name || equipment?.certificate_name}
                  </span>
                )}
              </label>
            </>
          )}

          {template.kind === 'bucket' && (
            <>
              <label className="reg-doc-form__field">
                <span>Número de série</span>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(event) => setSerialNumber(event.target.value)}
                  disabled={isReadOnly || busy}
                  required
                />
              </label>
              <label className="reg-doc-form__field">
                <span>Marca</span>
                <input
                  type="text"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  disabled={isReadOnly || busy}
                  required
                />
              </label>
              {[0, 1, 2].map((index) => (
                <div key={index} className="reg-doc-form__field">
                  <span>Foto {index + 1}</span>
                  <LiveCameraCapture
                    label={`Foto ${index + 1}`}
                    disabled={isReadOnly || busy}
                    previewUrl={
                      bucketPhotos[index].previewUrl ?? existingUrls.bucket?.[index] ?? null
                    }
                    onCapture={(file) =>
                      void captureInto((updater) => {
                        setBucketPhotos((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? updater(row) : row,
                          ),
                        )
                      }, file)
                    }
                    onClear={() => {
                      clearLivePhotoState(bucketPhotos[index])
                      setBucketPhotos((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? emptyLivePhoto() : row,
                        ),
                      )
                    }}
                  />
                  {bucketPhotos[index].error && (
                    <p className="reg-doc-form__error">{bucketPhotos[index].error}</p>
                  )}
                </div>
              ))}
            </>
          )}

          {template.kind === 'cylinder' && (
            <>
              <div className="reg-doc-form__field">
                <span>Foto do número de série</span>
                <LiveCameraCapture
                  label="Câmera ao vivo"
                  disabled={isReadOnly || busy}
                  previewUrl={serialPhoto.previewUrl ?? existingUrls.serial}
                  onCapture={(file) =>
                    void captureInto((updater) => setSerialPhoto(updater), file)
                  }
                  onClear={() => {
                    clearLivePhotoState(serialPhoto)
                    setSerialPhoto(emptyLivePhoto())
                  }}
                />
                {serialPhoto.error && <p className="reg-doc-form__error">{serialPhoto.error}</p>}
                {serialPhoto.latitude != null && serialPhoto.longitude != null && (
                  <p className="equip-card__meta">
                    {formatDateTimePtBr(serialPhoto.capturedAt || new Date().toISOString())} ·{' '}
                    {formatCoords(serialPhoto.latitude, serialPhoto.longitude)}
                  </p>
                )}
              </div>
              <label className="reg-doc-form__field">
                <span>Certificado (foto ou PDF)</span>
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  disabled={isReadOnly || busy}
                  onChange={(event) => setCertificateFile(event.target.files?.[0] ?? null)}
                />
                {(certificateFile || equipment?.certificate_name) && (
                  <span className="equip-card__meta">
                    {certificateFile?.name || equipment?.certificate_name}
                  </span>
                )}
              </label>
            </>
          )}

          {error && <p className="reg-doc-form__error">{error}</p>}

          {!isReadOnly && (
            <div className="reg-doc-card__actions">
              {equipment && replacing && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => {
                    setReplacing(false)
                    setError(null)
                    setCertificateFile(null)
                  }}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Salvando...' : equipment ? 'Salvar substituição' : 'Salvar equipamento'}
              </button>
            </div>
          )}
        </form>
      )}
    </article>
  )
}
