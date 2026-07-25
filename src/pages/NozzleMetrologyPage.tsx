import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import LiveCameraCapture from '../components/fuel-analyses/LiveCameraCapture'
import SignaturePad from '../components/fuel-analyses/SignaturePad'
import VolumetrySuggestField from '../components/nozzle-metrology/VolumetrySuggestField'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  formatCoords,
  formatDateTimePtBr,
} from '../config/fuel-analyses'
import {
  evaluateNozzleDraft,
  FLOW_MAX_LITERS_REQUIRED,
  FLOW_MAX_TIME_LABEL,
  FLOW_MIN_LITERS_LIMIT,
  FLOW_MIN_TIME_LABEL,
  formatNozzleLabel,
  formatVolumetryLabel,
  fuelLabel,
  NOZZLE_FUEL_OPTIONS,
  NOZZLE_METROLOGY_MAX_NOZZLES,
  NOZZLE_METROLOGY_REGULATION,
  statusLabel,
  VOLUMETRY_SPREAD_MAX_PERCENT,
  VOLUMETRY_TOLERANCE_MAX,
  VOLUMETRY_TOLERANCE_MIN,
  type MetrologyStatus,
  type NozzleFuelKey,
} from '../config/nozzle-metrology'
import {
  getMyPostoId,
  getNozzleMetrologyPhotoUrl,
  getNozzleMetrologySignatureUrl,
  listNozzleMetrologyVerifications,
  saveNozzleMetrologyVerification,
  type NozzleMetrologyVerification,
} from '../lib/nozzle-metrology'
import '../pages/RegulatoryDocumentsPage.css'
import '../pages/FuelAnalysesPage.css'
import '../pages/DirectRegisterPage.css'
import './NozzleMetrologyPage.css'

type NozzleMetrologyPageProps = {
  isReadOnly: boolean
}

