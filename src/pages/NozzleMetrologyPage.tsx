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
  isMaintenanceFuel,
  NOZZLE_FUEL_OPTIONS,
  NOZZLE_METROLOGY_MAX_NOZZLES,
  NOZZLE_METROLOGY_REGULATION,
  statusLabel,
  VOLUMETRY_SPREAD_MAX_PERCENT,
  VOLUMETRY_TOLERANCE_MAX,
  VOLUMETRY_TOLERANCE_MIN,
  type MetrologyItemStatus,
  type MetrologyStatus,
  type NozzleFuelKey,
} from '../config/nozzle-metrology'
import { getMyPostoProfile } from '../lib/fuel-analyses'
import {
  getNozzleMetrologyPhotoUrl,
  getNozzleMetrologySignatureUrl,
  listNozzleMetrologyVerifications,
  saveNozzleMetrologyVerification,
  type NozzleMetrologyVerification,
} from '../lib/nozzle-metrology'
import {
  buildMetrologyPdfFileName,
  generateMetrologyPrintPdf,
  type MetrologyExportPosto,
} from '../lib/nozzle-metrology-export'
import { downloadRaqPdf, openRaqPdfForPrint } from '../lib/raq-print-report'
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
  hoseOk: boolean | null
  displayBurned: boolean | null
  nozzleOk: boolean | null
}

type MetrologyComposerDraft = {
  v: 1
  savedAt: string
  employeeName: string
  quantityInput: string
  sheetReady: boolean
  nozzles: NozzleDraft[]
}

const DRAFT_KIND = POSTO_FORM_DRAFT_KINDS.nozzleMetrology
const DRAFT_KEY_PREFIX = 'teuposto_nozzle_metrology_draft:'
const DRAFT_SAVE_DEBOUNCE_MS = 800

function draftStorageKey(postoId: string) {
  return `${DRAFT_KEY_PREFIX}${postoId}`
}

function isMetrologyComposerDraft(value: unknown): value is MetrologyComposerDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as MetrologyComposerDraft
  return draft.v === 1 && Array.isArray(draft.nozzles)
}

function isMeaningfulDraft(input: {
  employeeName: string
  sheetReady: boolean
  nozzles: NozzleDraft[]
}) {
  if (input.employeeName.trim()) return true
  if (input.sheetReady || input.nozzles.length > 0) return true
  return false
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

function dashText(value: string | number | null | undefined) {
  if (value == null || value === '') return '—'
  return String(value)
}

function boolLabel(value: boolean | null | undefined, yes: string, no: string) {
  if (value == null) return '—'
  return value ? yes : no
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
    hoseOk: null,
    displayBurned: null,
    nozzleOk: null,
  }
}

