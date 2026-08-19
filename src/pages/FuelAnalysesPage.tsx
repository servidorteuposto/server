import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  FUEL_ASPECTO_OPTIONS,
  FUEL_COR_OPTIONS,
  FUEL_PRODUCTS,
  formatCnpj,
  formatCoords,
  formatDateTimePtBr,
  formatRaqVolumeLabel,
  FUEL_PRODUCT_LABELS,
  isFuelProductKey,
  isRaqVolumePreset,
  productAlcoholKind,
  productHasAlcoholContent,
  RAQ_VOLUME_CUSTOM_OPTION,
  RAQ_VOLUME_PRESETS,
  validateDistributorCnpj,
  validateTransporterCnpj,
  type FuelProductKey,
} from '../config/fuel-analyses'
import {
  correctDensityTo20C,
  DENSITY_CONFORMITY_LABELS,
  ethanolAlcoholLimitLabel,
  FUEL_DENSITY_LIMITS_KG_M3,
  gasolineAlcoholLimitLabel,
  supportsDensityCorrection,
  type DensityConformity,
  type DensityCorrectionResult,
} from '../config/fuel-density'
import SignaturePad from '../components/fuel-analyses/SignaturePad'
import LiveCameraCapture from '../components/fuel-analyses/LiveCameraCapture'
import PartnerSuggestField from '../components/fuel-analyses/PartnerSuggestField'
import {
  getFuelFileUrl,
  getMyPostoProfile,
  listFuelAnalysisReports,
  partitionFuelReportsByVigencia,
  currentProductKeysForReport,
  productKeysFromReport,
  saveFuelAnalysisReport,
  type AnalysisItemInput,
  type FuelAnalysisReport,
  type PostoProfile,
  type RaqItemInput,
} from '../lib/fuel-analyses'
import { listPartners, type PostoPartner } from '../lib/partners'
import {
  clearLocalFormDraft,
  deletePostoFormDraft,
  POSTO_FORM_DRAFT_KINDS,
  resolvePostoFormDraft,
  savePostoFormDraft,
  writeLocalFormDraft,
} from '../lib/posto-form-drafts'
import {
  buildRaqPdfFileName,
  downloadRaqPdf,
  fuelReportToPrintBoard,
  generateRaqPrintPdf,
  generateRaqPrintPdfFromPages,
  openRaqPdfForPrint,
  type RaqPdfPageSpec,
} from '../lib/raq-print-report'
import { buildPublicPostoUrl } from '../config/public-posto'
import { formatDatePtBr } from '../config/regulatory-documents'
import QRCode from 'qrcode'
import '../pages/RegulatoryDocumentsPage.css'
import './FuelAnalysesPage.css'

type FuelAnalysesPageProps = {
  isReadOnly: boolean
}

type RaqDraft = {
  volumeReceivedLiters: string
  volumeIsCustom: boolean
  collectionDate: string
  transporterName: string
  transporterCnpj: string
  invoiceNumber: string
  truckPlate: string
  driverName: string
  distributorName: string
  distributorCnpj: string
}

type AnalysisDraft = {
  aspecto: string
  cor: string
  temperaturaObservada: string
  massaEspecificaObservada: string
  massaEspecificaConvertida: string
  teorAlcoolGasolina: string
  densidadeStatus: DensityConformity | null
  coeficienteGamma: number | null
  densidadeFormula: string | null
  densidadeLimitLabel: string | null
  densidadeStatusReason: string | null
  densidadeStatusLabel: string | null
  photoFile: File | null
  photoPreviewUrl: string | null
  photoLatitude: number | null
  photoLongitude: number | null
  photoCapturedAt: string | null
  photoError: string | null
}

function emptyRaq(): RaqDraft {
  return {
    volumeReceivedLiters: '',
    volumeIsCustom: false,
    collectionDate: '',
    transporterName: '',
    transporterCnpj: '',
    invoiceNumber: '',
    truckPlate: '',
    driverName: '',
    distributorName: '',
    distributorCnpj: '',
  }
}

function emptyAnalysis(): AnalysisDraft {
  return {
    aspecto: '',
    cor: '',
    temperaturaObservada: '',
    massaEspecificaObservada: '',
    massaEspecificaConvertida: '',
    teorAlcoolGasolina: '',
    densidadeStatus: null,
    coeficienteGamma: null,
    densidadeFormula: null,
    densidadeLimitLabel: null,
    densidadeStatusReason: null,
    densidadeStatusLabel: null,
    photoFile: null,
    photoPreviewUrl: null,
    photoLatitude: null,
    photoLongitude: null,
    photoCapturedAt: null,
    photoError: null,
  }
}

type AnalysisDraftStored = Omit<
  AnalysisDraft,
  'photoFile' | 'photoPreviewUrl' | 'photoLatitude' | 'photoLongitude' | 'photoCapturedAt' | 'photoError'
>

type FuelRaqComposerDraft = {
  v: 1
  savedAt: string
  authorName: string
  launchProductKeys: FuelProductKey[]
  raqDrafts: Partial<Record<FuelProductKey, RaqDraft>>
  analysisDrafts: Partial<Record<FuelProductKey, AnalysisDraftStored>>
  openRaq: FuelProductKey | null
  openAnalysis: FuelProductKey | null
}

const DRAFT_KIND = POSTO_FORM_DRAFT_KINDS.fuelRaq
const DRAFT_KEY_PREFIX = 'teuposto_fuel_raq_draft:'
const DRAFT_SAVE_DEBOUNCE_MS = 800

function draftStorageKey(postoId: string) {
  return `${DRAFT_KEY_PREFIX}${postoId}`
}

function isFuelRaqComposerDraft(value: unknown): value is FuelRaqComposerDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as FuelRaqComposerDraft
  return draft.v === 1 && Array.isArray(draft.launchProductKeys)
}

function isMeaningfulDraft(input: {
  authorName: string
  launchProductKeys: FuelProductKey[]
}) {
  if (input.authorName.trim()) return true
  if (input.launchProductKeys.length > 0) return true
  return false
}

function serializableAnalysis(draft: AnalysisDraft): AnalysisDraftStored {
  return {
    aspecto: draft.aspecto,
    cor: draft.cor,
    temperaturaObservada: draft.temperaturaObservada,
    massaEspecificaObservada: draft.massaEspecificaObservada,
    massaEspecificaConvertida: draft.massaEspecificaConvertida,
    teorAlcoolGasolina: draft.teorAlcoolGasolina,
    densidadeStatus: draft.densidadeStatus,
    coeficienteGamma: draft.coeficienteGamma,
    densidadeFormula: draft.densidadeFormula,
    densidadeLimitLabel: draft.densidadeLimitLabel,
    densidadeStatusReason: draft.densidadeStatusReason,
    densidadeStatusLabel: draft.densidadeStatusLabel,
  }
}

function restoreAnalysis(productKey: FuelProductKey, stored: AnalysisDraftStored): AnalysisDraft {
  const merged: AnalysisDraft = {
    ...emptyAnalysis(),
    ...stored,
    photoFile: null,
    photoPreviewUrl: null,
    photoLatitude: null,
    photoLongitude: null,
    photoCapturedAt: null,
    photoError: null,
  }
  return { ...merged, ...applyDensityCorrection(productKey, merged) }
}