type NozzleDraft = {
  id: string
  nozzleNumber: number
  fuelProductKey: NozzleFuelKey | ''
  fuelOtherLabel: string
  volumetryMin: number | null
  volumetryMax: number | null
  flowMinLiters: string
  flowMaxLiters: string
  sealsOk: boolean | null
  leakage: boolean | null
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

function parseLiters(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function createEmptyNozzle(nozzleNumber: number): NozzleDraft {
  return {
    id: crypto.randomUUID(),
    nozzleNumber,
    fuelProductKey: '',
    fuelOtherLabel: '',
    volumetryMin: null,
    volumetryMax: null,
    flowMinLiters: '',
    flowMaxLiters: '',
    sealsOk: null,
    leakage: null,
  }
}

export default function NozzleMetrologyPage({ isReadOnly }: NozzleMetrologyPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [history, setHistory] = useState<NozzleMetrologyVerification[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [composerOpen, setComposerOpen] = useState(false)
  const [quantityInput, setQuantityInput] = useState('1')
  const [employeeName, setEmployeeName] = useState('')
  const [verifiedAtPreview, setVerifiedAtPreview] = useState(() => new Date().toISOString())
  const [nozzles, setNozzles] = useState<NozzleDraft[]>([])
  const [sheetReady, setSheetReady] = useState(false)

  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [signatureKey, setSignatureKey] = useState(0)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoLatitude, setPhotoLatitude] = useState<number | null>(null)
  const [photoLongitude, setPhotoLongitude] = useState<number | null>(null)
  const [photoCapturedAt, setPhotoCapturedAt] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [viewRow, setViewRow] = useState<NozzleMetrologyVerification | null>(null)

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const rows = await listNozzleMetrologyVerifications(id)
      setHistory(rows)
    } catch {
      setPageError('Não foi possível carregar as verificações metrológicas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  useEffect(() => {
    if (!composerOpen) return
    const timer = window.setInterval(() => {
      setVerifiedAtPreview(new Date().toISOString())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [composerOpen])

  const nozzleEvaluations = useMemo(
    () =>
      nozzles.map((nozzle) =>
        evaluateNozzleDraft({
          fuelProductKey: nozzle.fuelProductKey,
          fuelOtherLabel: nozzle.fuelOtherLabel,
          volumetryMin: nozzle.volumetryMin,
          volumetryMax: nozzle.volumetryMax,
          flowMinLiters: parseLiters(nozzle.flowMinLiters),
          flowMaxLiters: parseLiters(nozzle.flowMaxLiters),
          sealsOk: nozzle.sealsOk,
          leakage: nozzle.leakage,
        }),
      ),
    [nozzles],
  )

  const overallStatus = useMemo((): MetrologyStatus | 'pendente' => {
    if (nozzleEvaluations.length === 0) return 'pendente'
    if (nozzleEvaluations.some((row) => row.status === 'pendente')) return 'pendente'
    if (nozzleEvaluations.some((row) => row.status === 'reprovado')) return 'reprovado'
    return 'aprovado'
  }, [nozzleEvaluations])

  function clearLivePhoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setPhotoLatitude(null)
    setPhotoLongitude(null)
    setPhotoCapturedAt(null)
    setPhotoError(null)
  }

  function resetComposer() {
    setQuantityInput('1')
    setEmployeeName('')
    setVerifiedAtPreview(new Date().toISOString())
    setNozzles([])
    setSheetReady(false)
    setSignatureBlob(null)
    setSignatureKey((key) => key + 1)
    clearLivePhoto()
    setFormError(null)
  }

  function openComposer() {
    resetComposer()
    setComposerOpen(true)
  }

  function closeComposer() {
    resetComposer()
    setComposerOpen(false)
  }

  function handleGenerateSheet() {
    const qty = Number(quantityInput)
    if (!Number.isInteger(qty) || qty < 1 || qty > NOZZLE_METROLOGY_MAX_NOZZLES) {
      setFormError(`Informe a quantidade de bicos entre 1 e ${NOZZLE_METROLOGY_MAX_NOZZLES}.`)
      return
    }
    setFormError(null)
    setNozzles(Array.from({ length: qty }, (_, index) => createEmptyNozzle(index + 1)))
    setSheetReady(true)
  }

  function updateNozzle(id: string, patch: Partial<NozzleDraft>) {
    setNozzles((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  async function handleLivePhotoCapture(file: File) {
    if (file.size > FUEL_ANALYSES_MAX_FILE_BYTES) {
      setPhotoError('A foto deve ter no máximo 10 MB.')
      return
    }

    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    const previewUrl = URL.createObjectURL(file)
    setPhotoFile(file)
    setPhotoPreviewUrl(previewUrl)
    setPhotoCapturedAt(new Date().toISOString())
    setPhotoLatitude(null)
    setPhotoLongitude(null)
    setPhotoError('Obtendo coordenadas GPS...')
    setFormError(null)

    try {
      const position = await readGeolocation()
      setPhotoLatitude(position.coords.latitude)
      setPhotoLongitude(position.coords.longitude)
      setPhotoCapturedAt(new Date().toISOString())
      setPhotoError(null)
    } catch {
      setPhotoLatitude(null)
      setPhotoLongitude(null)
      setPhotoError('Não foi possível obter a localização. Permita o GPS e tire a foto novamente.')
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!postoId || isReadOnly || !sheetReady) return

    if (overallStatus === 'pendente') {
      setFormError('Preencha todos os campos de todos os bicos antes de salvar.')
      return
    }
    if (!employeeName.trim()) {
      setFormError('Informe o nome do funcionário que fez o lançamento.')
      return
    }
    if (!photoFile || photoLatitude == null || photoLongitude == null || !photoCapturedAt) {
      setFormError('Tire a foto e aguarde as coordenadas GPS antes de salvar.')
      return
    }
    if (!signatureBlob) {
      setFormError('Assine no campo em branco antes de salvar.')
      return
    }

    setBusy(true)
    setFormError(null)
    const verifiedAt = new Date().toISOString()

    try {
      const saved = await saveNozzleMetrologyVerification({
        postoId,
        verifiedAt,
        employeeFullName: employeeName,
        overallStatus: overallStatus as MetrologyStatus,
        signatureBlob,
        photoFile,
        photoLatitude,
        photoLongitude,
        photoCapturedAt,
        items: nozzles.map((nozzle, index) => {
          const evaluation = nozzleEvaluations[index]
          return {
            nozzleNumber: nozzle.nozzleNumber,
            fuelProductKey: nozzle.fuelProductKey as NozzleFuelKey,
            fuelOtherLabel:
              nozzle.fuelProductKey === 'outro' ? nozzle.fuelOtherLabel.trim() : null,
            volumetryMin: nozzle.volumetryMin!,
            volumetryMax: nozzle.volumetryMax!,
            flowMinLiters: parseLiters(nozzle.flowMinLiters)!,
            flowMaxLiters: parseLiters(nozzle.flowMaxLiters)!,
            sealsOk: nozzle.sealsOk!,
            leakage: nozzle.leakage!,
            itemStatus: evaluation.status as MetrologyStatus,
          }
        }),
      })
      setHistory((current) => [saved, ...current.filter((row) => row.id !== saved.id)])
      closeComposer()
    } catch {
      setFormError('Não foi possível salvar a verificação. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando verificações metrológicas...</p>
  }

  return (
    <div className="diesel-page nozzle-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <p className="nozzle-regulation" role="note">
            {NOZZLE_METROLOGY_REGULATION}
          </p>
          <h1>Verificação Metrológica de Bicos</h1>
          <p>
            Lance a planilha por quantidade de bicos, registre volumetria/vazão e obtenha o resultado
            APROVADO ou REPROVADO automaticamente, conforme a {NOZZLE_METROLOGY_REGULATION}.
          </p>
        </div>
        {!composerOpen && !isReadOnly && (
          <button type="button" className="reg-docs-page__add-btn" onClick={openComposer}>
            Lançar verificação
          </button>
        )}
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      {composerOpen && (
        <section className="diesel-panel nozzle-composer">
          <div className="fuel-panel__header">
            <div>
              <h2>Nova verificação</h2>
              <p className="nozzle-regulation nozzle-regulation--inline" role="note">
                {NOZZLE_METROLOGY_REGULATION}
              </p>
              <p className="fuel-panel__hint">
                Data e horário do lançamento:{' '}
                <strong>{formatDateTimePtBr(verifiedAtPreview)}</strong>
              </p>
              <p className="fuel-panel__hint">
                Volumetria em passos de 20 (−200 a +200). Tolerância individual: {VOLUMETRY_TOLERANCE_MIN}{' '}
                a {VOLUMETRY_TOLERANCE_MAX}. Diferença entre mínima e máxima do bico: no máximo{' '}
                {String(VOLUMETRY_SPREAD_MAX_PERCENT).replace('.', ',')}% (cada 20 = 0,1%). Vazão
                mínima: até {FLOW_MIN_LITERS_LIMIT} L em {FLOW_MIN_TIME_LABEL}; máxima: pelo menos{' '}
                {FLOW_MAX_LITERS_REQUIRED} L em {FLOW_MAX_TIME_LABEL}.
              </p>
            </div>
            <button type="button" className="btn btn--secondary" onClick={closeComposer} disabled={busy}>
              Cancelar
            </button>
          </div>

          {!sheetReady ? (
            <div className="nozzle-qty">
              <label className="reg-doc-form__field">
                <span>Nome do funcionário</span>
                <input
                  type="text"
                  value={employeeName}
                  onChange={(event) => setEmployeeName(event.target.value)}
                  disabled={isReadOnly || busy}
                  placeholder="Quem fez o lançamento"
                  autoComplete="name"
                />
              </label>
              <label className="reg-doc-form__field">
                <span>Quantidade de bicos</span>
                <input
                  type="number"
                  min={1}
                  max={NOZZLE_METROLOGY_MAX_NOZZLES}
                  step={1}
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  disabled={isReadOnly || busy}
                />
              </label>
              <button
                type="button"
                className="btn btn--primary"
                disabled={isReadOnly || busy}
                onClick={handleGenerateSheet}
              >
                Gerar planilha
              </button>
            </div>
          ) : (
            <form className="nozzle-sheet" onSubmit={(event) => void handleSubmit(event)}>
              <div className="nozzle-meta">
                <label className="reg-doc-form__field">
                  <span>Nome do funcionário</span>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(event) => setEmployeeName(event.target.value)}
                    disabled={isReadOnly || busy}
                    placeholder="Quem fez o lançamento"
                    autoComplete="name"
                    required
                  />
                </label>
                <label className="reg-doc-form__field">
                  <span>Data e horário</span>
                  <input
                    type="text"
                    value={formatDateTimePtBr(verifiedAtPreview)}
                    readOnly
                    tabIndex={-1}
                    className="nozzle-meta__datetime-input"
                  />
                </label>
              </div>

              <div className={`nozzle-overall nozzle-overall--${overallStatus}`}>
                Resultado geral: <strong>{statusLabel(overallStatus)}</strong>
              </div>

              <div className="nozzle-cards">
                {nozzles.map((nozzle, index) => {
                  const evaluation = nozzleEvaluations[index]
                  return (
                    <article key={nozzle.id} className="nozzle-card">
                      <header className="nozzle-card__header">
                        <h3>{formatNozzleLabel(nozzle.nozzleNumber)}</h3>
                        <span className={`nozzle-badge nozzle-badge--${evaluation.status}`}>
                          {statusLabel(evaluation.status)}
                        </span>
                      </header>

                      <div className="nozzle-card__fuel">
                        <label className="reg-doc-form__field">
                          <span>Combustível</span>
                          <select
                            value={nozzle.fuelProductKey}
                            disabled={isReadOnly || busy}
                            onChange={(event) =>
                              updateNozzle(nozzle.id, {
                                fuelProductKey: event.target.value as NozzleFuelKey | '',
                                fuelOtherLabel:
                                  event.target.value === 'outro' ? nozzle.fuelOtherLabel : '',
                              })
                            }
                          >
                            <option value="">Selecione...</option>
                            {NOZZLE_FUEL_OPTIONS.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {nozzle.fuelProductKey === 'outro' && (
                          <label className="reg-doc-form__field">
                            <span>Nome do combustível</span>
                            <input
                              type="text"
                              value={nozzle.fuelOtherLabel}
                              disabled={isReadOnly || busy}
                              onChange={(event) =>
                                updateNozzle(nozzle.id, { fuelOtherLabel: event.target.value })
                              }
                              placeholder="Digite o combustível"
                            />
                          </label>
                        )}
                      </div>

                      <div className="nozzle-vol-grid">
                        <VolumetrySuggestField
                          label="Vol. mínima"
                          value={nozzle.volumetryMin}
                          disabled={isReadOnly || busy}
                          onChange={(value) => updateNozzle(nozzle.id, { volumetryMin: value })}
                        />
                        <label className="reg-doc-form__field">
                          <span>Vazão (1 min)</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={nozzle.flowMinLiters}
                            disabled={isReadOnly || busy}
                            onChange={(event) =>
                              updateNozzle(nozzle.id, { flowMinLiters: event.target.value })
                            }
                            placeholder={`≤ ${FLOW_MIN_LITERS_LIMIT} L`}
                          />
                        </label>
                        <VolumetrySuggestField
                          label="Vol. máxima"
                          value={nozzle.volumetryMax}
                          disabled={isReadOnly || busy}
                          onChange={(value) => updateNozzle(nozzle.id, { volumetryMax: value })}
                        />
                        <label className="reg-doc-form__field">
                          <span>Vazão (12 s)</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={nozzle.flowMaxLiters}
                            disabled={isReadOnly || busy}
                            onChange={(event) =>
                              updateNozzle(nozzle.id, { flowMaxLiters: event.target.value })
                            }
                            placeholder={`≥ ${FLOW_MAX_LITERS_REQUIRED} L`}
                          />
                        </label>
                      </div>

                      <div className="nozzle-card__choices">
                        <div className="reg-doc-form__field">
                          <span>Lacres</span>
                          <div className="nozzle-choice-row">
                            <label>
                              <input
                                type="radio"
                                name={`seals-${nozzle.id}`}
                                checked={nozzle.sealsOk === true}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { sealsOk: true })}
                              />
                              OK
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`seals-${nozzle.id}`}
                                checked={nozzle.sealsOk === false}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { sealsOk: false })}
                              />
                              Não OK
                            </label>
                          </div>
                        </div>

                        <div className="reg-doc-form__field">
                          <span>Vazamento</span>
                          <div className="nozzle-choice-row">
                            <label>
                              <input
                                type="radio"
                                name={`leak-${nozzle.id}`}
                                checked={nozzle.leakage === false}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { leakage: false })}
                              />
                              Não
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`leak-${nozzle.id}`}
                                checked={nozzle.leakage === true}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { leakage: true })}
                              />
                              Sim
                            </label>
                          </div>
                        </div>
                      </div>

                      {evaluation.status === 'reprovado' && evaluation.reasons.length > 0 && (
                        <ul className="nozzle-reasons">
                          {evaluation.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  )
                })}
              </div>

              <div className="nozzle-evidence">
                <div className="reg-doc-form__field">
                  <span>Foto com data/hora e GPS</span>
                  <LiveCameraCapture
                    disabled={isReadOnly || busy}
                    previewUrl={photoPreviewUrl}
                    onCapture={(file) => void handleLivePhotoCapture(file)}
                    onClear={clearLivePhoto}
                  />
                  {photoPreviewUrl && (
                    <div className="nozzle-photo-preview">
                      <p>
                        {photoCapturedAt
                          ? formatDateTimePtBr(photoCapturedAt)
                          : 'Horário pendente'}
                        {photoLatitude != null && photoLongitude != null
                          ? ` · ${formatCoords(photoLatitude, photoLongitude)}`
                          : ''}
                      </p>
                    </div>
                  )}
                  {photoError && <p className="nozzle-inline-error">{photoError}</p>}
                </div>

                <div className="reg-doc-form__field">
                  <span>Assinatura</span>
                  <SignaturePad
                    key={signatureKey}
                    disabled={isReadOnly || busy}
                    height={110}
                    onChange={setSignatureBlob}
                  />
                </div>
              </div>

              {formError && (
                <p className="reg-doc-form__error" role="alert">
                  {formError}
                </p>
              )}

              <div className="nozzle-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => {
                    setSheetReady(false)
                    setNozzles([])
                    setFormError(null)
                  }}
                >
                  Alterar quantidade
                </button>
                <button type="submit" className="btn btn--primary" disabled={isReadOnly || busy}>
                  {busy ? 'Salvando...' : 'Salvar verificação'}
                </button>
              </div>
            </form>
          )}

          {!sheetReady && formError && (
            <p className="reg-doc-form__error" role="alert">
              {formError}
            </p>
          )}
        </section>
      )}

      <section className="diesel-panel">
        <h2>Histórico</h2>
        {history.length === 0 ? (
          <p className="fuel-panel__hint">Nenhuma verificação lançada ainda.</p>
        ) : (
          <div className="reg-docs-table-wrap">
            <table className="reg-docs-table">
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Funcionário</th>
                  <th>Bicos</th>
                  <th>Resultado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTimePtBr(row.verified_at)}</td>
                    <td>{row.employee_full_name}</td>
                    <td>{row.nozzle_count}</td>
                    <td>
                      <span className={`nozzle-badge nozzle-badge--${row.overall_status}`}>
                        {statusLabel(row.overall_status)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setViewRow(row)}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {viewRow && (
        <VerificationDetailModal
          verification={viewRow}
          onClose={() => setViewRow(null)}
        />
      )}
    </div>
  )
}