export default function NozzleMetrologyPage({ isReadOnly }: NozzleMetrologyPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [postoInfo, setPostoInfo] = useState<MetrologyExportPosto | null>(null)
  const [history, setHistory] = useState<NozzleMetrologyVerification[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportingMode, setExportingMode] = useState<'print' | 'download' | null>(null)
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
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)

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
      const rows = await listNozzleMetrologyVerifications(profile.id)
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

  const applyMetrologyDraft = useCallback((stored: MetrologyComposerDraft) => {
    setEmployeeName(stored.employeeName)
    setQuantityInput(stored.quantityInput || String(stored.nozzles.length || 1))
    setSheetReady(stored.sheetReady && stored.nozzles.length > 0)
    setNozzles(stored.nozzles)
    setDraftSavedAt(stored.savedAt)
  }, [])

  useEffect(() => {
    if (!postoId || isReadOnly) {
      setDraftHydrated(true)
      return
    }

    let cancelled = false
    void (async () => {
      const stored = await resolvePostoFormDraft(
        postoId,
        DRAFT_KIND,
        draftStorageKey(postoId),
        isMetrologyComposerDraft,
      )
      if (cancelled) return
      if (stored && isMeaningfulDraft(stored)) {
        applyMetrologyDraft(stored)
      }
      setDraftHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [postoId, isReadOnly, applyMetrologyDraft])

  useEffect(() => {
    if (isReadOnly || !postoId || !draftHydrated || composerOpen) return

    const refresh = () => {
      void (async () => {
        const stored = await resolvePostoFormDraft(
          postoId,
          DRAFT_KIND,
          draftStorageKey(postoId),
          isMetrologyComposerDraft,
        )
        if (stored && isMeaningfulDraft(stored)) {
          applyMetrologyDraft(stored)
          return
        }
        setDraftSavedAt(null)
      })()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isReadOnly, postoId, draftHydrated, composerOpen, applyMetrologyDraft])

  useEffect(() => {
    if (!draftHydrated || !postoId || isReadOnly || !composerOpen) return

    const payload = { employeeName, sheetReady, nozzles }
    const timer = window.setTimeout(() => {
      if (!isMeaningfulDraft(payload)) {
        clearLocalFormDraft(draftStorageKey(postoId))
        setDraftSavedAt(null)
        void deletePostoFormDraft(postoId, DRAFT_KIND)
        return
      }
      const draft: MetrologyComposerDraft = {
        v: 1,
        savedAt: new Date().toISOString(),
        employeeName,
        quantityInput,
        sheetReady,
        nozzles,
      }
      writeLocalFormDraft(draftStorageKey(postoId), draft)
      setDraftSavedAt(draft.savedAt)
      void savePostoFormDraft(postoId, DRAFT_KIND, draft)
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [draftHydrated, postoId, isReadOnly, composerOpen, employeeName, quantityInput, sheetReady, nozzles])

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
          hoseOk: nozzle.hoseOk,
          displayBurned: nozzle.displayBurned,
          nozzleOk: nozzle.nozzleOk,
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

  const hasDraft = isMeaningfulDraft({ employeeName, sheetReady, nozzles })

  const handleVerificationPdf = useCallback(
    async (verification: NozzleMetrologyVerification, mode: 'print' | 'download') => {
      if (!postoInfo) return
      setExportingId(verification.id)
      setExportingMode(mode)
      setPageError(null)
      try {
        const bytes = await generateMetrologyPrintPdf(postoInfo, verification)
        const fileName = buildMetrologyPdfFileName(postoInfo, verification)
        if (mode === 'print') {
          await openRaqPdfForPrint(bytes, fileName)
        } else {
          downloadRaqPdf(bytes, fileName)
        }
      } catch {
        setPageError(
          mode === 'print'
            ? 'Não foi possível abrir a impressão desta verificação. Tente novamente.'
            : 'Não foi possível gerar o PDF desta verificação. Tente novamente.',
        )
      } finally {
        setExportingId(null)
        setExportingMode(null)
      }
    },
    [postoInfo],
  )

  function persistDraftNow() {
    if (!postoId || isReadOnly) return
    const payload = { employeeName, sheetReady, nozzles }
    if (!isMeaningfulDraft(payload)) {
      if (!composerOpen) return
      clearLocalFormDraft(draftStorageKey(postoId))
      setDraftSavedAt(null)
      void deletePostoFormDraft(postoId, DRAFT_KIND)
      return
    }
    const draft: MetrologyComposerDraft = {
      v: 1,
      savedAt: new Date().toISOString(),
      employeeName,
      quantityInput,
      sheetReady,
      nozzles,
    }
    writeLocalFormDraft(draftStorageKey(postoId), draft)
    setDraftSavedAt(draft.savedAt)
    void savePostoFormDraft(postoId, DRAFT_KIND, draft)
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
    setComposerOpen(true)
  }

  function closeComposer() {
    persistDraftNow()
    setComposerOpen(false)
  }

  function discardDraft() {
    if (postoId) {
      clearLocalFormDraft(draftStorageKey(postoId))
      void deletePostoFormDraft(postoId, DRAFT_KIND)
    }
    setDraftSavedAt(null)
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
      setFormError('Preencha todos os campos dos bicos com combustível antes de salvar.')
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
            volumetryMin: nozzle.volumetryMin,
            volumetryMax: nozzle.volumetryMax,
            flowMinLiters: parseLiters(nozzle.flowMinLiters),
            flowMaxLiters: parseLiters(nozzle.flowMaxLiters),
            sealsOk: nozzle.sealsOk,
            leakage: nozzle.leakage,
            hoseOk: nozzle.hoseOk,
            displayBurned: nozzle.displayBurned,
            nozzleOk: nozzle.nozzleOk,
            itemStatus: evaluation.status as MetrologyItemStatus,
          }
        }),
      })
      setHistory((current) => [saved, ...current.filter((row) => row.id !== saved.id)])
      if (postoId) {
        clearLocalFormDraft(draftStorageKey(postoId))
        void deletePostoFormDraft(postoId, DRAFT_KIND)
      }
      setDraftSavedAt(null)
      resetComposer()
      setComposerOpen(false)
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
            {hasDraft ? 'Continuar rascunho' : 'Lançar verificação'}
          </button>
        )}
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      {!composerOpen && !isReadOnly && hasDraft && (
        <p className="nozzle-draft-banner" role="status">
          Há um rascunho salvo neste posto
          {draftSavedAt ? ` (${formatDateTimePtBr(draftSavedAt)})` : ''}. Você pode continuar no
          computador ou no celular — foto e assinatura precisam ser feitas de novo na hora de salvar.
        </p>
      )}

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
                mínima: pelo menos {FLOW_MIN_LITERS_LIMIT} L em {FLOW_MIN_TIME_LABEL}; máxima: pelo menos{' '}
                {FLOW_MAX_LITERS_REQUIRED} L em {FLOW_MAX_TIME_LABEL}.
              </p>
              {hasDraft && (
                <p className="nozzle-draft-hint" role="status">
                  Rascunho salvo neste posto
                  {draftSavedAt ? ` às ${formatDateTimePtBr(draftSavedAt)}` : ''}. Foto e assinatura
                  não entram no rascunho.
                </p>
              )}
            </div>
            <div className="nozzle-composer__actions">
              {hasDraft && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={discardDraft}
                  disabled={busy}
                >
                  Descartar rascunho
                </button>
              )}
              <button type="button" className="btn btn--secondary" onClick={closeComposer} disabled={busy}>
                Fechar
              </button>
            </div>
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
                  const maintenance = isMaintenanceFuel(nozzle.fuelProductKey)
                  return (
                    <article
                      key={nozzle.id}
                      className={`nozzle-card${maintenance ? ' nozzle-card--maintenance' : ''}`}
                    >
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
                      {maintenance && (
                        <p className="nozzle-maintenance-hint">
                          Bico em manutenção: o restante dos dados é opcional.
                        </p>
                      )}

                      <div className="nozzle-vol-grid">
                        <VolumetrySuggestField
                          label="Vol. mínima"
                          value={nozzle.volumetryMin}
                          disabled={isReadOnly || busy}
                          onChange={(value) => updateNozzle(nozzle.id, { volumetryMin: value })}
                        />
                        <label className="reg-doc-form__field">
                          <span>Vazão (1 min) mínimo 5 litros</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={nozzle.flowMinLiters}
                            disabled={isReadOnly || busy}
                            onChange={(event) =>
                              updateNozzle(nozzle.id, { flowMinLiters: event.target.value })
                            }
                            placeholder={`≥ ${FLOW_MIN_LITERS_LIMIT} L`}
                          />
                        </label>
                        <VolumetrySuggestField
                          label="Vol. máxima"
                          value={nozzle.volumetryMax}
                          disabled={isReadOnly || busy}
                          onChange={(value) => updateNozzle(nozzle.id, { volumetryMax: value })}
                        />
                        <label className="reg-doc-form__field">
                          <span>Vazão mínimo 5 litros (12 s)</span>
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

                        <div className="reg-doc-form__field">
                          <span>Mangueira OK?</span>
                          <div className="nozzle-choice-row">
                            <label>
                              <input
                                type="radio"
                                name={`hose-${nozzle.id}`}
                                checked={nozzle.hoseOk === true}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { hoseOk: true })}
                              />
                              Sim
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`hose-${nozzle.id}`}
                                checked={nozzle.hoseOk === false}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { hoseOk: false })}
                              />
                              Não
                            </label>
                          </div>
                        </div>

                        <div className="reg-doc-form__field">
                          <span>Display queimado?</span>
                          <div className="nozzle-choice-row">
                            <label>
                              <input
                                type="radio"
                                name={`display-${nozzle.id}`}
                                checked={nozzle.displayBurned === false}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { displayBurned: false })}
                              />
                              Não
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`display-${nozzle.id}`}
                                checked={nozzle.displayBurned === true}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { displayBurned: true })}
                              />
                              Sim
                            </label>
                          </div>
                        </div>

                        <div className="reg-doc-form__field">
                          <span>Bico de acordo?</span>
                          <div className="nozzle-choice-row">
                            <label>
                              <input
                                type="radio"
                                name={`nozzle-ok-${nozzle.id}`}
                                checked={nozzle.nozzleOk === true}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { nozzleOk: true })}
                              />
                              Sim
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`nozzle-ok-${nozzle.id}`}
                                checked={nozzle.nozzleOk === false}
                                disabled={isReadOnly || busy}
                                onChange={() => updateNozzle(nozzle.id, { nozzleOk: false })}
                              />
                              Não
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
          <div className="fuel-history">
            {history.map((row) => (
              <article key={row.id} className="fuel-history__card">
                <div>
                  <h3>{formatDateTimePtBr(row.verified_at)}</h3>
                  <p>{row.employee_full_name}</p>
                  <p>
                    {row.nozzle_count} bico{row.nozzle_count === 1 ? '' : 's'}
                  </p>
                  <p>
                    <span className={`nozzle-badge nozzle-badge--${row.overall_status}`}>
                      {statusLabel(row.overall_status)}
                    </span>
                  </p>
                </div>
                <VerificationCardActions
                  verification={row}
                  exportingId={exportingId}
                  exportingMode={exportingMode}
                  onView={() => setViewRow(row)}
                  onPrint={() => void handleVerificationPdf(row, 'print')}
                  onExport={() => void handleVerificationPdf(row, 'download')}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {viewRow && (
        <VerificationDetailModal
          verification={viewRow}
          exportingId={exportingId}
          exportingMode={exportingMode}
          onClose={() => setViewRow(null)}
          onPrint={() => void handleVerificationPdf(viewRow, 'print')}
          onExport={() => void handleVerificationPdf(viewRow, 'download')}
        />
      )}
    </div>
  )
}

function VerificationCardActions({
  verification,
  exportingId,
  exportingMode,
  onView,
  onPrint,
  onExport,
}: {
  verification: NozzleMetrologyVerification
  exportingId: string | null
  exportingMode: 'print' | 'download' | null
  onView: () => void
  onPrint: () => void
  onExport: () => void
}) {
  const busy = exportingId === verification.id
  const printing = busy && exportingMode === 'print'
  const downloading = busy && exportingMode === 'download'
  return (
    <div className="reg-doc-card__actions fuel-history__actions">
      <button type="button" className="btn btn--secondary" onClick={onView} disabled={busy}>
        Ver detalhes
      </button>
      <button type="button" className="btn btn--secondary" onClick={onPrint} disabled={busy}>
        {printing ? 'Abrindo...' : 'Imprimir'}
      </button>
      <button type="button" className="btn btn--secondary" onClick={onExport} disabled={busy}>
        {downloading ? 'Gerando...' : 'Exportar PDF'}
      </button>
    </div>
  )
}

function VerificationDetailModal({
  verification,
  exportingId,
  exportingMode,
  onClose,
  onPrint,
  onExport,
}: {
  verification: NozzleMetrologyVerification
  exportingId: string | null
  exportingMode: 'print' | 'download' | null
  onClose: () => void
  onPrint: () => void
  onExport: () => void
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const busy = exportingId === verification.id
  const printing = busy && exportingMode === 'print'
  const downloading = busy && exportingMode === 'download'

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
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
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
                    {item.volumetry_min == null && item.volumetry_max == null
                      ? '—'
                      : `${item.volumetry_min == null ? '—' : formatVolumetryLabel(item.volumetry_min)} / ${
                          item.volumetry_max == null ? '—' : formatVolumetryLabel(item.volumetry_max)
                        }`}
                  </dd>
                </div>
                <div>
                  <dt>Vazão mín / máx (L)</dt>
                  <dd>
                    {item.flow_min_liters == null && item.flow_max_liters == null
                      ? '—'
                      : `${dashText(item.flow_min_liters)} / ${dashText(item.flow_max_liters)}`}
                  </dd>
                </div>
                <div>
                  <dt>Lacres</dt>
                  <dd>{boolLabel(item.seals_ok, 'OK', 'Não OK')}</dd>
                </div>
                <div>
                  <dt>Vazamento</dt>
                  <dd>{boolLabel(item.leakage, 'Sim', 'Não')}</dd>
                </div>
                <div>
                  <dt>Mangueira OK?</dt>
                  <dd>{boolLabel(item.hose_ok, 'Sim', 'Não')}</dd>
                </div>
                <div>
                  <dt>Display queimado?</dt>
                  <dd>{boolLabel(item.display_burned, 'Sim', 'Não')}</dd>
                </div>
                <div>
                  <dt>Bico de acordo?</dt>
                  <dd>{boolLabel(item.nozzle_ok, 'Sim', 'Não')}</dd>
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