function buildFuelRaqComposerDraft(input: {
  authorName: string
  launchProductKeys: FuelProductKey[]
  raqDrafts: Partial<Record<FuelProductKey, RaqDraft>>
  analysisDrafts: Partial<Record<FuelProductKey, AnalysisDraft>>
  openRaq: FuelProductKey | null
  openAnalysis: FuelProductKey | null
}): FuelRaqComposerDraft {
  const storedAnalysis: Partial<Record<FuelProductKey, AnalysisDraftStored>> = {}
  for (const key of input.launchProductKeys) {
    const draft = input.analysisDrafts[key]
    if (draft) storedAnalysis[key] = serializableAnalysis(draft)
  }
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    authorName: input.authorName,
    launchProductKeys: input.launchProductKeys,
    raqDrafts: input.raqDrafts,
    analysisDrafts: storedAnalysis,
    openRaq: input.openRaq,
    openAnalysis: input.openAnalysis,
  }
}

function applyDensityCorrection(
  productKey: FuelProductKey,
  draft: AnalysisDraft,
): Pick<
  AnalysisDraft,
  | 'massaEspecificaConvertida'
  | 'teorAlcoolGasolina'
  | 'densidadeStatus'
  | 'coeficienteGamma'
  | 'densidadeFormula'
  | 'densidadeLimitLabel'
  | 'densidadeStatusReason'
  | 'densidadeStatusLabel'