function VerificationDetailModal({
  verification,
  onClose,
}: {
  verification: NozzleMetrologyVerification
  onClose: () => void
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getNozzleMetrologyPhotoUrl(verification.photo_storage_path),
      getNozzleMetrologySignatureUrl(verification.signature_storage_path),
    ])
      .then(([photo, signature]) => {
        if (cancelled) return
        setPhotoUrl(photo)
        setSignatureUrl(signature)
      })
      .catch(() => {
        if (cancelled) return
        setPhotoUrl(null)
        setSignatureUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [verification])

  return (
    <div className="nozzle-modal" role="dialog" aria-modal="true">
      <button type="button" className="nozzle-modal__backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="nozzle-modal__panel">
        <header className="fuel-panel__header">
          <div>
            <h2>Verificação · {formatDateTimePtBr(verification.verified_at)}</h2>
            <p className="nozzle-regulation nozzle-regulation--inline" role="note">
              {NOZZLE_METROLOGY_REGULATION}
            </p>
            <p className="fuel-panel__hint">
              Funcionário: <strong>{verification.employee_full_name}</strong>
            </p>
            <p className="fuel-panel__hint">
              Resultado geral:{' '}
              <strong className={`nozzle-badge nozzle-badge--${verification.overall_status}`}>
                {statusLabel(verification.overall_status)}
              </strong>
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="nozzle-cards">
          {(verification.items ?? []).map((item) => (
            <article key={item.id} className="nozzle-card">
              <header className="nozzle-card__header">
                <h3>{formatNozzleLabel(item.nozzle_number)}</h3>
                <span className={`nozzle-badge nozzle-badge--${item.item_status}`}>
                  {statusLabel(item.item_status)}
                </span>
              </header>
              <dl className="nozzle-detail-list">
                <div>
                  <dt>Combustível</dt>
                  <dd>{fuelLabel(item.fuel_product_key, item.fuel_other_label)}</dd>
                </div>
                <div>
                  <dt>Volumetria mín / máx</dt>
                  <dd>
                    {formatVolumetryLabel(item.volumetry_min)} /{' '}
                    {formatVolumetryLabel(item.volumetry_max)}
                  </dd>
                </div>
                <div>
                  <dt>Vazão mín / máx (L)</dt>
                  <dd>
                    {item.flow_min_liters} / {item.flow_max_liters}
                  </dd>
                </div>
                <div>
                  <dt>Lacres</dt>
                  <dd>{item.seals_ok ? 'OK' : 'Não OK'}</dd>
                </div>
                <div>
                  <dt>Vazamento</dt>
                  <dd>{item.leakage ? 'Sim' : 'Não'}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="nozzle-evidence">
          {photoUrl && (
            <div>
              <h3>Foto</h3>
              <img className="nozzle-photo-preview__img" src={photoUrl} alt="Foto da verificação" />
              <p className="fuel-panel__hint">
                {formatDateTimePtBr(verification.photo_captured_at)} ·{' '}
                {formatCoords(verification.photo_latitude, verification.photo_longitude)}
              </p>
            </div>
          )}
          {signatureUrl && (
            <div>
              <h3>Assinatura</h3>
              <img className="nozzle-signature" src={signatureUrl} alt="Assinatura" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
