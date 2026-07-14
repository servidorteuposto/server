import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  FUEL_ANALYSES_MAX_FILE_BYTES,
  FUEL_PRODUCTS,
  formatCnpj,
  formatCoords,
  formatCpf,
  formatDateTimePtBr,
  FUEL_PRODUCT_LABELS,
  isPdfOrImageFile,
  productHasAlcoholContent,
  validateCpf,
  validateDistributorCnpj,
  validateTransporterCnpj,
  type FuelProductKey,
} from '../config/fuel-analyses'
import {
  correctDensityTo20C,
  FUEL_DENSITY_LIMITS_KG_M3,
  supportsDensityCorrection,
  type DensityConformity,
  type DensityCorrectionResult,
  DENSITY_CONFORMITY_LABELS,
} from '../config/fuel-density'
import SignaturePad from '../components/fuel-analyses/SignaturePad'
import LiveCameraCapture from '../components/fuel-analyses/LiveCameraCapture'
import {
  getFuelFileUrl,
  getFuelProductSettings,
  getMyPostoProfile,
  listFuelAnalysisReports,
  saveFuelAnalysisReport,
  saveFuelProductSettings,
  updatePostoEndereco,
  type AnalysisItemInput,
  type FuelAnalysisReport,
  type PostoProfile,
  type RaqItemInput,
} from '../lib/fuel-analyses'
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
  collectionDate: string
  transporterName: string
  transporterCnpj: string
  invoiceNumber: string
  invoiceFile: File | null
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
    collectionDate: '',
    transporterName: '',
    transporterCnpj: '',
    invoiceNumber: '',
    invoiceFile: null,
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
    photoFile: null,
    photoPreviewUrl: null,
    photoLatitude: null,
    photoLongitude: null,
    photoCapturedAt: null,
    photoError: null,
  }
}

function applyDensityCorrection(
  productKey: FuelProductKey,
  draft: AnalysisDraft,
): Pick<
  AnalysisDraft,
  | 'massaEspecificaConvertida'
  | 'densidadeStatus'
  | 'coeficienteGamma'
  | 'densidadeFormula'
  | 'densidadeLimitLabel'
  | 'densidadeStatusReason'