> {
  if (!supportsDensityCorrection(productKey)) {
    return {
      massaEspecificaConvertida: draft.massaEspecificaConvertida,
      teorAlcoolGasolina: draft.teorAlcoolGasolina,
      densidadeStatus: null,
      coeficienteGamma: null,
      densidadeFormula: null,
      densidadeLimitLabel: null,
      densidadeStatusReason: null,
      densidadeStatusLabel: null,
    }
  }

  const result: DensityCorrectionResult | null = correctDensityTo20C(
    productKey,
    draft.massaEspecificaObservada,
    draft.temperaturaObservada,
    draft.teorAlcoolGasolina,
  )

  if (!result) {
    return {
      massaEspecificaConvertida: '',
      teorAlcoolGasolina:
        productAlcoholKind(productKey) === 'ethanol' ? '' : draft.teorAlcoolGasolina,
      densidadeStatus: null,
      coeficienteGamma: null,
      densidadeFormula: null,
      densidadeLimitLabel: FUEL_DENSITY_LIMITS_KG_M3[productKey]
        ? draft.densidadeLimitLabel
        : null,
      densidadeStatusReason: null,
      densidadeStatusLabel: null,
    }
  }

  return {
    massaEspecificaConvertida: result.d20Formatted,
    teorAlcoolGasolina:
      result.alcoholFormatted != null ? result.alcoholFormatted : draft.teorAlcoolGasolina,
    densidadeStatus: result.status,
    coeficienteGamma: result.gammaKgM3,
    densidadeFormula: result.formulaLabel,
    densidadeLimitLabel: result.limitLabel,
    densidadeStatusReason: result.statusReason,
    densidadeStatusLabel: result.statusLabel,
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

export default function FuelAnalysesPage({ isReadOnly }: FuelAnalysesPageProps) {
  const [posto, setPosto] = useState<PostoProfile | null>(null)
  const [reports, setReports] = useState<FuelAnalysisReport[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [raqDrafts, setRaqDrafts] = useState<Partial<Record<FuelProductKey, RaqDraft>>>({})
  const [analysisDrafts, setAnalysisDrafts] = useState<Partial<Record<FuelProductKey, AnalysisDraft>>>({})
  const [openRaq, setOpenRaq] = useState<FuelProductKey | null>(null)
  const [openAnalysis, setOpenAnalysis] = useState<FuelProductKey | null>(null)
  const [authorName, setAuthorName] = useState('')
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [submittedAtPreview, setSubmittedAtPreview] = useState(() => new Date().toISOString())
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [viewReport, setViewReport] = useState<FuelAnalysisReport | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [showQrPanel, setShowQrPanel] = useState(false)
  /** Combustíveis que chegaram neste recebimento (um, vários ou todos). */
  const [launchProductKeys, setLaunchProductKeys] = useState<FuelProductKey[]>([])
  const [transporters, setTransporters] = useState<PostoPartner[]>([])
  const [distributors, setDistributors] = useState<PostoPartner[]>([])
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportingMode, setExportingMode] = useState<'print' | 'download' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [bulkExporting, setBulkExporting] = useState(false)
  const [periodModalOpen, setPeriodModalOpen] = useState(false)
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [periodError, setPeriodError] = useState<string | null>(null)

  const handleReportPdf = useCallback(
    async (report: FuelAnalysisReport, mode: 'print' | 'download') => {
      setExportingId(report.id)
      setExportingMode(mode)
      setExportError(null)
      try {
        const board = fuelReportToPrintBoard(report)
        const bytes = await generateRaqPrintPdf(board)
        const fileName = buildRaqPdfFileName(board)
        if (mode === 'print') {
          await openRaqPdfForPrint(bytes, fileName)
        } else {
          downloadRaqPdf(bytes, fileName)
        }
      } catch {
        setExportError(
          mode === 'print'
            ? 'Não foi possível abrir a impressão deste RAQ. Tente novamente.'
            : 'Não foi possível gerar o PDF deste RAQ. Tente novamente.',
        )
      } finally {
        setExportingId(null)
        setExportingMode(null)
      }
    },
    [],
  )

  const launchProducts = useMemo(
    () => FUEL_PRODUCTS.filter((product) => launchProductKeys.includes(product.key)),
    [launchProductKeys],
  )

  const { currentReports, archivedReports, latestReportIdByProduct } = useMemo(
    () => partitionFuelReportsByVigencia(reports),
    [reports],
  )

  const buildPagesFromReports = useCallback(
    (
      source: FuelAnalysisReport[],
      productFilter?: (report: FuelAnalysisReport) => FuelProductKey[],
    ): RaqPdfPageSpec[] => {
      const pages: RaqPdfPageSpec[] = []
      for (const report of source) {
        const board = fuelReportToPrintBoard(report)
        const keys = productFilter
          ? productFilter(report)
          : productKeysFromReport(report)
        for (const productKey of keys) {
          pages.push({ board, productKey })
        }
      }
      return pages
    },
    [],
  )

  const runBulkExport = useCallback(
    async (pages: RaqPdfPageSpec[], fileSuffix: string) => {
      if (!pages.length) {
        setExportError('Nenhum RAQ encontrado para exportar com esse filtro.')
        return
      }
      setBulkExporting(true)
      setExportError(null)
      setExportMenuOpen(false)
      try {
        const bytes = await generateRaqPrintPdfFromPages(pages)
        const slug = (posto?.nome || 'posto')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()
          .slice(0, 40)
        downloadRaqPdf(bytes, `RAQ-${slug || 'posto'}-${fileSuffix}.pdf`)
      } catch {
        setExportError('Não foi possível gerar o PDF. Tente novamente.')
      } finally {
        setBulkExporting(false)
      }
    },
    [posto?.nome],
  )

  const handleBulkExport = useCallback(
    async (mode: 'all' | 'current' | 'archived') => {
      if (mode === 'all') {
        await runBulkExport(buildPagesFromReports(reports), `todas-${new Date().toISOString().slice(0, 10)}`)
        return
      }
      if (mode === 'current') {
        await runBulkExport(
          buildPagesFromReports(currentReports, (report) =>
            currentProductKeysForReport(report, latestReportIdByProduct),
          ),
          `vigentes-${new Date().toISOString().slice(0, 10)}`,
        )
        return
      }

      const archivedPages = buildPagesFromReports(archivedReports)
      const supersededFromCurrent = buildPagesFromReports(currentReports, (report) => {
        const current = new Set(currentProductKeysForReport(report, latestReportIdByProduct))
        return productKeysFromReport(report).filter((key) => !current.has(key))
      })
      await runBulkExport(
        [...archivedPages, ...supersededFromCurrent],
        `arquivo-${new Date().toISOString().slice(0, 10)}`,
      )
    },
    [
      archivedReports,
      buildPagesFromReports,
      currentReports,
      latestReportIdByProduct,
      reports,
      runBulkExport,
    ],
  )

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
      const submitted = new Date(report.submitted_at).getTime()
      return submitted >= fromMs && submitted <= toMs
    })
    await runBulkExport(
      buildPagesFromReports(filtered),
      `periodo-${periodFrom}_a_${periodTo}`,
    )
    setPeriodModalOpen(false)
  }, [buildPagesFromReports, periodFrom, periodTo, reports, runBulkExport])

  useEffect(() => {
    if (!exportMenuOpen) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.fuel-export')) return
      setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [exportMenuOpen])

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const profile = await getMyPostoProfile()
      setPosto(profile)
      const [rows, partners] = await Promise.all([
        listFuelAnalysisReports(profile.id),
        listPartners(profile.id),
      ])
      setReports(rows)
      setTransporters(partners.filter((partner) => partner.partner_type === 'transporter'))
      setDistributors(partners.filter((partner) => partner.partner_type === 'distributor'))
    } catch {
      setPageError('Não foi possível carregar Análises de Combustíveis.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  const applyFuelRaqDraft = useCallback((stored: FuelRaqComposerDraft) => {
    const keys = stored.launchProductKeys.filter(isFuelProductKey)
    const nextRaq: Partial<Record<FuelProductKey, RaqDraft>> = {}
    const nextAnalysis: Partial<Record<FuelProductKey, AnalysisDraft>> = {}
    for (const key of keys) {
      nextRaq[key] = stored.raqDrafts[key] ?? emptyRaq()
      nextAnalysis[key] = stored.analysisDrafts[key]
        ? restoreAnalysis(key, stored.analysisDrafts[key]!)
        : emptyAnalysis()
    }
    setAuthorName(stored.authorName)
    setLaunchProductKeys(keys)
    setRaqDrafts(nextRaq)
    setAnalysisDrafts(nextAnalysis)
    setOpenRaq(stored.openRaq && keys.includes(stored.openRaq) ? stored.openRaq : keys[0] ?? null)
    setOpenAnalysis(
      stored.openAnalysis && keys.includes(stored.openAnalysis)
        ? stored.openAnalysis
        : keys[0] ?? null,
    )
    setDraftSavedAt(stored.savedAt)
  }, [])

  useEffect(() => {
    if (isReadOnly) {
      setDraftHydrated(true)
      return
    }
    if (!posto?.id) return

    let cancelled = false
    void (async () => {
      const stored = await resolvePostoFormDraft(
        posto.id,
        DRAFT_KIND,
        draftStorageKey(posto.id),
        isFuelRaqComposerDraft,
      )
      if (cancelled) return
      if (stored && isMeaningfulDraft(stored)) {
        applyFuelRaqDraft(stored)
      }
      setDraftHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [posto?.id, isReadOnly, applyFuelRaqDraft])

  useEffect(() => {
    if (isReadOnly || !posto?.id || !draftHydrated || formOpen) return

    const refresh = () => {
      void (async () => {
        const stored = await resolvePostoFormDraft(
          posto.id,
          DRAFT_KIND,
          draftStorageKey(posto.id),
          isFuelRaqComposerDraft,
        )
        if (stored && isMeaningfulDraft(stored)) {
          applyFuelRaqDraft(stored)
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
  }, [isReadOnly, posto?.id, draftHydrated, formOpen, applyFuelRaqDraft])

  useEffect(() => {
    if (!draftHydrated || !posto?.id || isReadOnly || !formOpen) return

    const payload = { authorName, launchProductKeys }
    const timer = window.setTimeout(() => {
      if (!isMeaningfulDraft(payload)) {
        clearLocalFormDraft(draftStorageKey(posto.id))
        setDraftSavedAt(null)
        void deletePostoFormDraft(posto.id, DRAFT_KIND)
        return
      }
      const draft = buildFuelRaqComposerDraft({
        authorName,
        launchProductKeys,
        raqDrafts,
        analysisDrafts,
        openRaq,
        openAnalysis,
      })
      writeLocalFormDraft(draftStorageKey(posto.id), draft)
      setDraftSavedAt(draft.savedAt)
      void savePostoFormDraft(posto.id, DRAFT_KIND, draft)
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [
    draftHydrated,
    posto?.id,
    isReadOnly,
    formOpen,
    authorName,
    launchProductKeys,
    raqDrafts,
    analysisDrafts,
    openRaq,
    openAnalysis,
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
    if (!posto?.public_slug) {
      setQrDataUrl(null)
      setPublicUrl(null)
      return
    }

    const url = buildPublicPostoUrl(posto.public_slug)
    setPublicUrl(url)
    let cancelled = false

    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [posto?.public_slug])

  useEffect(() => {
    if (!formOpen) return
    const timer = window.setInterval(() => {
      setSubmittedAtPreview(new Date().toISOString())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [formOpen])

  const hasDraft = isMeaningfulDraft({ authorName, launchProductKeys })

  function persistDraftNow() {
    if (!posto?.id || isReadOnly) return
    const payload = { authorName, launchProductKeys }
    if (!isMeaningfulDraft(payload)) {
      if (!formOpen) return
      clearLocalFormDraft(draftStorageKey(posto.id))
      setDraftSavedAt(null)
      void deletePostoFormDraft(posto.id, DRAFT_KIND)
      return
    }
    const draft = buildFuelRaqComposerDraft({
      authorName,
      launchProductKeys,
      raqDrafts,
      analysisDrafts,
      openRaq,
      openAnalysis,
    })
    writeLocalFormDraft(draftStorageKey(posto.id), draft)
    setDraftSavedAt(draft.savedAt)
    void savePostoFormDraft(posto.id, DRAFT_KIND, draft)
  }

  function revokeAnalysisPreviews() {
    for (const draft of Object.values(analysisDrafts)) {
      if (draft?.photoPreviewUrl) URL.revokeObjectURL(draft.photoPreviewUrl)
    }
  }

  function resetComposer() {
    revokeAnalysisPreviews()
    setLaunchProductKeys([])
    setRaqDrafts({})
    setAnalysisDrafts({})
    setOpenRaq(null)
    setOpenAnalysis(null)
    setAuthorName('')
    setSignatureBlob(null)
    setFormError(null)
    setSubmittedAtPreview(new Date().toISOString())
  }

  function openForm() {
    if (!hasDraft) resetComposer()
    setFormError(null)
    setShowQrPanel(false)
    setFormOpen(true)

    if (posto?.id) {
      void listPartners(posto.id)
        .then((partners) => {
          setTransporters(partners.filter((partner) => partner.partner_type === 'transporter'))
          setDistributors(partners.filter((partner) => partner.partner_type === 'distributor'))
        })
        .catch(() => {
          /* mantém a lista já carregada */
        })
    }
  }

  function closeForm() {
    persistDraftNow()
    setFormOpen(false)
  }

  function discardDraft() {
    if (posto?.id) {
      clearLocalFormDraft(draftStorageKey(posto.id))
      void deletePostoFormDraft(posto.id, DRAFT_KIND)
    }
    setDraftSavedAt(null)
    resetComposer()
    setFormOpen(false)
  }

  function toggleLaunchProduct(key: FuelProductKey) {
    const removing = launchProductKeys.includes(key)
    const nextKeys = removing
      ? launchProductKeys.filter((item) => item !== key)
      : [...launchProductKeys, key]

    setLaunchProductKeys(nextKeys)

    if (removing) {
      setRaqDrafts((drafts) => {
        const copy = { ...drafts }
        delete copy[key]
        return copy
      })
      setAnalysisDrafts((drafts) => {
        const previous = drafts[key]
        if (previous?.photoPreviewUrl) URL.revokeObjectURL(previous.photoPreviewUrl)
        const copy = { ...drafts }
        delete copy[key]
        return copy
      })
      setOpenRaq((open) => (open === key ? nextKeys[0] ?? null : open))
      setOpenAnalysis((open) => (open === key ? nextKeys[0] ?? null : open))
    } else {
      setRaqDrafts((drafts) => ({ ...drafts, [key]: emptyRaq() }))
      setAnalysisDrafts((drafts) => ({ ...drafts, [key]: emptyAnalysis() }))
      setOpenRaq(key)
      setOpenAnalysis(key)
    }

    setFormError(null)
  }

  function updateRaq(key: FuelProductKey, patch: Partial<RaqDraft>) {
    setRaqDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? emptyRaq()), ...patch },
    }))
  }

  function updateAnalysis(key: FuelProductKey, patch: Partial<AnalysisDraft>) {
    setAnalysisDrafts((current) => {
      const previous = current[key] ?? emptyAnalysis()
      if (patch.photoPreviewUrl === undefined && previous.photoPreviewUrl && 'photoFile' in patch) {
        URL.revokeObjectURL(previous.photoPreviewUrl)
      }

      const merged = { ...previous, ...patch }
      const densityTouched =
        'temperaturaObservada' in patch ||
        'massaEspecificaObservada' in patch ||
        'teorAlcoolGasolina' in patch

      return {
        ...current,
        [key]: densityTouched ? { ...merged, ...applyDensityCorrection(key, merged) } : merged,
      }
    })
  }

  async function handleLivePhotoCapture(key: FuelProductKey, file: File) {
    if (file.size > FUEL_ANALYSES_MAX_FILE_BYTES) {
      updateAnalysis(key, { photoError: 'A foto deve ter no máximo 10 MB.' })
      return
    }

    const previewUrl = URL.createObjectURL(file)
    updateAnalysis(key, {
      photoFile: file,
      photoPreviewUrl: previewUrl,
      photoCapturedAt: new Date().toISOString(),
      photoError: 'Obtendo coordenadas GPS...',
    })

    try {
      const position = await readGeolocation()
      updateAnalysis(key, {
        photoLatitude: position.coords.latitude,
        photoLongitude: position.coords.longitude,
        photoCapturedAt: new Date().toISOString(),
        photoError: null,
      })
    } catch {
      updateAnalysis(key, {
        photoLatitude: null,
        photoLongitude: null,
        photoError: 'Não foi possível obter a localização. Permita o GPS e tire a foto novamente.',
      })
    }
  }

  function clearLivePhoto(key: FuelProductKey) {
    updateAnalysis(key, {
      photoFile: null,
      photoPreviewUrl: null,
      photoLatitude: null,
      photoLongitude: null,
      photoCapturedAt: null,
      photoError: null,
    })
  }

  function validateForm(): string | null {
    if (!posto?.endereco?.trim()) {
      return 'Cadastre o endereço do posto em Configurações do Sistema antes de lançar o RAQ.'
    }
    if (!launchProductKeys.length) {
      return 'Selecione pelo menos um combustível que chegou neste recebimento.'
    }

    for (const product of launchProducts) {
      const raq = raqDrafts[product.key] ?? emptyRaq()
      if (!raq.volumeReceivedLiters.trim()) {
        return `${product.label}: informe o volume recebido.`
      }
      const volumeNumber = Number(raq.volumeReceivedLiters.replace(/\./g, '').replace(',', '.'))
      if (Number.isNaN(volumeNumber) || volumeNumber <= 0) {
        return `${product.label}: informe um volume válido em litros.`
      }
      if (!raq.collectionDate) return `${product.label}: informe a data da coleta.`
      if (!raq.transporterName.trim()) return `${product.label}: informe o transportador.`
      const transporterError = validateTransporterCnpj(raq.transporterCnpj)
      if (transporterError) return `${product.label}: ${transporterError}`
      if (!raq.invoiceNumber.trim()) return `${product.label}: informe o número da nota fiscal.`
      if (!raq.truckPlate.trim()) return `${product.label}: informe a placa do caminhão/reboque.`
      if (!raq.driverName.trim()) return `${product.label}: informe o nome do motorista.`
      if (!raq.distributorName.trim()) return `${product.label}: informe o distribuidor.`
      const distributorError = validateDistributorCnpj(raq.distributorCnpj)
      if (distributorError) return `${product.label}: ${distributorError}`

      const analysis = analysisDrafts[product.key] ?? emptyAnalysis()
      if (!analysis.aspecto.trim()) return `${product.label}: informe o aspecto.`
      if (!analysis.cor.trim()) return `${product.label}: informe a cor.`
      if (!analysis.temperaturaObservada.trim()) {
        return `${product.label}: informe a temperatura observada.`
      }
      if (!analysis.massaEspecificaObservada.trim()) {
        return `${product.label}: informe a massa específica observada.`
      }
      if (supportsDensityCorrection(product.key)) {
        if (!analysis.massaEspecificaConvertida.trim()) {
          return `${product.label}: não foi possível calcular a massa específica a 20 °C. Verifique temperatura e densidade.`
        }
      } else if (!analysis.massaEspecificaConvertida.trim()) {
        return `${product.label}: informe a massa específica convertida.`
      }
      if (productHasAlcoholContent(product.key) && !analysis.teorAlcoolGasolina.trim()) {
        return productAlcoholKind(product.key) === 'ethanol'
          ? `${product.label}: não foi possível calcular o teor alcoólico (°INPM). Verifique a densidade.`
          : `${product.label}: informe o teor de álcool na gasolina.`
      }
      if (analysis.photoFile && (analysis.photoLatitude == null || analysis.photoLongitude == null)) {
        return `${product.label}: aguarde as coordenadas GPS da foto ou remova a foto para continuar sem ela.`
      }
    }

    if (!authorName.trim()) return 'Informe o nome completo de quem está lançando o relatório.'
    if (!signatureBlob) return 'Assine no campo em branco antes de lançar o relatório.'
    return null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!posto || isReadOnly) return

    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    window.alert(
      'Atenção: não esqueça de verificar o adesivo com a distribuidora correspondente.',
    )

    setBusy(true)
    setFormError(null)
    const submittedAt = new Date().toISOString()

    try {
      const reportEndereco = posto.endereco!.trim()

      const raqItems: RaqItemInput[] = launchProducts.map((product) => {
        const draft = raqDrafts[product.key] ?? emptyRaq()
        return {
          productKey: product.key,
          volumeReceivedLiters: draft.volumeReceivedLiters,
          collectionDate: draft.collectionDate,
          transporterName: draft.transporterName,
          transporterCnpj: draft.transporterCnpj,
          invoiceNumber: draft.invoiceNumber,
          invoiceFile: null,
          truckPlate: draft.truckPlate,
          driverName: draft.driverName,
          distributorName: draft.distributorName,
          distributorCnpj: draft.distributorCnpj,
        }
      })

      const analysisItems: AnalysisItemInput[] = launchProducts.map((product) => {
        const draft = analysisDrafts[product.key] ?? emptyAnalysis()
        return {
          productKey: product.key,
          aspecto: draft.aspecto,
          cor: draft.cor,
          temperaturaObservada: draft.temperaturaObservada,
          massaEspecificaObservada: draft.massaEspecificaObservada,
          massaEspecificaConvertida: draft.massaEspecificaConvertida,
          teorAlcoolGasolina: draft.teorAlcoolGasolina,
          densidadeStatus: draft.densidadeStatus,
          coeficienteGamma: draft.coeficienteGamma,
          densidadeFormula: draft.densidadeFormula,
          photoFile: draft.photoFile,
          photoLatitude: draft.photoLatitude,
          photoLongitude: draft.photoLongitude,
          photoCapturedAt: draft.photoCapturedAt,
        }
      })

      await saveFuelAnalysisReport({
        postoId: posto.id,
        razaoSocial: posto.nome,
        cnpj: posto.cnpj,
        endereco: reportEndereco,
        authorFullName: authorName,
        signatureBlob: signatureBlob!,
        submittedAt,
        raqItems,
        analysisItems,
      })

      clearLocalFormDraft(draftStorageKey(posto.id))
      void deletePostoFormDraft(posto.id, DRAFT_KIND)
      setDraftSavedAt(null)
      resetComposer()
      setFormOpen(false)
      await loadPage()
    } catch {
      setFormError('Não foi possível lançar o relatório. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando Análises de Combustíveis...</p>
  }

  if (!posto) {
    return <p className="reg-doc-form__error">{pageError ?? 'Posto não encontrado.'}</p>
  }

  return (
    <div className="fuel-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Análises de Combustíveis</h1>
          <p>
            Lançamentos são imutáveis. Em cada RAQ, marque só os combustíveis que chegaram. Na página
            pública, cada produto mostra sempre o RAQ mais recente.
          </p>
        </div>
        {!formOpen && (
          <div className="fuel-header-actions">
            <div className="fuel-export">
              <button
                type="button"
                className={`reg-docs-page__add-btn fuel-header-actions__btn fuel-header-actions__btn--ghost${exportMenuOpen ? ' is-active' : ''}`}
                onClick={() => setExportMenuOpen((open) => !open)}
                disabled={bulkExporting || reports.length === 0}
                title={reports.length === 0 ? 'Nenhum RAQ para exportar' : 'Exportar RAQs em PDF'}
              >
                {bulkExporting ? 'Exportando...' : 'Exportar'}
              </button>
              {exportMenuOpen && (
                <div className="fuel-export__menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleBulkExport('all')}
                    disabled={bulkExporting}
                  >
                    Exportar todas
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleBulkExport('current')}
                    disabled={bulkExporting}
                  >
                    Exportar somente as vigentes
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleBulkExport('archived')}
                    disabled={bulkExporting}
                  >
                    Exportar somente as não vigentes
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
                </div>
              )}
            </div>
            <button
              type="button"
              className={`reg-docs-page__add-btn fuel-header-actions__btn fuel-header-actions__btn--ghost${showQrPanel ? ' is-active' : ''}`}
              onClick={() => setShowQrPanel((open) => !open)}
            >
              QR Code
            </button>
            {!isReadOnly && (
              <button type="button" className="reg-docs-page__add-btn" onClick={openForm}>
                {hasDraft ? 'Continuar rascunho' : 'Incluir RAQ'}
              </button>
            )}
          </div>
        )}
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}
      {!formOpen && !isReadOnly && hasDraft && (
        <p className="fuel-draft-banner" role="status">
          Há um rascunho salvo neste posto
          {draftSavedAt ? ` (${formatDateTimePtBr(draftSavedAt)})` : ''}. Você pode continuar no
          computador ou no celular — foto e assinatura precisam ser feitas de novo na hora de lançar.
        </p>
      )}
      {exportError && !formOpen && (
        <p className="reg-doc-form__error reg-docs-page__banner">{exportError}</p>
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
            aria-labelledby="fuel-period-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="reg-doc-modal__header">
              <h2 id="fuel-period-title">Exportar por período</h2>
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
              Serão exportados todos os RAQs lançados entre as datas informadas (inclusive).
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

      {showQrPanel && (
        <div
          className="reg-doc-modal"
          role="presentation"
          onClick={() => setShowQrPanel(false)}
        >
          <div
            className="reg-doc-modal__dialog fuel-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fuel-qr-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="reg-doc-modal__header">
              <h2 id="fuel-qr-title">QR Code do posto</h2>
              <button
                type="button"
                className="reg-doc-modal__close"
                onClick={() => setShowQrPanel(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </header>
            <p className="fuel-qr-modal__hint">
              Imprima e deixe no posto. Clientes escaneiam e veem o último RAQ.
            </p>
            <div className="fuel-qr-modal__body">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code da página pública do posto"
                  className="fuel-qr-modal__image"
                />
              ) : (
                <p className="reg-doc-card__empty">Gerando QR Code...</p>
              )}
              <div className="fuel-qr-modal__actions">
                {publicUrl && (
                  <>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => navigator.clipboard.writeText(publicUrl)}
                    >
                      Copiar link
                    </button>
                    <a
                      className="btn btn--primary"
                      href={qrDataUrl ?? '#'}
                      download={`qrcode-${posto.nome.replace(/\s+/g, '-').toLowerCase()}.png`}
                      onClick={(event) => {
                        if (!qrDataUrl) event.preventDefault()
                      }}
                    >
                      Baixar QR
                    </a>
                    <a
                      className="btn btn--secondary"
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir página
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <form className="fuel-form" onSubmit={handleSubmit}>
          <section className="fuel-panel">
            <div className="fuel-panel__header">
              <div>
                <h2>Novo RAQ</h2>
                {hasDraft && (
                  <p className="fuel-draft-hint" role="status">
                    Rascunho salvo neste posto
                    {draftSavedAt ? ` às ${formatDateTimePtBr(draftSavedAt)}` : ''}. Foto e
                    assinatura não entram no rascunho.
                  </p>
                )}
              </div>
              <div className="fuel-panel__header-actions">
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
                <button type="button" className="btn btn--secondary" onClick={closeForm} disabled={busy}>
                  Fechar
                </button>
              </div>
            </div>
            <h2>Combustíveis deste recebimento</h2>
            <p className="fuel-panel__hint">
              Marque só o que chegou agora. Os produtos não marcados não entram neste lançamento e
              mantêm o RAQ anterior na página pública.
            </p>
            <div className="fuel-products">
              {FUEL_PRODUCTS.map((product) => {
                const checked = launchProductKeys.includes(product.key)
                return (
                  <label
                    key={product.key}
                    className={`fuel-products__item${checked ? ' is-active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLaunchProduct(product.key)}
                      disabled={busy}
                    />
                    <span>{product.label}</span>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="fuel-panel">
            <h2>1. Registro das Análises da Qualidade — RAQ</h2>
            <div className="fuel-accordion">
              {launchProducts.map((product) => {
                const draft = raqDrafts[product.key] ?? emptyRaq()
                const open = openRaq === product.key
                return (
                  <article key={product.key} className="fuel-accordion__item">
                    <button
                      type="button"
                      className="fuel-accordion__trigger"
                      onClick={() => setOpenRaq(open ? null : product.key)}
                    >
                      <span>{product.label}</span>
                      <span>{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <div className="fuel-accordion__body">
                        <div className="fuel-fields">
                          <label className="reg-doc-form__field">
                            <span>Volume recebido (litros) *</span>
                            <select
                              value={
                                draft.volumeIsCustom
                                  ? RAQ_VOLUME_CUSTOM_OPTION
                                  : draft.volumeReceivedLiters
                              }
                              onChange={(event) => {
                                const value = event.target.value
                                if (value === RAQ_VOLUME_CUSTOM_OPTION) {
                                  updateRaq(product.key, {
                                    volumeIsCustom: true,
                                    volumeReceivedLiters: isRaqVolumePreset(draft.volumeReceivedLiters)
                                      ? ''
                                      : draft.volumeReceivedLiters,
                                  })
                                  return
                                }
                                updateRaq(product.key, {
                                  volumeIsCustom: false,
                                  volumeReceivedLiters: value,
                                })
                              }}
                              disabled={busy}
                              required={!draft.volumeIsCustom}
                            >
                              <option value="">Selecione o volume</option>
                              {RAQ_VOLUME_PRESETS.map((liters) => (
                                <option key={liters} value={String(liters)}>
                                  {formatRaqVolumeLabel(liters)}
                                </option>
                              ))}
                              <option value={RAQ_VOLUME_CUSTOM_OPTION}>Outro (digitar)</option>
                            </select>
                          </label>
                          {draft.volumeIsCustom && (
                            <label className="reg-doc-form__field">
                              <span>Informe o volume (litros) *</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="1"
                                step="1"
                                value={draft.volumeReceivedLiters}
                                onChange={(event) =>
                                  updateRaq(product.key, {
                                    volumeIsCustom: true,
                                    volumeReceivedLiters: event.target.value,
                                  })
                                }
                                disabled={busy}
                                required
                                placeholder="Ex.: 3500"
                              />
                            </label>
                          )}
                          <label className="reg-doc-form__field">
                            <span>Data da coleta *</span>
                            <input
                              type="date"
                              value={draft.collectionDate}
                              onChange={(event) =>
                                updateRaq(product.key, { collectionDate: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <PartnerSuggestField
                            label="Transportador *"
                            mode="name"
                            value={draft.transporterName}
                            partners={transporters}
                            disabled={busy}
                            required
                            onChange={(value) =>
                              updateRaq(product.key, { transporterName: value })
                            }
                            onSelect={(partner) =>
                              updateRaq(product.key, {
                                transporterName: partner.razao_social,
                                transporterCnpj: formatCnpj(partner.cnpj),
                                ...(partner.motorista ? { driverName: partner.motorista } : {}),
                                ...(partner.placa ? { truckPlate: partner.placa } : {}),
                              })
                            }
                          />
                          <PartnerSuggestField
                            label="CNPJ do Transportador *"
                            mode="cnpj"
                            value={draft.transporterCnpj}
                            partners={transporters}
                            disabled={busy}
                            required
                            onChange={(value) =>
                              updateRaq(product.key, { transporterCnpj: value })
                            }
                            onSelect={(partner) =>
                              updateRaq(product.key, {
                                transporterName: partner.razao_social,
                                transporterCnpj: formatCnpj(partner.cnpj),
                                ...(partner.motorista ? { driverName: partner.motorista } : {}),
                                ...(partner.placa ? { truckPlate: partner.placa } : {}),
                              })
                            }
                          />
                          <label className="reg-doc-form__field">
                            <span>Nota Fiscal do Produto (número) *</span>
                            <input
                              type="text"
                              value={draft.invoiceNumber}
                              onChange={(event) =>
                                updateRaq(product.key, { invoiceNumber: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <label className="reg-doc-form__field">
                            <span>Placa do caminhão/reboque *</span>
                            <input
                              type="text"
                              value={draft.truckPlate}
                              onChange={(event) =>
                                updateRaq(product.key, {
                                  truckPlate: event.target.value.toUpperCase(),
                                })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <label className="reg-doc-form__field">
                            <span>Nome do Motorista *</span>
                            <input
                              type="text"
                              value={draft.driverName}
                              onChange={(event) =>
                                updateRaq(product.key, { driverName: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <PartnerSuggestField
                            label="Distribuidor *"
                            mode="name"
                            value={draft.distributorName}
                            partners={distributors}
                            disabled={busy}
                            required
                            onChange={(value) =>
                              updateRaq(product.key, { distributorName: value })
                            }
                            onSelect={(partner) =>
                              updateRaq(product.key, {
                                distributorName: partner.razao_social,
                                distributorCnpj: formatCnpj(partner.cnpj),
                              })
                            }
                          />
                          <PartnerSuggestField
                            label="CNPJ do Distribuidor *"
                            mode="cnpj"
                            value={draft.distributorCnpj}
                            partners={distributors}
                            disabled={busy}
                            required
                            onChange={(value) =>
                              updateRaq(product.key, { distributorCnpj: value })
                            }
                            onSelect={(partner) =>
                              updateRaq(product.key, {
                                distributorName: partner.razao_social,
                                distributorCnpj: formatCnpj(partner.cnpj),
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <section className="fuel-panel">
            <h2>2. Análise do combustível</h2>
            <p className="fuel-panel__hint">
              A foto no local é opcional. Se tirar, as coordenadas GPS e data/hora serão registradas
              automaticamente.
            </p>
            <div className="fuel-accordion">
              {launchProducts.map((product) => {
                const draft = analysisDrafts[product.key] ?? emptyAnalysis()
                const open = openAnalysis === product.key
                const alcoholKind = productAlcoholKind(product.key)
                return (
                  <article key={product.key} className="fuel-accordion__item">
                    <button
                      type="button"
                      className="fuel-accordion__trigger"
                      onClick={() => setOpenAnalysis(open ? null : product.key)}
                    >
                      <span>{product.label}</span>
                      <span>{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <div className="fuel-accordion__body">
                        <div className="fuel-fields">
                          <label className="reg-doc-form__field">
                            <span>Aspecto *</span>
                            <select
                              value={draft.aspecto}
                              onChange={(event) =>
                                updateAnalysis(product.key, { aspecto: event.target.value })
                              }
                              disabled={busy}
                              required
                            >
                              <option value="">Selecione</option>
                              {FUEL_ASPECTO_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="reg-doc-form__field">
                            <span>Cor *</span>
                            <select
                              value={draft.cor}
                              onChange={(event) =>
                                updateAnalysis(product.key, { cor: event.target.value })
                              }
                              disabled={busy}
                              required
                            >
                              <option value="">Selecione</option>
                              {FUEL_COR_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="reg-doc-form__field">
                            <span>Temperatura Observada (°C) *</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex.: 25,0"
                              value={draft.temperaturaObservada}
                              onChange={(event) =>
                                updateAnalysis(product.key, {
                                  temperaturaObservada: event.target.value,
                                })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <label className="reg-doc-form__field">
                            <span>Massa Específica Observada (Dt) *</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex.: 745 ou 0,745"
                              value={draft.massaEspecificaObservada}
                              onChange={(event) =>
                                updateAnalysis(product.key, {
                                  massaEspecificaObservada: event.target.value,
                                })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <label className="reg-doc-form__field">
                            <span>Massa Específica Convertida 20/4 °C (D20)</span>
                            <input
                              type="text"
                              value={
                                supportsDensityCorrection(product.key)
                                  ? draft.massaEspecificaConvertida
                                    ? `${draft.massaEspecificaConvertida} kg/m³`
                                    : ''
                                  : draft.massaEspecificaConvertida
                              }
                              onChange={
                                supportsDensityCorrection(product.key)
                                  ? undefined
                                  : (event) =>
                                      updateAnalysis(product.key, {
                                        massaEspecificaConvertida: event.target.value,
                                      })
                              }
                              readOnly={supportsDensityCorrection(product.key)}
                              disabled={busy}
                              required={!supportsDensityCorrection(product.key)}
                              placeholder={
                                supportsDensityCorrection(product.key)
                                  ? 'Calculado automaticamente'
                                  : undefined
                              }
                            />
                          </label>
                          {alcoholKind === 'gasoline' && (
                            <label className="reg-doc-form__field">
                              <span>Teor de álcool na Gasolina * ({gasolineAlcoholLimitLabel()})</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Ex.: 30"
                                value={draft.teorAlcoolGasolina}
                                onChange={(event) =>
                                  updateAnalysis(product.key, {
                                    teorAlcoolGasolina: event.target.value,
                                  })
                                }
                                disabled={busy}
                                required
                              />
                            </label>
                          )}
                          {alcoholKind === 'ethanol' && (
                            <label className="reg-doc-form__field">
                              <span>Teor alcoólico °INPM (calculado)</span>
                              <input
                                type="text"
                                value={
                                  draft.teorAlcoolGasolina
                                    ? `${draft.teorAlcoolGasolina} °INPM`
                                    : ''
                                }
                                readOnly
                                disabled={busy}
                                placeholder="Calculado automaticamente pela densidade a 20 °C"
                              />
                            </label>
                          )}
                        </div>

                        {supportsDensityCorrection(product.key) && (
                          <div className="fuel-density">
                            {draft.densidadeLimitLabel && (
                              <p className="fuel-density__limit">
                                Densidade esperada: {draft.densidadeLimitLabel}
                                {FUEL_DENSITY_LIMITS_KG_M3[product.key]?.reference
                                  ? ` (${FUEL_DENSITY_LIMITS_KG_M3[product.key]?.reference})`
                                  : ''}
                              </p>
                            )}
                            {alcoholKind === 'gasoline' && (
                              <p className="fuel-density__limit">
                                Teor alcoólico esperado: {gasolineAlcoholLimitLabel()}
                              </p>
                            )}
                            {alcoholKind === 'ethanol' && (
                              <p className="fuel-density__limit">
                                Teor alcoólico esperado: {ethanolAlcoholLimitLabel()}
                              </p>
                            )}
                            {draft.densidadeStatus && (
                              <span
                                className={`fuel-density__badge fuel-density__badge--${draft.densidadeStatus}`}
                              >
                                {draft.densidadeStatusLabel ??
                                  DENSITY_CONFORMITY_LABELS[draft.densidadeStatus]}
                              </span>
                            )}
                            {draft.densidadeStatusReason && (
                              <p className="fuel-density__reason">{draft.densidadeStatusReason}</p>
                            )}
                          </div>
                        )}

                        <div className="fuel-photo">
                          <LiveCameraCapture
                            disabled={busy}
                            previewUrl={draft.photoPreviewUrl}
                            onCapture={(file) => handleLivePhotoCapture(product.key, file)}
                            onClear={() => clearLivePhoto(product.key)}
                          />
                          <dl className="fuel-photo__meta">
                            <div>
                              <dt>Data e hora da foto</dt>
                              <dd>
                                {draft.photoCapturedAt
                                  ? formatDateTimePtBr(draft.photoCapturedAt)
                                  : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt>Coordenadas</dt>
                              <dd>
                                {draft.photoLatitude != null && draft.photoLongitude != null
                                  ? formatCoords(draft.photoLatitude, draft.photoLongitude)
                                  : '—'}
                              </dd>
                            </div>
                          </dl>
                          {draft.photoError && (
                            <p className="reg-doc-form__error">{draft.photoError}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <section className="fuel-panel">
            <h2>3. Responsável pelo lançamento</h2>
            <p className="fuel-panel__hint">
              Data e hora do lançamento: <strong>{formatDateTimePtBr(submittedAtPreview)}</strong>
            </p>
            <div className="fuel-fields fuel-fields--author">
              <label className="reg-doc-form__field">
                <span>Nome completo *</span>
                <input
                  type="text"
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
            </div>
            <label className="reg-doc-form__field">
              <span>Assinatura *</span>
            </label>
            <SignaturePad disabled={busy} onChange={setSignatureBlob} />
          </section>

          {formError && <p className="reg-doc-form__error">{formError}</p>}

          <div className="reg-doc-card__actions fuel-form__actions">
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
            <button
              type="button"
              className="btn btn--secondary"
              onClick={closeForm}
              disabled={busy}
            >
              Fechar
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Lançando...' : 'Lançar relatório'}
            </button>
          </div>
        </form>
      )}

      {!formOpen && (
        <section className="fuel-panel">
          <h2>Últimos lançamentos</h2>
          <p className="fuel-panel__hint">
            Não é possível editar nem apagar. Um lançamento fica vigente enquanto algum combustível
            dele for o mais recente (igual à página pública). Só vai para o arquivo quando todos os
            produtos forem substituídos por um lançamento novo do mesmo combustível.
          </p>
          {currentReports.length === 0 ? (
            <p className="reg-doc-card__empty">Nenhum relatório lançado ainda.</p>
          ) : (
            <div className="fuel-history">
              {currentReports.map((report) => {
                const currentKeys = currentProductKeysForReport(report, latestReportIdByProduct)
                return (
                  <article
                    key={report.id}
                    className="fuel-history__card fuel-history__card--current"
                  >
                    <div>
                      <span className="fuel-history__badge">Vigente</span>
                      <h3>{formatDateTimePtBr(report.submitted_at)}</h3>
                      <p>{report.author_full_name}</p>
                      <p>
                        {currentKeys.map((key) => FUEL_PRODUCT_LABELS[key]).join(' · ')}
                        {currentKeys.length < productKeysFromReport(report).length
                          ? ` · ${productKeysFromReport(report).length - currentKeys.length} produto(s) já substituído(s)`
                          : ''}
                      </p>
                      <p className="fuel-history__address">{report.endereco}</p>
                    </div>
                    <ReportCardActions
                      report={report}
                      exportingId={exportingId}
                      exportingMode={exportingMode}
                      onView={() => setViewReport(report)}
                      onPrint={() => void handleReportPdf(report, 'print')}
                      onExport={() => void handleReportPdf(report, 'download')}
                    />
                  </article>
                )
              })}
            </div>
          )}

          {exportError && <p className="reg-doc-form__error">{exportError}</p>}

          {archivedReports.length > 0 && (
            <>
              <h3 className="fuel-history__archive-title">Arquivo (somente leitura)</h3>
              <div className="fuel-history">
                {archivedReports.map((report) => (
                  <article key={report.id} className="fuel-history__card">
                    <div>
                      <h3>{formatDateTimePtBr(report.submitted_at)}</h3>
                      <p>{report.author_full_name}</p>
                      <p>
                        {productKeysFromReport(report)
                          .map((key) => FUEL_PRODUCT_LABELS[key])
                          .join(' · ') || `${report.raq_items.length} produto(s)`}
                      </p>
                      <p className="fuel-history__address">{report.endereco}</p>
                    </div>
                    <ReportCardActions
                      report={report}
                      exportingId={exportingId}
                      exportingMode={exportingMode}
                      onView={() => setViewReport(report)}
                      onPrint={() => void handleReportPdf(report, 'print')}
                      onExport={() => void handleReportPdf(report, 'download')}
                    />
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {viewReport && (
        <ReportDetailsModal
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

function ReportCardActions({
  report,
  exportingId,
  exportingMode,
  onView,
  onPrint,
  onExport,
}: {
  report: FuelAnalysisReport
  exportingId: string | null
  exportingMode: 'print' | 'download' | null
  onView: () => void
  onPrint: () => void
  onExport: () => void
}) {
  const busy = exportingId === report.id
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

function ReportDetailsModal({
  report,
  exportingId,
  exportingMode,
  onClose,
  onPrint,
  onExport,
}: {
  report: FuelAnalysisReport
  exportingId: string | null
  exportingMode: 'print' | 'download' | null
  onClose: () => void
  onPrint: () => void
  onExport: () => void
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [invoiceUrls, setInvoiceUrls] = useState<Record<string, string>>({})
  const busy = exportingId === report.id
  const printing = busy && exportingMode === 'print'
  const downloading = busy && exportingMode === 'download'

  useEffect(() => {
    let active = true
    getFuelFileUrl(report.signature_storage_path)
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
    const photoItems = report.analysis_items.filter((item) => item.photo_storage_path)
    const invoiceItems = report.raq_items.filter((item) => item.invoice_storage_path)

    void Promise.all([
      Promise.all(
        photoItems.map(async (item) => {
          try {
            const url = await getFuelFileUrl(item.photo_storage_path!)
            return [item.id, url] as const
          } catch {
            return null
          }
        }),
      ),
      Promise.all(
        invoiceItems.map(async (item) => {
          try {
            const url = await getFuelFileUrl(item.invoice_storage_path!)
            return [item.id, url] as const
          } catch {
            return null
          }
        }),
      ),
    ]).then(([photos, invoices]) => {
      if (!active) return
      const nextPhotos: Record<string, string> = {}
      for (const row of photos) {
        if (row) nextPhotos[row[0]] = row[1]
      }
      const nextInvoices: Record<string, string> = {}
      for (const row of invoices) {
        if (row) nextInvoices[row[0]] = row[1]
      }
      setPhotoUrls(nextPhotos)
      setInvoiceUrls(nextInvoices)
    })

    return () => {
      active = false
    }
  }, [report.analysis_items, report.raq_items])

  return (
    <div className="reg-doc-modal" role="dialog" aria-modal="true">
      <div className="reg-doc-modal__dialog fuel-details">
        <header className="reg-doc-modal__header">
          <h2>Detalhes do RAQ</h2>
          <button type="button" className="reg-doc-modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <dl className="fuel-company">
          <div>
            <dt>Razão Social</dt>
            <dd>{report.razao_social}</dd>
          </div>
          <div>
            <dt>CNPJ</dt>
            <dd>{formatCnpj(report.cnpj)}</dd>
          </div>
          <div>
            <dt>Endereço</dt>
            <dd>{report.endereco}</dd>
          </div>
          <div>
            <dt>Lançado em</dt>
            <dd>{formatDateTimePtBr(report.submitted_at)}</dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd>
              {report.author_full_name}
            </dd>
          </div>
        </dl>

        <h3>RAQ</h3>
        {report.raq_items.map((item) => {
          const invoiceUrl = invoiceUrls[item.id]
          const invoiceIsImage = Boolean(
            item.invoice_file_name &&
              /\.(jpe?g|png|webp|gif)$/i.test(item.invoice_file_name),
          )
          return (
            <div key={item.id} className="fuel-details__block">
              <strong>{FUEL_PRODUCT_LABELS[item.product_key]}</strong>
              <p>Volume: {item.volume_received_liters ?? '—'} L</p>
              <p>
                Coleta:{' '}
                {item.collection_date ? formatDatePtBr(item.collection_date) : '—'}
              </p>
              <p>
                Transportador: {item.transporter_name} ({formatCnpj(item.transporter_cnpj ?? '')})
              </p>
              <p>
                NF: {item.invoice_number}
                {item.invoice_file_name ? ` · ${item.invoice_file_name}` : ''}
              </p>
              {invoiceUrl && (
                <div className="fuel-details__media">
                  <span>Anexo da Nota Fiscal</span>
                  {invoiceIsImage ? (
                    <img
                      src={invoiceUrl}
                      alt={`Nota fiscal ${item.invoice_number ?? ''}`.trim()}
                      className="fuel-details__photo"
                    />
                  ) : (
                    <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                      Abrir anexo da NF
                    </a>
                  )}
                </div>
              )}
              <p>
                Placa: {item.truck_plate} · Motorista: {item.driver_name}
              </p>
              <p>
                Distribuidor: {item.distributor_name} ({formatCnpj(item.distributor_cnpj ?? '')})
              </p>
            </div>
          )
        })}

        <h3>Análises</h3>
        {report.analysis_items.map((item) => {
          const photoUrl = photoUrls[item.id]
          return (
            <div key={item.id} className="fuel-details__block">
              <strong>{FUEL_PRODUCT_LABELS[item.product_key]}</strong>
              <p>Aspecto: {item.aspecto}</p>
              <p>Cor: {item.cor}</p>
              <p>Temperatura: {item.temperatura_observada}</p>
              <p>ME observada: {item.massa_especifica_observada}</p>
              <p>ME convertida 20 °C: {item.massa_especifica_convertida}</p>
              {item.densidade_status && (
                <p>
                  Conformidade ANP:{' '}
                  <strong className={`fuel-density__badge fuel-density__badge--${item.densidade_status}`}>
                    {DENSITY_CONFORMITY_LABELS[item.densidade_status]}
                  </strong>
                </p>
              )}
              {item.teor_alcool_gasolina && (
                <p>
                  {item.product_key.startsWith('etanol-')
                    ? `Teor alcoólico: ${item.teor_alcool_gasolina} °INPM`
                    : `Teor de álcool: ${item.teor_alcool_gasolina}%`}
                </p>
              )}
              <p>
                Foto em:{' '}
                {item.photo_captured_at ? formatDateTimePtBr(item.photo_captured_at) : '—'}
              </p>
              <p>
                Coordenadas:{' '}
                {item.photo_latitude != null && item.photo_longitude != null
                  ? formatCoords(item.photo_latitude, item.photo_longitude)
                  : '—'}
              </p>
              {photoUrl ? (
                <div className="fuel-details__media">
                  <span>Foto do local</span>
                  <img
                    src={photoUrl}
                    alt={`Foto ${FUEL_PRODUCT_LABELS[item.product_key]}`}
                    className="fuel-details__photo"
                  />
                </div>
              ) : item.photo_storage_path ? (
                <p className="fuel-details__photo-loading">Carregando foto...</p>
              ) : null}
            </div>
          )
        })}

        {signatureUrl && (
          <div className="fuel-details__signature">
            <h3>Assinatura</h3>
            <img src={signatureUrl} alt="Assinatura do responsável" />
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
