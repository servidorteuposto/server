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
  buildDrainagePdfFileName,
  buildDrainageSinglePdfFileName,
  buildDrainageSpreadsheetFileName,
  downloadBlob,
  generateDrainagePrintPdf,
  generateDrainageSpreadsheetCsv,
  type DrainageExportPosto,
} from '../lib/diesel-drainage-export'
import { openRaqPdfForPrint } from '../lib/raq-print-report'
import {
  ensureStandardDieselTanks,
  getDrainagePhotoUrl,
  getDrainageSignatureUrl,
  listDieselDrainageReports,
  saveDieselDrainageReport,
  type DieselDrainageReport,
  type DieselTank,
} from '../lib/diesel-drainages'
import { getMyPostoProfile } from '../lib/fuel-analyses'
import {
  clearLocalFormDraft,
  deletePostoFormDraft,
  POSTO_FORM_DRAFT_KINDS,
  resolvePostoFormDraft,
  savePostoFormDraft,
  writeLocalFormDraft,
} from '../lib/posto-form-drafts'
import '../pages/RegulatoryDocumentsPage.css'
import '../pages/FuelAnalysesPage.css'
import './DieselDrainagesPage.css'

type DieselDrainagesPageProps = {
  isReadOnly: boolean
}

type DieselDrainageFormDraft = {
  v: 1
  savedAt: string
  tankId: string
  operatorName: string
  waterPresent: boolean | null
  impuritiesPresent: boolean | null
  drainedVolumeLiters: string
  measureTaken: string
  observations: string
  residuesConfirmed: boolean
}

const DRAFT_KIND = POSTO_FORM_DRAFT_KINDS.dieselDrainage
const DRAFT_KEY_PREFIX = 'teuposto_diesel_drainage_draft:'
const DRAFT_SAVE_DEBOUNCE_MS = 800

function draftStorageKey(postoId: string) {
  return `${DRAFT_KEY_PREFIX}${postoId}`
}

function isDieselDrainageFormDraft(value: unknown): value is DieselDrainageFormDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as DieselDrainageFormDraft
  return (
    draft.v === 1 &&
    typeof draft.savedAt === 'string' &&
    typeof draft.tankId === 'string' &&
    typeof draft.operatorName === 'string' &&
    (draft.waterPresent === true || draft.waterPresent === false || draft.waterPresent === null) &&
    (draft.impuritiesPresent === true ||
      draft.impuritiesPresent === false ||
      draft.impuritiesPresent === null) &&
    typeof draft.drainedVolumeLiters === 'string' &&
    typeof draft.measureTaken === 'string' &&
    typeof draft.observations === 'string' &&
    typeof draft.residuesConfirmed === 'boolean'
  )
}

function isMeaningfulDraft(input: {
  operatorName: string
  waterPresent: boolean | null
  impuritiesPresent: boolean | null
  drainedVolumeLiters: string
  measureTaken: string
  observations: string
  residuesConfirmed: boolean
}) {
  if (input.operatorName.trim()) return true
  if (input.waterPresent !== null) return true
  if (input.impuritiesPresent !== null) return true
  if (input.drainedVolumeLiters.trim()) return true
  if (input.measureTaken.trim()) return true
  if (input.observations.trim()) return true
  if (input.residuesConfirmed) return true
  return false
}

