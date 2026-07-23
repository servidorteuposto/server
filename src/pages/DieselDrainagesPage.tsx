import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import LiveCameraCapture from '../components/fuel-analyses/LiveCameraCapture'
import SignaturePad from '../components/fuel-analyses/SignaturePad'
import {
  buildTankDrainageSchedules,
  formatDateKeyPtBr,
  isDieselTankTypeLabel,
  RESIDUES_CONFIRMATION_LABEL,
  type DrainageSchedule,
} from '../config/diesel-drainages'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  formatCoords,
  formatDateTimePtBr,
} from '../config/fuel-analyses'
import {
  ensureStandardDieselTanks,
  getDrainagePhotoUrl,
  getDrainageSignatureUrl,
  getMyPostoId,
  listDieselDrainageReports,
  saveDieselDrainageReport,
  type DieselDrainageReport,
  type DieselTank,
} from '../lib/diesel-drainages'
import '../pages/RegulatoryDocumentsPage.css'
import '../pages/FuelAnalysesPage.css'
import './DieselDrainagesPage.css'

type DieselDrainagesPageProps = {
  isReadOnly: boolean
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

export default function DieselDrainagesPage({ isReadOnly }: DieselDrainagesPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [tanks, setTanks] = useState<DieselTank[]>([])
  const [reports, setReports] = useState<DieselDrainageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [tankId, setTankId] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [waterPresent, setWaterPresent] = useState<boolean | null>(null)
  const [impuritiesPresent, setImpuritiesPresent] = useState<boolean | null>(null)
  const [drainedVolumeLiters, setDrainedVolumeLiters] = useState('')
  const [measureTaken, setMeasureTaken] = useState('')
  const [observations, setObservations] = useState('')
  const [residuesConfirmed, setResiduesConfirmed] = useState(false)
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [signatureKey, setSignatureKey] = useState(0)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoLatitude, setPhotoLatitude] = useState<number | null>(null)
  const [photoLongitude, setPhotoLongitude] = useState<number | null>(null)
  const [photoCapturedAt, setPhotoCapturedAt] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [drainedAtPreview, setDrainedAtPreview] = useState(() => new Date().toISOString())
  const [viewReport, setViewReport] = useState<DieselDrainageReport | null>(null)

  const selectableTanks = useMemo(
    () => tanks.filter((tank) => tank.is_active && isDieselTankTypeLabel(tank.name)),
    [tanks],
  )

  const schedules = useMemo(
    () => buildTankDrainageSchedules(selectableTanks, reports),
    [selectableTanks, reports],
  )

  const alertSchedules = useMemo(
    () =>
      schedules.filter((schedule) =>
        ['day_before', 'due_today', 'overdue'].includes(schedule.status),
      ),
    [schedules],
  )

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const [tankRows, reportRows] = await Promise.all([
        ensureStandardDieselTanks(id),
        listDieselDrainageReports(id),
      ])
      setTanks(tankRows)
      setReports(reportRows)
      setTankId((current) => {
        if (current && tankRows.some((tank) => tank.id === current)) return current
        return tankRows[0]?.id ?? ''
      })
    } catch {
      setPageError('Não foi possível carregar os relatórios de drenagem.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDrainedAtPreview(new Date().toISOString())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  function clearLivePhoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setPhotoLatitude(null)
    setPhotoLongitude(null)
    setPhotoCapturedAt(null)
    setPhotoError(null)
  }

  function resetDrainageForm() {
    setOperatorName('')
    setWaterPresent(null)
    setImpuritiesPresent(null)
    setDrainedVolumeLiters('')
    setMeasureTaken('')
    setObservations('')
    setResiduesConfirmed(false)
    setSignatureBlob(null)
    setSignatureKey((key) => key + 1)
    clearLivePhoto()
    setFormError(null)
    setDrainedAtPreview(new Date().toISOString())
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

  async function handleSubmitDrainage(event: FormEvent) {
    event.preventDefault()
    if (!postoId || isReadOnly) return

    if (!tankId) {
      setFormError('Selecione o tipo de tanque da drenagem.')
      return
    }
    if (!operatorName.trim()) {
      setFormError('Informe o nome completo do operador.')
      return
    }
    if (waterPresent === null) {
      setFormError('Informe se houve presença de água.')
      return
    }
    if (impuritiesPresent === null) {
      setFormError('Informe se houve presença de impurezas.')
      return
    }

    const volume = Number(drainedVolumeLiters.replace(',', '.'))
    if (!drainedVolumeLiters.trim() || Number.isNaN(volume) || volume < 0) {
      setFormError('Informe a quantidade drenada em litros (número válido).')
      return
    }
    if (!measureTaken.trim()) {
      setFormError('Informe a medida adotada.')
      return
    }
    if (!residuesConfirmed) {
      setFormError('Confirme a eliminação de resíduos e a pureza do produto na saída do dreno.')
      return
    }
    if (!photoFile || photoLatitude == null || photoLongitude == null || !photoCapturedAt) {
      setFormError('Tire a foto do local e aguarde as coordenadas GPS antes de lançar.')
      return
    }
    if (!signatureBlob) {
      setFormError('Assine no campo em branco antes de lançar o relatório.')
      return
    }

    setBusy(true)
    setFormError(null)
    const drainedAt = new Date().toISOString()

    try {
      const saved = await saveDieselDrainageReport({
        postoId,
        tankId,
        drainedAt,
        operatorFullName: operatorName,
        observations,
        residuesConfirmed,
        waterPresent,
        impuritiesPresent,
        drainedVolumeLiters: volume,
        measureTaken,
        signatureBlob,
        photoFile,
        photoLatitude,
        photoLongitude,
        photoCapturedAt,
      })
      setReports((current) => [saved, ...current])
      resetDrainageForm()
    } catch {
      setFormError('Não foi possível lançar o relatório de drenagem.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando drenagens de tanques...</p>
  }

  return (
    <div className="diesel-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Relatórios de Drenagens de Tanques de Óleo Diesel</h1>
          <p>
            Selecione o tipo de tanque (S10 ou S500), registre a drenagem com foto do local
            (data/hora e coordenadas), operador e assinatura. O ciclo é semanal: há aviso 1 dia
            antes e no dia do vencimento.
          </p>
        </div>
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      {alertSchedules.length > 0 && (
        <div className="diesel-alerts" role="status">
          {alertSchedules.map((schedule) => (
            <DrainageAlertBanner key={schedule.tankId} schedule={schedule} />
          ))}
        </div>
      )}

      {!isReadOnly && (
        <form className="fuel-panel diesel-panel" onSubmit={handleSubmitDrainage}>
          <h2>Nova drenagem</h2>
          <p className="fuel-panel__hint">
            Data e horário da drenagem: <strong>{formatDateTimePtBr(drainedAtPreview)}</strong>
          </p>

          {!selectableTanks.length ? (
            <p className="reg-doc-form__error">
              Não foi possível carregar os tipos de tanque. Atualize a página e tente novamente.
            </p>
          ) : (
            <>
              <div className="diesel-fields">
                <label className="reg-doc-form__field">
                  <span>Tanque *</span>
                  <select
                    value={tankId}
                    onChange={(event) => setTankId(event.target.value)}
                    disabled={busy}
                    required
                  >
                    <option value="">Selecione o tanque</option>
                    {selectableTanks.map((tank) => (
                      <option key={tank.id} value={tank.id}>
                        {tank.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="reg-doc-form__field">
                  <span>Nome do operador *</span>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(event) => setOperatorName(event.target.value)}
                    disabled={busy}
                    required
                  />
                </label>
              </div>

              <div className="diesel-fields">
                <fieldset className="diesel-yesno">
                  <legend>Presença de água? *</legend>
                  <label className="diesel-yesno__option">
                    <input
                      type="radio"
                      name="water-present"
                      checked={waterPresent === true}
                      onChange={() => setWaterPresent(true)}
                      disabled={busy}
                    />
                    <span>Sim</span>
                  </label>
                  <label className="diesel-yesno__option">
                    <input
                      type="radio"
                      name="water-present"
                      checked={waterPresent === false}
                      onChange={() => setWaterPresent(false)}
                      disabled={busy}
                    />
                    <span>Não</span>
                  </label>
                </fieldset>

                <fieldset className="diesel-yesno">
                  <legend>Presença de impurezas? *</legend>
                  <label className="diesel-yesno__option">
                    <input
                      type="radio"
                      name="impurities-present"
                      checked={impuritiesPresent === true}
                      onChange={() => setImpuritiesPresent(true)}
                      disabled={busy}
                    />
                    <span>Sim</span>
                  </label>
                  <label className="diesel-yesno__option">
                    <input
                      type="radio"
                      name="impurities-present"
                      checked={impuritiesPresent === false}
                      onChange={() => setImpuritiesPresent(false)}
                      disabled={busy}
                    />
                    <span>Não</span>
                  </label>
                </fieldset>
              </div>

              <div className="diesel-fields">
                <label className="reg-doc-form__field">
                  <span>Quantidade drenada (em litros) *</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={drainedVolumeLiters}
                    onChange={(event) => setDrainedVolumeLiters(event.target.value)}
                    disabled={busy}
                    required
                    placeholder="Ex.: 12,5"
                  />
                </label>

                <label className="reg-doc-form__field">
                  <span>Medida adotada *</span>
                  <input
                    type="text"
                    value={measureTaken}
                    onChange={(event) => setMeasureTaken(event.target.value)}
                    disabled={busy}
                    required
                    placeholder="Descreva a medida adotada"
                  />
                </label>
              </div>

              <label className="reg-doc-form__field">
                <span>Observações</span>
                <textarea
                  className="diesel-observations"
                  value={observations}
                  onChange={(event) => setObservations(event.target.value)}
                  rows={4}
                  disabled={busy}
                  placeholder="Registre observações da drenagem, se houver."
                />
              </label>

              <label className="diesel-check">
                <input
                  type="checkbox"
                  checked={residuesConfirmed}
                  onChange={(event) => setResiduesConfirmed(event.target.checked)}
                  disabled={busy}
                />
                <span>{RESIDUES_CONFIRMATION_LABEL}</span>
              </label>

              <div className="fuel-photo">
                <LiveCameraCapture
                  disabled={busy}
                  previewUrl={photoPreviewUrl}
                  onCapture={handleLivePhotoCapture}
                  onClear={clearLivePhoto}
                />
                <dl className="fuel-photo__meta">
                  <div>
                    <dt>Data e hora da foto</dt>
                    <dd>{photoCapturedAt ? formatDateTimePtBr(photoCapturedAt) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Coordenadas</dt>
                    <dd>
                      {photoLatitude != null && photoLongitude != null
                        ? formatCoords(photoLatitude, photoLongitude)
                        : '—'}
                    </dd>
                  </div>
                </dl>
                {photoError && <p className="reg-doc-form__error">{photoError}</p>}
              </div>

              <label className="reg-doc-form__field">
                <span>Assinatura do operador *</span>
              </label>
              <SignaturePad key={signatureKey} disabled={busy} onChange={setSignatureBlob} />

              {formError && <p className="reg-doc-form__error">{formError}</p>}

              <div className="reg-doc-card__actions diesel-form__actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={resetDrainageForm}
                  disabled={busy}
                >
                  Limpar
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy}>
                  {busy ? 'Lançando...' : 'Lançar drenagem'}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      <section className="fuel-panel diesel-panel">
        <h2>Histórico de drenagens</h2>
        {!reports.length ? (
          <p className="reg-doc-card__empty">Nenhuma drenagem lançada ainda.</p>
        ) : (
          <div className="diesel-history">
            {reports.map((report) => {
              const schedule = schedules.find((item) => item.tankId === report.tank_id)
              return (
                <article key={report.id} className="diesel-history__card">
                  <div>
                    <h3>{formatDateTimePtBr(report.drained_at)}</h3>
                    <p>
                      Tanque: {report.tank?.name ?? 'Tanque removido'} · Operador{' '}
                      {report.operator_full_name}
                    </p>
                    {report.drained_volume_liters != null && (
                      <p>
                        Volume: {formatLiters(report.drained_volume_liters)} · Água:{' '}
                        {formatYesNo(report.water_present)} · Impurezas:{' '}
                        {formatYesNo(report.impurities_present)}
                      </p>
                    )}
                    {schedule?.dueDate && schedule.status === 'ok' && (
                      <p className="diesel-history__next">
                        Próxima até {formatDateKeyPtBr(schedule.dueDate)}
                      </p>
                    )}
                    {report.observations && <p>{report.observations}</p>}
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setViewReport(report)}
                  >
                    Ver detalhes
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {viewReport && (
        <DrainageDetailsModal report={viewReport} onClose={() => setViewReport(null)} />
      )}
    </div>
  )
}

function formatYesNo(value: boolean | null | undefined) {
  if (value === true) return 'Sim'
  if (value === false) return 'Não'
  return '—'
}

function formatLiters(value: number) {
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} L`
}

function DrainageAlertBanner({ schedule }: { schedule: DrainageSchedule }) {
  const tone =
    schedule.status === 'day_before'
      ? 'warn'
      : schedule.status === 'due_today' || schedule.status === 'overdue'
        ? 'danger'
        : 'info'

  return (
    <div className={`diesel-alert diesel-alert--${tone}`}>
      <strong>{schedule.tankName}</strong>
      <p>{schedule.message}</p>
    </div>
  )
}

function DrainageDetailsModal({
  report,
  onClose,
}: {
  report: DieselDrainageReport
  onClose: () => void
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getDrainageSignatureUrl(report.signature_storage_path)
      .then((url) => {
        if (active) setSignatureUrl(url)
      })
      .catch(() => {
        if (active) setSignatureUrl(null)
      })
    return () => {
      active = false
    }
  }, [report.signature_storage_path])

  useEffect(() => {
    let active = true
    if (!report.photo_storage_path) {
      setPhotoUrl(null)
      return
    }

    getDrainagePhotoUrl(report.photo_storage_path)
      .then((url) => {
        if (active) setPhotoUrl(url)
      })
      .catch(() => {
        if (active) setPhotoUrl(null)
      })

    return () => {
      active = false
    }
  }, [report.photo_storage_path])

  return (
    <div className="reg-doc-modal" role="dialog" aria-modal="true">
      <div className="reg-doc-modal__dialog diesel-details">
        <header className="reg-doc-modal__header">
          <h2>Detalhes da drenagem</h2>
          <button type="button" className="reg-doc-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <dl className="diesel-details__meta">
          <div>
            <dt>Data e horário</dt>
            <dd>{formatDateTimePtBr(report.drained_at)}</dd>
          </div>
          <div>
            <dt>Tanque</dt>
            <dd>{report.tank?.name ?? 'Tanque removido'}</dd>
          </div>
          <div>
            <dt>Operador</dt>
            <dd>{report.operator_full_name}</dd>
          </div>
          <div>
            <dt>Presença de água</dt>
            <dd>{formatYesNo(report.water_present)}</dd>
          </div>
          <div>
            <dt>Presença de impurezas</dt>
            <dd>{formatYesNo(report.impurities_present)}</dd>
          </div>
          <div>
            <dt>Quantidade drenada</dt>
            <dd>
              {report.drained_volume_liters != null
                ? formatLiters(report.drained_volume_liters)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Medida adotada</dt>
            <dd>{report.measure_taken || '—'}</dd>
          </div>
          <div>
            <dt>Confirmação de resíduos/pureza</dt>
            <dd>{report.residues_confirmed ? 'Confirmado' : 'Não confirmado'}</dd>
          </div>
          <div>
            <dt>Observações</dt>
            <dd>{report.observations || '—'}</dd>
          </div>
          <div>
            <dt>Data e hora da foto</dt>
            <dd>
              {report.photo_captured_at ? formatDateTimePtBr(report.photo_captured_at) : '—'}
            </dd>
          </div>
          <div>
            <dt>Coordenadas da foto</dt>
            <dd>
              {report.photo_latitude != null && report.photo_longitude != null
                ? formatCoords(report.photo_latitude, report.photo_longitude)
                : '—'}
            </dd>
          </div>
        </dl>

        {photoUrl && (
          <div className="diesel-details__signature">
            <h3>Foto do local</h3>
            <img src={photoUrl} alt="Foto comprovando o local da drenagem" />
          </div>
        )}

        {signatureUrl && (
          <div className="diesel-details__signature">
            <h3>Assinatura</h3>
            <img src={signatureUrl} alt="Assinatura do operador" />
          </div>
        )}

        <div className="reg-doc-modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
