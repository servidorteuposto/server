import { FormEvent, useCallback, useEffect, useState } from 'react'
import LiveCameraCapture from '../components/fuel-analyses/LiveCameraCapture'
import SignaturePad from '../components/fuel-analyses/SignaturePad'
import { COMPRESSOR_INSPECTION_MAX_FILE_BYTES } from '../config/compressor-inspection'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  formatCoords,
  formatDateTimePtBr,
  parseLitersInput,
} from '../config/fuel-analyses'
import {
  getCompressorInspectionPhotoUrl,
  getCompressorInspectionSignatureUrl,
  listCompressorInspections,
  saveCompressorInspection,
  type CompressorInspection,
} from '../lib/compressor-inspection'
import {
  buildCompressorInspectionBulkPdfFileName,
  buildCompressorInspectionPdfFileName,
  downloadCompressorInspectionPdf,
  generateCompressorInspectionPrintPdf,
  type CompressorExportPosto,
} from '../lib/compressor-inspection-export'
import { getMyPostoProfile } from '../lib/fuel-analyses'
import { openRaqPdfForPrint } from '../lib/raq-print-report'
import '../pages/RegulatoryDocumentsPage.css'
import '../pages/FuelAnalysesPage.css'
import './DieselDrainagesPage.css'
import './CompressorInspectionPage.css'

type CompressorInspectionPageProps = {
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

function formatCapacityLiters(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
  }).format(value)
}

function formatYesNo(value: boolean | null | undefined) {
  if (value == null) return '—'
  return value ? 'Sim' : 'Não'
}

function YesNoField({
  legend,
  name,
  value,
  onChange,
  disabled,
}: {
  legend: string
  name: string
  value: boolean | null
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="diesel-yesno">
      <legend>{legend} *</legend>
      <label className="diesel-yesno__option">
        <input
          type="radio"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
          disabled={disabled}
        />
        <span>Sim</span>
      </label>
      <label className="diesel-yesno__option">
        <input
          type="radio"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
          disabled={disabled}
        />
        <span>Não</span>
      </label>
    </fieldset>
  )
}