function buildDieselDrainageDraft(
  input: Omit<DieselDrainageFormDraft, 'v' | 'savedAt'>,
): DieselDrainageFormDraft {
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    ...input,
  }
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
  const [postoInfo, setPostoInfo] = useState<DrainageExportPosto | null>(null)
  const [tanks, setTanks] = useState<DieselTank[]>([])
  const [reports, setReports] = useState<DieselDrainageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [bulkExporting, setBulkExporting] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [periodModalOpen, setPeriodModalOpen] = useState(false)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [periodError, setPeriodError] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportingMode, setExportingMode] = useState<'print' | 'download' | null>(null)
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
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)

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
      const profile = await getMyPostoProfile()
      setPostoId(profile.id)
      setPostoInfo({
        nome: profile.nome,
        cnpj: profile.cnpj,
        endereco: profile.endereco,
      })
      const [tankRows, reportRows] = await Promise.all([
        ensureStandardDieselTanks(profile.id),
        listDieselDrainageReports(profile.id),
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

  const applyDrainageDraft = useCallback(
    (stored: DieselDrainageFormDraft, tankRows: DieselTank[]) => {
      const tankOk = stored.tankId && tankRows.some((tank) => tank.id === stored.tankId)
      if (tankOk) setTankId(stored.tankId)
      setOperatorName(stored.operatorName)
      setWaterPresent(stored.waterPresent)
      setImpuritiesPresent(stored.impuritiesPresent)
      setDrainedVolumeLiters(stored.drainedVolumeLiters)
      setMeasureTaken(stored.measureTaken)
      setObservations(stored.observations)
      setResiduesConfirmed(stored.residuesConfirmed)
      setDraftSavedAt(stored.savedAt)
    },
    [],
  )

  useEffect(() => {
    if (isReadOnly) {
      setDraftHydrated(true)
      return
    }
    if (loading) return
    if (!postoId) {
      setDraftHydrated(true)
      return
    }
    if (draftHydrated) return

    let cancelled = false
    void (async () => {
      const stored = await resolvePostoFormDraft(
        postoId,
        DRAFT_KIND,
        draftStorageKey(postoId),
        isDieselDrainageFormDraft,
      )
      if (cancelled) return
      if (stored && isMeaningfulDraft(stored)) {
        applyDrainageDraft(stored, tanks)
      }
      setDraftHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [postoId, isReadOnly, loading, draftHydrated, tanks, applyDrainageDraft])

  useEffect(() => {
    if (!draftHydrated || !postoId || isReadOnly) return

    const payload = {
      operatorName,
      waterPresent,
      impuritiesPresent,
      drainedVolumeLiters,
      measureTaken,
      observations,
      residuesConfirmed,
    }
    const timer = window.setTimeout(() => {
      if (!isMeaningfulDraft(payload)) {
        clearLocalFormDraft(draftStorageKey(postoId))
        setDraftSavedAt(null)
        void deletePostoFormDraft(postoId, DRAFT_KIND)
        return
      }
      const draft = buildDieselDrainageDraft({
        tankId,
        operatorName,
        waterPresent,
        impuritiesPresent,
        drainedVolumeLiters,
        measureTaken,
        observations,
        residuesConfirmed,
      })
      writeLocalFormDraft(draftStorageKey(postoId), draft)
      setDraftSavedAt(draft.savedAt)
      void savePostoFormDraft(postoId, DRAFT_KIND, draft).catch(() => {
        /* cache local permanece */
      })
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [
    draftHydrated,
    postoId,
    isReadOnly,
    tankId,
    operatorName,
    waterPresent,
    impuritiesPresent,
    drainedVolumeLiters,
    measureTaken,
    observations,
    residuesConfirmed,
  ])

  useEffect(() => {
    const onLeave = () => persistDraftNow()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave()
    }
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('beforeunload', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  })

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDrainedAtPreview(new Date().toISOString())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const hasDraft = isMeaningfulDraft({
    operatorName,
    waterPresent,
    impuritiesPresent,
    drainedVolumeLiters,
    measureTaken,
    observations,
    residuesConfirmed,
  })

  function persistDraftNow() {
    if (!postoId || isReadOnly || !draftHydrated) return
    const payload = {
      operatorName,
      waterPresent,
      impuritiesPresent,
      drainedVolumeLiters,
      measureTaken,
      observations,
      residuesConfirmed,
    }
    if (!isMeaningfulDraft(payload)) {
      clearLocalFormDraft(draftStorageKey(postoId))
      setDraftSavedAt(null)
      void deletePostoFormDraft(postoId, DRAFT_KIND)
      return
    }
    const draft = buildDieselDrainageDraft({
      tankId,
      operatorName,
      waterPresent,
      impuritiesPresent,
      drainedVolumeLiters,
      measureTaken,
      observations,
      residuesConfirmed,
    })
    writeLocalFormDraft(draftStorageKey(postoId), draft)
    setDraftSavedAt(draft.savedAt)
    void savePostoFormDraft(postoId, DRAFT_KIND, draft).catch(() => {
      /* cache local permanece */
    })
  }

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

  function discardDraft() {
    if (postoId) {
      clearLocalFormDraft(draftStorageKey(postoId))
      void deletePostoFormDraft(postoId, DRAFT_KIND)
    }
    setDraftSavedAt(null)
    resetDrainageForm()
  }

  useEffect(() => {
    if (!exportMenuOpen) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.diesel-export')) return
      setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [exportMenuOpen])

  const runBulkPdfExport = useCallback(
    async (source: DieselDrainageReport[], fileSuffix: string) => {
      if (!postoInfo) return
      if (!source.length) {
        setPageError('Nenhuma drenagem encontrada para exportar com esse filtro.')
        return
      }
      setBulkExporting(true)
      setPageError(null)
      setExportMenuOpen(false)
      try {
        const bytes = await generateDrainagePrintPdf(postoInfo, source)
        downloadBlob(bytes, buildDrainagePdfFileName(postoInfo, fileSuffix), 'application/pdf')
      } catch {
        setPageError('Não foi possível gerar o PDF. Tente novamente.')
      } finally {
        setBulkExporting(false)
      }
    },
    [postoInfo],
  )

  const handleBulkExportAll = useCallback(async () => {
    await runBulkPdfExport(reports, `todas-${new Date().toISOString().slice(0, 10)}`)
  }, [reports, runBulkPdfExport])

  const handlePeriodExport = useCallback(async () => {
    if (!periodFrom || !periodTo) {
      setPeriodError('Informe a data inicial e a data final.')
      return
    }
    if (periodFrom > periodTo) {
      setPeriodError('A data inicial não pode ser maior que a final.')
      return
    }
    setPeriodError(null)
    const fromMs = new Date(`${periodFrom}T00:00:00`).getTime()
    const toMs = new Date(`${periodTo}T23:59:59.999`).getTime()
    const filtered = reports.filter((report) => {
      const drained = new Date(report.drained_at).getTime()
      return drained >= fromMs && drained <= toMs
    })
    await runBulkPdfExport(filtered, `periodo-${periodFrom}_a_${periodTo}`)
    setPeriodModalOpen(false)
  }, [periodFrom, periodTo, reports, runBulkPdfExport])

  async function handleSheetExport() {
    if (!postoInfo || !reports.length || bulkExporting) return
    setBulkExporting(true)
    setPageError(null)
    setExportMenuOpen(false)
    try {
      const csv = generateDrainageSpreadsheetCsv(postoInfo, reports)
      downloadBlob(csv, buildDrainageSpreadsheetFileName(postoInfo), 'text/csv;charset=utf-8')
    } catch {
      setPageError('Não foi possível gerar a planilha. Tente novamente.')
    } finally {
      setBulkExporting(false)
    }
  }

  const handleReportPdf = useCallback(
    async (report: DieselDrainageReport, mode: 'print' | 'download') => {
      if (!postoInfo) return
      setExportingId(report.id)
      setExportingMode(mode)
      setPageError(null)
      try {
        const bytes = await generateDrainagePrintPdf(postoInfo, [report])
        const fileName = buildDrainageSinglePdfFileName(postoInfo, report)
        if (mode === 'print') {
          await openRaqPdfForPrint(bytes, fileName)
        } else {
          downloadBlob(bytes, fileName, 'application/pdf')
        }
      } catch {
        setPageError(
          mode === 'print'
            ? 'Não foi possível abrir a impressão desta drenagem. Tente novamente.'
            : 'Não foi possível gerar o PDF desta drenagem. Tente novamente.',
        )
      } finally {
        setExportingId(null)
        setExportingMode(null)
      }
    },
    [postoInfo],
  )

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
      if (postoId) {
        clearLocalFormDraft(draftStorageKey(postoId))
        void deletePostoFormDraft(postoId, DRAFT_KIND)
      }
      setDraftSavedAt(null)
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
        {reports.length > 0 && (
          <div className="fuel-header-actions diesel-export">
            <button
              type="button"
              className={`reg-docs-page__add-btn fuel-header-actions__btn fuel-header-actions__btn--ghost${exportMenuOpen ? ' is-active' : ''}`}
              onClick={() => setExportMenuOpen((open) => !open)}
              disabled={bulkExporting}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              title="Exportar drenagens em PDF"
            >
              {bulkExporting ? 'Exportando...' : 'Exportar'}
            </button>
            {exportMenuOpen && (
              <div className="diesel-export__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleBulkExportAll()}
                  disabled={bulkExporting}
                >
                  Exportar todas
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportMenuOpen(false)
                    setPeriodError(null)
                    setPeriodModalOpen(true)
                  }}
                  disabled={bulkExporting}
                >
                  Exportar por período de data
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleSheetExport()}
                  disabled={bulkExporting}
                >
                  Planilha (Excel)
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}
      {!isReadOnly && hasDraft && (
        <p className="diesel-draft-banner" role="status">
          Há um rascunho salvo neste posto
          {draftSavedAt ? ` (${formatDateTimePtBr(draftSavedAt)})` : ''}. Você pode continuar no
          computador ou no celular — foto e assinatura precisam ser feitas de novo na hora de lançar.
        </p>
      )}

      {periodModalOpen && (
        <div
          className="reg-doc-modal"
          role="presentation"
          onClick={() => setPeriodModalOpen(false)}
        >
          <div
            className="reg-doc-modal__dialog fuel-period-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="diesel-period-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="reg-doc-modal__header">
              <h2 id="diesel-period-title">Exportar por período</h2>
              <button
                type="button"
                className="reg-doc-modal__close"
                onClick={() => setPeriodModalOpen(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </header>
            <p className="fuel-period-modal__hint">
              Serão exportadas todas as drenagens lançadas entre as datas informadas (inclusive).
            </p>
            <div className="fuel-period-modal__fields">
              <label className="reg-doc-form__field">
                <span>Data inicial</span>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(event) => setPeriodFrom(event.target.value)}
                  disabled={bulkExporting}
                />
              </label>
              <label className="reg-doc-form__field">
                <span>Data final</span>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(event) => setPeriodTo(event.target.value)}
                  disabled={bulkExporting}
                />
              </label>
            </div>
            {periodError && <p className="reg-doc-form__error">{periodError}</p>}
            <div className="reg-doc-modal__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPeriodModalOpen(false)}
                disabled={bulkExporting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handlePeriodExport()}
                disabled={bulkExporting}
              >
                {bulkExporting ? 'Exportando...' : 'Exportar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertSchedules.length > 0 && (
        <div className="diesel-alerts" role="status">
          {alertSchedules.map((schedule) => (
            <DrainageAlertBanner key={schedule.tankId} schedule={schedule} />
          ))}
        </div>
      )}

      {!isReadOnly && (
        <form className="fuel-panel diesel-panel" onSubmit={handleSubmitDrainage}>
          <div className="fuel-panel__header">
            <div>
              <h2>Nova drenagem</h2>
              {hasDraft && (
                <p className="diesel-draft-hint" role="status">
                  Rascunho salvo neste posto
                  {draftSavedAt ? ` às ${formatDateTimePtBr(draftSavedAt)}` : ''}. Foto e
                  assinatura não entram no rascunho.
                </p>
              )}
            </div>
            {hasDraft && (
              <div className="fuel-panel__header-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={discardDraft}
                  disabled={busy}
                >
                  Descartar rascunho
                </button>
              </div>
            )}
          </div>
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
                  onClick={discardDraft}
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
                  <div className="diesel-history__actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setViewReport(report)}
                      disabled={exportingId === report.id || bulkExporting}
                    >
                      Ver detalhes
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => void handleReportPdf(report, 'print')}
                      disabled={exportingId === report.id || bulkExporting}
                    >
                      {exportingId === report.id && exportingMode === 'print'
                        ? 'Abrindo...'
                        : 'Imprimir'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => void handleReportPdf(report, 'download')}
                      disabled={exportingId === report.id || bulkExporting}
                    >
                      {exportingId === report.id && exportingMode === 'download'
                        ? 'Gerando...'
                        : 'Exportar PDF'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {viewReport && (
        <DrainageDetailsModal
          report={viewReport}
          exportingId={exportingId}
          exportingMode={exportingMode}
          onClose={() => setViewReport(null)}
          onPrint={() => void handleReportPdf(viewReport, 'print')}
          onExport={() => void handleReportPdf(viewReport, 'download')}
        />
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
  exportingId,
  exportingMode,
  onClose,
  onPrint,
  onExport,
}: {
  report: DieselDrainageReport
  exportingId: string | null
  exportingMode: 'print' | 'download' | null
  onClose: () => void
  onPrint: () => void
  onExport: () => void
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const busy = exportingId === report.id
  const printing = busy && exportingMode === 'print'
  const downloading = busy && exportingMode === 'download'

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
          <button type="button" className="btn btn--secondary" onClick={onPrint} disabled={busy}>
            {printing ? 'Abrindo...' : 'Imprimir'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onExport} disabled={busy}>
            {downloading ? 'Gerando...' : 'Exportar PDF'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