> {
  if (!supportsDensityCorrection(productKey)) {
    return {
      massaEspecificaConvertida: draft.massaEspecificaConvertida,
      densidadeStatus: null,
      coeficienteGamma: null,
      densidadeFormula: null,
      densidadeLimitLabel: null,
      densidadeStatusReason: null,
    }
  }

  const result: DensityCorrectionResult | null = correctDensityTo20C(
    productKey,
    draft.massaEspecificaObservada,
    draft.temperaturaObservada,
  )

  if (!result) {
    return {
      massaEspecificaConvertida: '',
      densidadeStatus: null,
      coeficienteGamma: null,
      densidadeFormula: null,
      densidadeLimitLabel: FUEL_DENSITY_LIMITS_KG_M3[productKey]
        ? draft.densidadeLimitLabel
        : null,
      densidadeStatusReason: null,
    }
  }

  return {
    massaEspecificaConvertida: result.d20Formatted,
    densidadeStatus: result.status,
    coeficienteGamma: result.gammaKgM3,
    densidadeFormula: result.formulaLabel,
    densidadeLimitLabel: result.limitLabel,
    densidadeStatusReason: result.statusReason,
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
  const [endereco, setEndereco] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<FuelProductKey[]>([])
  const [productsSaved, setProductsSaved] = useState(false)
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
  const [authorCpf, setAuthorCpf] = useState('')
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [submittedAtPreview, setSubmittedAtPreview] = useState(() => new Date().toISOString())
  const [viewReport, setViewReport] = useState<FuelAnalysisReport | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [showQrPanel, setShowQrPanel] = useState(false)
  const [showProductsPanel, setShowProductsPanel] = useState(false)

  const enabledProducts = useMemo(
    () => FUEL_PRODUCTS.filter((product) => selectedProducts.includes(product.key)),
    [selectedProducts],
  )

  const latestReport = reports[0] ?? null
  const archivedReports = reports.slice(1)

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const profile = await getMyPostoProfile()
      setPosto(profile)
      setEndereco(profile.endereco ?? '')
      const [products, rows] = await Promise.all([
        getFuelProductSettings(profile.id),
        listFuelAnalysisReports(profile.id),
      ])
      const managedProducts = products.filter((key) => key !== 'gnv')
      setSelectedProducts(managedProducts)
      setProductsSaved(managedProducts.length > 0)
      setShowProductsPanel(managedProducts.length === 0)
      setReports(rows)
    } catch {
      setPageError('Não foi possível carregar Análises de Combustíveis.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPage()
  }, [loadPage])

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

  function toggleProduct(key: FuelProductKey) {
    setSelectedProducts((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
  }

  async function handleSaveProducts() {
    if (!posto || isReadOnly) return
    if (!selectedProducts.length) {
      setPageError('Selecione pelo menos um produto gerenciado pelo posto.')
      return
    }
    setBusy(true)
    setPageError(null)
    try {
      await saveFuelProductSettings(posto.id, selectedProducts)
      if (endereco.trim() && endereco.trim() !== (posto.endereco ?? '')) {
        await updatePostoEndereco(posto.id, endereco.trim())
        setPosto({ ...posto, endereco: endereco.trim() })
      }
      setProductsSaved(true)
      setShowProductsPanel(false)
    } catch {
      setPageError('Não foi possível salvar os produtos do posto.')
    } finally {
      setBusy(false)
    }
  }

  function openForm() {
    if (!enabledProducts.length) {
      setPageError('Selecione e salve os produtos gerenciados antes de incluir um RAQ.')
      return
    }
    const nextRaq: Partial<Record<FuelProductKey, RaqDraft>> = {}
    const nextAnalysis: Partial<Record<FuelProductKey, AnalysisDraft>> = {}
    for (const product of enabledProducts) {
      nextRaq[product.key] = emptyRaq()
      nextAnalysis[product.key] = emptyAnalysis()
    }
    setRaqDrafts(nextRaq)
    setAnalysisDrafts(nextAnalysis)
    setOpenRaq(enabledProducts[0]?.key ?? null)
    setOpenAnalysis(enabledProducts[0]?.key ?? null)
    setAuthorName('')
    setAuthorCpf('')
    setSignatureBlob(null)
    setFormError(null)
    setSubmittedAtPreview(new Date().toISOString())
    setShowQrPanel(false)
    setShowProductsPanel(false)
    setFormOpen(true)
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
        'temperaturaObservada' in patch || 'massaEspecificaObservada' in patch

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
    if (!endereco.trim()) return 'Informe o endereço do posto revendedor.'

    for (const product of enabledProducts) {
      const raq = raqDrafts[product.key] ?? emptyRaq()
      if (!raq.volumeReceivedLiters.trim()) {
        return `${product.label}: informe o volume recebido.`
      }
      if (!raq.collectionDate) return `${product.label}: informe a data da coleta.`
      if (!raq.transporterName.trim()) return `${product.label}: informe o transportador.`
      const transporterError = validateTransporterCnpj(raq.transporterCnpj)
      if (transporterError) return `${product.label}: ${transporterError}`
      if (!raq.invoiceNumber.trim()) return `${product.label}: informe o número da nota fiscal.`
      if (!raq.invoiceFile) return `${product.label}: anexe a nota fiscal do produto.`
      if (raq.invoiceFile && !isPdfOrImageFile(raq.invoiceFile)) {
        return `${product.label}: a nota fiscal deve ser PDF ou imagem.`
      }
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
        return `${product.label}: informe o teor de álcool na gasolina.`
      }
      if (!analysis.photoFile) return `${product.label}: tire a foto comprovando o local.`
      if (analysis.photoLatitude == null || analysis.photoLongitude == null) {
        return `${product.label}: a foto precisa conter coordenadas GPS válidas.`
      }
    }

    if (!authorName.trim()) return 'Informe o nome completo de quem está lançando o relatório.'
    const cpfError = validateCpf(authorCpf)
    if (cpfError) return cpfError
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

    setBusy(true)
    setFormError(null)
    const submittedAt = new Date().toISOString()

    try {
      if (endereco.trim() !== (posto.endereco ?? '')) {
        await updatePostoEndereco(posto.id, endereco.trim())
        setPosto({ ...posto, endereco: endereco.trim() })
      }

      const raqItems: RaqItemInput[] = enabledProducts.map((product) => {
        const draft = raqDrafts[product.key] ?? emptyRaq()
        return {
          productKey: product.key,
          volumeReceivedLiters: draft.volumeReceivedLiters,
          collectionDate: draft.collectionDate,
          transporterName: draft.transporterName,
          transporterCnpj: draft.transporterCnpj,
          invoiceNumber: draft.invoiceNumber,
          invoiceFile: draft.invoiceFile,
          truckPlate: draft.truckPlate,
          driverName: draft.driverName,
          distributorName: draft.distributorName,
          distributorCnpj: draft.distributorCnpj,
        }
      })

      const analysisItems: AnalysisItemInput[] = enabledProducts.map((product) => {
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
        endereco: endereco.trim(),
        authorFullName: authorName,
        authorCpf,
        signatureBlob: signatureBlob!,
        submittedAt,
        raqItems,
        analysisItems,
      })

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
            Lançamentos são imutáveis: para atualizar, envie uma nova planilha completa. Sempre vale o
            último lançamento.
          </p>
        </div>
        {!formOpen && (
          <div className="fuel-header-actions">
            {!isReadOnly && (
              <button
                type="button"
                className={`reg-docs-page__add-btn fuel-header-actions__btn${showProductsPanel ? ' is-active' : ''}`}
                onClick={() => {
                  setShowProductsPanel((open) => !open)
                  setShowQrPanel(false)
                }}
              >
                Produtos
              </button>
            )}
            <button
              type="button"
              className={`reg-docs-page__add-btn fuel-header-actions__btn fuel-header-actions__btn--ghost${showQrPanel ? ' is-active' : ''}`}
              onClick={() => {
                setShowQrPanel((open) => !open)
                setShowProductsPanel(false)
              }}
            >
              QR Code
            </button>
            {!isReadOnly && productsSaved && (
              <button type="button" className="reg-docs-page__add-btn" onClick={openForm}>
                Incluir RAQ
              </button>
            )}
          </div>
        )}
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      {!productsSaved && !showProductsPanel && !formOpen && !isReadOnly && (
        <p className="fuel-setup-hint">
          Configure os produtos gerenciados pelo posto antes de lançar o primeiro RAQ.
        </p>
      )}

      <section className="fuel-panel">
        <h2>Registro das Análises da Qualidade — RAQ</h2>
        <dl className="fuel-company">
          <div>
            <dt>Razão Social</dt>
            <dd>{posto.nome}</dd>
          </div>
          <div>
            <dt>CNPJ do Posto Revendedor</dt>
            <dd>{formatCnpj(posto.cnpj)}</dd>
          </div>
          <div>
            <dt>Endereço</dt>
            <dd>
              {isReadOnly || formOpen ? (
                endereco.trim() || '—'
              ) : (
                <input
                  type="text"
                  value={endereco}
                  onChange={(event) => setEndereco(event.target.value)}
                  placeholder="Endereço completo do posto"
                  disabled={busy}
                />
              )}
            </dd>
          </div>
        </dl>
      </section>

      {showQrPanel && (
        <section className="fuel-panel">
          <div className="fuel-panel__header">
            <div>
              <h2>QR Code público do posto</h2>
              <p>Imprima e deixe no posto. Clientes escaneiam e veem o último RAQ em tempo real.</p>
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setShowQrPanel(false)}
            >
              Fechar
            </button>
          </div>
          <div className="fuel-qr">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code da página pública do posto" className="fuel-qr__image" />
            ) : (
              <p className="reg-doc-card__empty">Gerando QR Code...</p>
            )}
            <div className="fuel-qr__meta">
              {publicUrl && (
                <>
                  <p className="fuel-qr__url">{publicUrl}</p>
                  <div className="reg-doc-card__actions">
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
                      Baixar QR Code
                    </a>
                    <a className="btn btn--secondary" href={publicUrl} target="_blank" rel="noreferrer">
                      Abrir página pública
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {showProductsPanel && (
        <section className="fuel-panel">
          <div className="fuel-panel__header">
            <div>
              <h2>Produtos gerenciados</h2>
              <p>Selecione os produtos do posto. Depois disso, só abra de novo se precisar alterar.</p>
            </div>
            <div className="fuel-panel__header-actions">
              {!isReadOnly && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSaveProducts}
                  disabled={busy}
                >
                  Salvar produtos
                </button>
              )}
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowProductsPanel(false)}
                disabled={busy}
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="fuel-products">
            {FUEL_PRODUCTS.map((product) => {
              const checked = selectedProducts.includes(product.key)
              return (
                <label key={product.key} className={`fuel-products__item${checked ? ' is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProduct(product.key)}
                    disabled={isReadOnly || busy}
                  />
                  <span>{product.label}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {formOpen && (
        <form className="fuel-form" onSubmit={handleSubmit}>
          <section className="fuel-panel">
            <h2>1. Registro das Análises da Qualidade — RAQ</h2>
            <div className="fuel-accordion">
              {enabledProducts.map((product) => {
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
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draft.volumeReceivedLiters}
                              onChange={(event) =>
                                updateRaq(product.key, { volumeReceivedLiters: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
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
                          <label className="reg-doc-form__field">
                            <span>Transportador *</span>
                            <input
                              type="text"
                              value={draft.transporterName}
                              onChange={(event) =>
                                updateRaq(product.key, { transporterName: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <label className="reg-doc-form__field">
                            <span>CNPJ do Transportador *</span>
                            <input
                              type="text"
                              value={draft.transporterCnpj}
                              onChange={(event) =>
                                updateRaq(product.key, {
                                  transporterCnpj: formatCnpj(event.target.value),
                                })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
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
                          <label className="reg-doc-form__field reg-doc-form__field--file">
                            <span>Anexo da Nota Fiscal *</span>
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              onChange={(event) =>
                                updateRaq(product.key, {
                                  invoiceFile: event.target.files?.[0] ?? null,
                                })
                              }
                              disabled={busy}
                            />
                            {draft.invoiceFile && <small>{draft.invoiceFile.name}</small>}
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
                          <label className="reg-doc-form__field">
                            <span>Distribuidor *</span>
                            <input
                              type="text"
                              value={draft.distributorName}
                              onChange={(event) =>
                                updateRaq(product.key, { distributorName: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <label className="reg-doc-form__field">
                            <span>CNPJ do Distribuidor *</span>
                            <input
                              type="text"
                              value={draft.distributorCnpj}
                              onChange={(event) =>
                                updateRaq(product.key, {
                                  distributorCnpj: formatCnpj(event.target.value),
                                })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <section className="fuel-panel">
            <h2>2. Análises dos Combustíveis</h2>
            <p className="fuel-panel__hint">
              Em cada produto, tire uma foto no local. As coordenadas GPS e data/hora serão registradas
              automaticamente.
            </p>
            <div className="fuel-accordion">
              {enabledProducts.map((product) => {
                const draft = analysisDrafts[product.key] ?? emptyAnalysis()
                const open = openAnalysis === product.key
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
                            <input
                              type="text"
                              value={draft.aspecto}
                              onChange={(event) =>
                                updateAnalysis(product.key, { aspecto: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
                          </label>
                          <label className="reg-doc-form__field">
                            <span>Cor *</span>
                            <input
                              type="text"
                              value={draft.cor}
                              onChange={(event) =>
                                updateAnalysis(product.key, { cor: event.target.value })
                              }
                              disabled={busy}
                              required
                            />
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
                          {productHasAlcoholContent(product.key) && (
                            <label className="reg-doc-form__field">
                              <span>Teor de álcool na Gasolina *</span>
                              <input
                                type="text"
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
                        </div>

                        {supportsDensityCorrection(product.key) && (
                          <div className="fuel-density">
                            <p className="fuel-density__formula">
                              D20 = Dt + γ × (t − 20)
                              {draft.coeficienteGamma != null && (
                                <>
                                  {' '}
                                  · γ = {draft.coeficienteGamma.toFixed(2)} kg/m³/°C
                                </>
                              )}
                            </p>
                            {draft.densidadeFormula && (
                              <p className="fuel-density__calc">{draft.densidadeFormula}</p>
                            )}
                            {draft.densidadeLimitLabel && (
                              <p className="fuel-density__limit">
                                Limite ANP: {draft.densidadeLimitLabel}
                                {FUEL_DENSITY_LIMITS_KG_M3[product.key]?.reference
                                  ? ` (${FUEL_DENSITY_LIMITS_KG_M3[product.key]?.reference})`
                                  : ''}
                              </p>
                            )}
                            {draft.densidadeStatus && (
                              <span
                                className={`fuel-density__badge fuel-density__badge--${draft.densidadeStatus}`}
                              >
                                {DENSITY_CONFORMITY_LABELS[draft.densidadeStatus]}
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
              <label className="reg-doc-form__field">
                <span>CPF *</span>
                <input
                  type="text"
                  value={authorCpf}
                  onChange={(event) => setAuthorCpf(formatCpf(event.target.value))}
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
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Lançando...' : 'Lançar relatório'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setFormOpen(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!formOpen && (
        <section className="fuel-panel">
          <h2>Lançamento vigente</h2>
          <p className="fuel-panel__hint">
            Não é possível editar nem apagar planilhas já lançadas. Um novo lançamento completo substitui
            o anterior na página pública.
          </p>
          {!latestReport ? (
            <p className="reg-doc-card__empty">Nenhum relatório lançado ainda.</p>
          ) : (
            <article className="fuel-history__card fuel-history__card--current">
              <div>
                <span className="fuel-history__badge">Vigente</span>
                <h3>{formatDateTimePtBr(latestReport.submitted_at)}</h3>
                <p>
                  {latestReport.author_full_name} · CPF {formatCpf(latestReport.author_cpf)}
                </p>
                <p>
                  {latestReport.raq_items.length} produto(s) · {latestReport.endereco}
                </p>
              </div>
              <div className="reg-doc-card__actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setViewReport(latestReport)}
                >
                  Ver detalhes
                </button>
              </div>
            </article>
          )}

          {archivedReports.length > 0 && (
            <>
              <h3 className="fuel-history__archive-title">Arquivo (somente leitura)</h3>
              <div className="fuel-history">
                {archivedReports.map((report) => (
                  <article key={report.id} className="fuel-history__card">
                    <div>
                      <h3>{formatDateTimePtBr(report.submitted_at)}</h3>
                      <p>
                        {report.author_full_name} · CPF {formatCpf(report.author_cpf)}
                      </p>
                      <p>
                        {report.raq_items.length} produto(s) · {report.endereco}
                      </p>
                    </div>
                    <div className="reg-doc-card__actions">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setViewReport(report)}
                      >
                        Ver detalhes
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {viewReport && (
        <ReportDetailsModal report={viewReport} onClose={() => setViewReport(null)} />
      )}
    </div>
  )
}

function ReportDetailsModal({
  report,
  onClose,
}: {
  report: FuelAnalysisReport
  onClose: () => void
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)

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
              {report.author_full_name} · {formatCpf(report.author_cpf)}
            </dd>
          </div>
        </dl>

        <h3>RAQ</h3>
        {report.raq_items.map((item) => (
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
            <p>
              Placa: {item.truck_plate} · Motorista: {item.driver_name}
            </p>
            <p>
              Distribuidor: {item.distributor_name} ({formatCnpj(item.distributor_cnpj ?? '')})
            </p>
          </div>
        ))}

        <h3>Análises</h3>
        {report.analysis_items.map((item) => (
          <div key={item.id} className="fuel-details__block">
            <strong>{FUEL_PRODUCT_LABELS[item.product_key]}</strong>
            <p>Aspecto: {item.aspecto}</p>
            <p>Cor: {item.cor}</p>
            <p>Temperatura: {item.temperatura_observada}</p>
            <p>ME observada: {item.massa_especifica_observada}</p>
            <p>ME convertida 20 °C: {item.massa_especifica_convertida}</p>
            {item.densidade_formula && <p>Cálculo: {item.densidade_formula}</p>}
            {item.densidade_status && (
              <p>
                Conformidade ANP:{' '}
                <strong className={`fuel-density__badge fuel-density__badge--${item.densidade_status}`}>
                  {DENSITY_CONFORMITY_LABELS[item.densidade_status]}
                </strong>
              </p>
            )}
            {item.teor_alcool_gasolina && <p>Teor de álcool: {item.teor_alcool_gasolina}</p>}
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
          </div>
        ))}

        {signatureUrl && (
          <div className="fuel-details__signature">
            <h3>Assinatura</h3>
            <img src={signatureUrl} alt="Assinatura do responsável" />
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