export default function CompressorInspectionPage({ isReadOnly }: CompressorInspectionPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [postoInfo, setPostoInfo] = useState<CompressorExportPosto | null>(null)
  const [inspections, setInspections] = useState<CompressorInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [bulkExporting, setBulkExporting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportingMode, setExportingMode] = useState<'print' | 'download' | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [capacityLiters, setCapacityLiters] = useState('')
  const [manometerOk, setManometerOk] = useState<boolean | null>(null)
  const [safetyValveOk, setSafetyValveOk] = useState<boolean | null>(null)
  const [oilChanged, setOilChanged] = useState<boolean | null>(null)
  const [compressorDrained, setCompressorDrained] = useState<boolean | null>(null)
  const [operatorName, setOperatorName] = useState('')
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [signatureKey, setSignatureKey] = useState(0)
  const [photo1, setPhoto1] = useState<LivePhotoState>(emptyLivePhoto())
  const [photo2, setPhoto2] = useState<LivePhotoState>(emptyLivePhoto())
  const [viewInspection, setViewInspection] = useState<CompressorInspection | null>(null)
  const [viewPhotoUrls, setViewPhotoUrls] = useState<{ photo1: string | null; photo2: string | null }>({
    photo1: null,
    photo2: null,
  })

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const profile = await getMyPostoProfile()
      setPostoId(profile.id)
      setPostoInfo({
        nome: profile.nome,
        cnpj: profile.cnpj,
        endereco: profile.endereco,
      })
      const rows = await listCompressorInspections(profile.id)
      setInspections(rows)
    } catch {
      setPageError('Não foi possível carregar as inspeções do compressor.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    return () => {
      clearLivePhotoState(photo1)
      clearLivePhotoState(photo2)
    }
  }, [photo1, photo2])

  useEffect(() => {
    let cancelled = false
    async function loadViewUrls() {
      if (!viewInspection) {
        setViewPhotoUrls({ photo1: null, photo2: null })
        return
      }
      try {
        const [url1, url2] = await Promise.all([
          getCompressorInspectionPhotoUrl(viewInspection.photo1_storage_path),
          getCompressorInspectionPhotoUrl(viewInspection.photo2_storage_path),
        ])
        if (!cancelled) setViewPhotoUrls({ photo1: url1, photo2: url2 })
      } catch {
        if (!cancelled) setViewPhotoUrls({ photo1: null, photo2: null })
      }
    }
    void loadViewUrls()
    return () => {
      cancelled = true
    }
  }, [viewInspection])

  async function capturePhoto(
    setter: (updater: (current: LivePhotoState) => LivePhotoState) => void,
    file: File,
  ) {
    if (!file.type.startsWith('image/')) {
      setter((current) => ({ ...current, error: 'Use uma foto (JPG, PNG ou WEBP).' }))
      return
    }
    if (file.size > COMPRESSOR_INSPECTION_MAX_FILE_BYTES) {
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
    clearLivePhotoState(photo1)
    clearLivePhotoState(photo2)
    setBrand('')
    setModel('')
    setSerialNumber('')
    setCapacityLiters('')
    setManometerOk(null)
    setSafetyValveOk(null)
    setOilChanged(null)
    setCompressorDrained(null)
    setOperatorName('')
    setSignatureBlob(null)
    setSignatureKey((current) => current + 1)
    setPhoto1(emptyLivePhoto())
    setPhoto2(emptyLivePhoto())
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

    if (!brand.trim()) {
      setFormError('Informe a marca do compressor.')
      return
    }
    if (!model.trim()) {
      setFormError('Informe o modelo do compressor.')
      return
    }
    if (!serialNumber.trim()) {
      setFormError('Informe o número de série.')
      return
    }
    const capacity = parseLitersInput(capacityLiters)
    if (capacity == null) {
      setFormError('Informe a capacidade em litros (número válido).')
      return
    }
    if (manometerOk == null) {
      setFormError('Informe se o manômetro está OK.')
      return
    }
    if (safetyValveOk == null) {
      setFormError('Informe se a válvula de segurança está OK.')
      return
    }
    if (oilChanged == null) {
      setFormError('Informe se o óleo foi trocado.')
      return
    }
    if (compressorDrained == null) {
      setFormError('Informe se o compressor foi drenado.')
      return
    }
    if (!operatorName.trim()) {
      setFormError('Informe o nome de quem executou a inspeção.')
      return
    }
    if (!signatureBlob) {
      setFormError('Assine no campo em branco antes de lançar a inspeção.')
      return
    }

    const photo1Error = validatePhoto(photo1, 'foto do compressor')
    if (photo1Error) {
      setFormError(photo1Error)
      return
    }
    const photo2Error = validatePhoto(photo2, 'foto do manômetro')
    if (photo2Error) {
      setFormError(photo2Error)
      return
    }

    setBusy(true)
    setFormError(null)

    try {
      const saved = await saveCompressorInspection({
        postoId,
        inspectedAt: new Date().toISOString(),
        operatorFullName: operatorName,
        signatureBlob,
        brand,
        model,
        serialNumber,
        capacityLiters: capacity,
        manometerOk,
        safetyValveOk,
        oilChanged,
        compressorDrained,
        photo1: {
          file: photo1.file!,
          latitude: photo1.latitude!,
          longitude: photo1.longitude!,
          capturedAt: photo1.capturedAt!,
        },
        photo2: {
          file: photo2.file!,
          latitude: photo2.latitude!,
          longitude: photo2.longitude!,
          capturedAt: photo2.capturedAt!,
        },
      })
      setInspections((current) => [saved, ...current])
      resetForm()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível lançar a inspeção do compressor.'
      setFormError(
        message.includes('Bucket inválido') || message.includes('r2_storage_failed')
          ? 'Storage ainda não atualizado no servidor. Avise o suporte ou tente novamente em instantes.'
          : message.includes('compressor_inspections')
            ? 'Tabela de inspeções não encontrada. A migration precisa ser aplicada no banco.'
            : message,
      )
    } finally {
      setBusy(false)
    }
  }

  const handleInspectionPdf = useCallback(
    async (inspection: CompressorInspection, mode: 'print' | 'download') => {
      if (!postoInfo) return
      setExportingId(inspection.id)
      setExportingMode(mode)
      try {
        const bytes = await generateCompressorInspectionPrintPdf(postoInfo, [inspection])
        const fileName = buildCompressorInspectionPdfFileName(postoInfo, inspection)
        if (mode === 'print') {
          await openRaqPdfForPrint(bytes, fileName)
        } else {
          downloadCompressorInspectionPdf(bytes, fileName)
        }
      } catch {
        setPageError('Não foi possível gerar o PDF da inspeção.')
      } finally {
        setExportingId(null)
        setExportingMode(null)
      }
    },
    [postoInfo],
  )

  const handleBulkExport = useCallback(async () => {
    if (!postoInfo || !inspections.length) return
    setBulkExporting(true)
    setPageError(null)
    try {
      const bytes = await generateCompressorInspectionPrintPdf(postoInfo, inspections)
      downloadCompressorInspectionPdf(bytes, buildCompressorInspectionBulkPdfFileName(postoInfo))
    } catch {
      setPageError('Não foi possível exportar as inspeções em PDF.')
    } finally {
      setBulkExporting(false)
    }
  }, [inspections, postoInfo])

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
    return <p className="reg-docs-page__loading">Carregando inspeções do compressor...</p>
  }

  return (
    <div className="compressor-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Inspeção do Compressor</h1>
          <p>
            Registre marca, modelo, número de série, capacidade e o checklist do compressor. Anexe a
            foto do compressor e a foto do manômetro — cada uma registra data, hora e coordenadas GPS
            automaticamente. Informe o nome e a assinatura de quem executou.
          </p>
        </div>
        {inspections.length > 0 && (
          <div className="fuel-header-actions">
            <button
              type="button"
              className="reg-docs-page__add-btn fuel-header-actions__btn fuel-header-actions__btn--ghost"
              onClick={() => void handleBulkExport()}
              disabled={bulkExporting || exportingId != null}
            >
              {bulkExporting ? 'Exportando...' : 'Exportar todas'}
            </button>
          </div>
        )}
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      {!isReadOnly && (
        <section className="compressor-page__form-card reg-doc-form">
          <h2 className="compressor-page__section-title">Novo lançamento</h2>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <div className="compressor-page__fields">
              <label className="reg-doc-form__field">
                <span>Marca *</span>
                <input
                  type="text"
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label className="reg-doc-form__field">
                <span>Modelo *</span>
                <input
                  type="text"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label className="reg-doc-form__field">
                <span>N° de Série *</span>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(event) => setSerialNumber(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label className="reg-doc-form__field">
                <span>Capacidade (em litros) *</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex.: 270"
                  value={capacityLiters}
                  onChange={(event) => setCapacityLiters(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label className="reg-doc-form__field">
                <span>Nome de quem executou *</span>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(event) => setOperatorName(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
            </div>

            <div className="compressor-page__fields">
              <YesNoField
                legend="Manômetro OK"
                name="manometer-ok"
                value={manometerOk}
                onChange={setManometerOk}
                disabled={busy}
              />
              <YesNoField
                legend="Válvula de segurança OK"
                name="safety-valve-ok"
                value={safetyValveOk}
                onChange={setSafetyValveOk}
                disabled={busy}
              />
              <YesNoField
                legend="Óleo trocado"
                name="oil-changed"
                value={oilChanged}
                onChange={setOilChanged}
                disabled={busy}
              />
              <YesNoField
                legend="Compressor drenado"
                name="compressor-drained"
                value={compressorDrained}
                onChange={setCompressorDrained}
                disabled={busy}
              />
            </div>

            <div className="compressor-page__photos">
              <div className="fuel-photo">
                <h3>Foto compressor *</h3>
                <LiveCameraCapture
                  label="Câmera ao vivo"
                  disabled={busy}
                  previewUrl={photo1.previewUrl}
                  onCapture={(file) => void capturePhoto((updater) => setPhoto1(updater), file)}
                  onClear={() => {
                    clearLivePhotoState(photo1)
                    setPhoto1(emptyLivePhoto())
                  }}
                />
                {photo1.error && <p className="reg-doc-form__error">{photo1.error}</p>}
                {renderPhotoMeta(photo1)}
              </div>

              <div className="fuel-photo">
                <h3>Foto manômetro *</h3>
                <LiveCameraCapture
                  label="Câmera ao vivo"
                  disabled={busy}
                  previewUrl={photo2.previewUrl}
                  onCapture={(file) => void capturePhoto((updater) => setPhoto2(updater), file)}
                  onClear={() => {
                    clearLivePhotoState(photo2)
                    setPhoto2(emptyLivePhoto())
                  }}
                />
                {photo2.error && <p className="reg-doc-form__error">{photo2.error}</p>}
                {renderPhotoMeta(photo2)}
              </div>
            </div>

            <div className="compressor-page__signature">
              <label className="reg-doc-form__field">
                <span>Assinatura de quem executou *</span>
              </label>
              <SignaturePad key={signatureKey} disabled={busy} onChange={setSignatureBlob} />
            </div>

            {formError && <p className="reg-doc-form__error">{formError}</p>}

            <div className="compressor-page__actions">
              <button type="submit" className="reg-docs-page__add-btn" disabled={busy}>
                {busy ? 'Salvando...' : 'Lançar inspeção'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="compressor-page__history">
        <h2 className="compressor-page__section-title">Histórico</h2>
        {inspections.length === 0 ? (
          <p className="compressor-page__empty">Nenhuma inspeção registrada ainda.</p>
        ) : (
          <ul className="compressor-page__list">
            {inspections.map((inspection) => (
              <li key={inspection.id} className="compressor-page__list-item">
                <div>
                  <strong>
                    {inspection.brand} · {inspection.model}
                  </strong>
                  <p>
                    Série {inspection.serial_number} · {formatCapacityLiters(inspection.capacity_liters)} L
                  </p>
                  <p className="compressor-page__meta">
                    {formatDateTimePtBr(inspection.inspected_at)}
                    {inspection.operator_full_name ? ` · ${inspection.operator_full_name}` : ''}
                  </p>
                </div>
                <div className="diesel-history__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setViewInspection(inspection)}
                    disabled={exportingId === inspection.id || bulkExporting}
                  >
                    Ver detalhes
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => void handleInspectionPdf(inspection, 'print')}
                    disabled={exportingId === inspection.id || bulkExporting}
                  >
                    {exportingId === inspection.id && exportingMode === 'print'
                      ? 'Abrindo...'
                      : 'Imprimir'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => void handleInspectionPdf(inspection, 'download')}
                    disabled={exportingId === inspection.id || bulkExporting}
                  >
                    {exportingId === inspection.id && exportingMode === 'download'
                      ? 'Gerando...'
                      : 'Exportar PDF'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewInspection && (
        <CompressorDetailsModal
          inspection={viewInspection}
          photoUrls={viewPhotoUrls}
          exportingId={exportingId}
          exportingMode={exportingMode}
          onClose={() => setViewInspection(null)}
          onPrint={() => void handleInspectionPdf(viewInspection, 'print')}
          onExport={() => void handleInspectionPdf(viewInspection, 'download')}
        />
      )}
    </div>
  )
}

function CompressorDetailsModal({
  inspection,
  photoUrls,
  exportingId,
  exportingMode,
  onClose,
  onPrint,
  onExport,
}: {
  inspection: CompressorInspection
  photoUrls: { photo1: string | null; photo2: string | null }
  exportingId: string | null
  exportingMode: 'print' | 'download' | null
  onClose: () => void
  onPrint: () => void
  onExport: () => void
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const busy = exportingId === inspection.id
  const printing = busy && exportingMode === 'print'
  const downloading = busy && exportingMode === 'download'

  useEffect(() => {
    let active = true
    if (!inspection.signature_storage_path) {
      setSignatureUrl(null)
      return
    }
    getCompressorInspectionSignatureUrl(inspection.signature_storage_path)
      .then((url) => {
        if (active) setSignatureUrl(url)
      })
      .catch(() => {
        if (active) setSignatureUrl(null)
      })
    return () => {
      active = false
    }
  }, [inspection.signature_storage_path])

  return (
    <div className="reg-doc-modal" role="presentation" onClick={onClose}>
      <div
        className="reg-doc-modal__dialog compressor-page__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compressor-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="reg-doc-modal__header">
          <h2 id="compressor-detail-title">Inspeção do compressor</h2>
          <button
            type="button"
            className="reg-doc-modal__close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </header>

        <dl className="compressor-page__detail-grid">
          <div>
            <dt>Marca</dt>
            <dd>{inspection.brand}</dd>
          </div>
          <div>
            <dt>Modelo</dt>
            <dd>{inspection.model}</dd>
          </div>
          <div>
            <dt>N° de Série</dt>
            <dd>{inspection.serial_number}</dd>
          </div>
          <div>
            <dt>Capacidade</dt>
            <dd>{formatCapacityLiters(inspection.capacity_liters)} L</dd>
          </div>
          <div>
            <dt>Manômetro OK</dt>
            <dd>{formatYesNo(inspection.manometer_ok)}</dd>
          </div>
          <div>
            <dt>Válvula de segurança OK</dt>
            <dd>{formatYesNo(inspection.safety_valve_ok)}</dd>
          </div>
          <div>
            <dt>Óleo trocado</dt>
            <dd>{formatYesNo(inspection.oil_changed)}</dd>
          </div>
          <div>
            <dt>Compressor drenado</dt>
            <dd>{formatYesNo(inspection.compressor_drained)}</dd>
          </div>
          <div>
            <dt>Executado por</dt>
            <dd>{inspection.operator_full_name || '—'}</dd>
          </div>
          <div>
            <dt>Lançado em</dt>
            <dd>{formatDateTimePtBr(inspection.inspected_at)}</dd>
          </div>
        </dl>

        <div className="compressor-page__modal-photos">
          {[
            {
              label: 'Foto compressor',
              url: photoUrls.photo1,
              capturedAt: inspection.photo1_captured_at,
              latitude: inspection.photo1_latitude,
              longitude: inspection.photo1_longitude,
            },
            {
              label: 'Foto manômetro',
              url: photoUrls.photo2,
              capturedAt: inspection.photo2_captured_at,
              latitude: inspection.photo2_latitude,
              longitude: inspection.photo2_longitude,
            },
          ].map((photo) => (
            <div key={photo.label} className="compressor-page__modal-photo">
              <h3>{photo.label}</h3>
              {photo.url ? (
                <img src={photo.url} alt={photo.label} className="compressor-page__photo-preview" />
              ) : (
                <p className="compressor-page__empty">Foto indisponível.</p>
              )}
              <dl className="fuel-photo__meta">
                <div>
                  <dt>Data e hora da foto</dt>
                  <dd>{formatDateTimePtBr(photo.capturedAt)}</dd>
                </div>
                <div>
                  <dt>Coordenadas</dt>
                  <dd>{formatCoords(photo.latitude, photo.longitude)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        {signatureUrl && (
          <div className="diesel-details__signature">
            <h3>Assinatura</h3>
            <img src={signatureUrl} alt="Assinatura de quem executou" />
          </div>
        )}

        <footer className="reg-doc-modal__footer compressor-page__modal-footer">
          <button type="button" className="btn btn--secondary" onClick={onPrint} disabled={busy}>
            {printing ? 'Abrindo...' : 'Imprimir'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onExport} disabled={busy}>
            {downloading ? 'Gerando...' : 'Exportar PDF'}
          </button>
        </footer>
      </div>
    </div>
  )
}
