import { useEffect, useMemo, useState } from 'react'
import {
  FUEL_PRODUCT_LABELS,
  formatCnpj,
  formatCoords,
  formatDateTimePtBr,
  type FuelProductKey,
} from '../config/fuel-analyses'
import { DENSITY_CONFORMITY_LABELS } from '../config/fuel-density'
import { formatDatePtBr } from '../config/regulatory-documents'
import {
  fetchPublicPostoBoard,
  getPublicFuelFileUrl,
  uniqueProductsFromBoard,
  type PublicPostoBoard,
} from '../lib/public-posto'
import {
  buildRaqPdfFileName,
  downloadRaqPdf,
  generateRaqPrintPdf,
} from '../lib/raq-print-report'
import './PublicPostoPage.css'
import '../pages/FuelAnalysesPage.css'

type PublicPostoPageProps = {
  slug: string
}

export default function PublicPostoPage({ slug }: PublicPostoPageProps) {
  const [board, setBoard] = useState<PublicPostoBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [productFilter, setProductFilter] = useState<FuelProductKey | 'all'>('all')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    fetchPublicPostoBoard(slug)
      .then((data) => {
        if (!active) return
        if (!data) {
          setError('Posto não encontrado.')
          setBoard(null)
          return
        }
        setBoard(data)
      })
      .catch(() => {
        if (!active) return
        setError('Não foi possível carregar as informações públicas do posto.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [slug])

  const products = useMemo(() => (board ? uniqueProductsFromBoard(board) : []), [board])

  const visibleProducts = useMemo(() => {
    if (productFilter === 'all') return products
    return products.filter((key) => key === productFilter)
  }, [products, productFilter])

  async function handleExportPdf() {
    if (!board) return
    if (!board.raq_items.length && !board.analysis_items.length) return

    setExporting(true)
    setExportError(null)

    try {
      const raqItems =
        productFilter === 'all'
          ? board.raq_items
          : board.raq_items.filter((item) => item.product_key === productFilter)
      const analysisItems =
        productFilter === 'all'
          ? board.analysis_items
          : board.analysis_items.filter((item) => item.product_key === productFilter)

      const payload = {
        posto: board.posto,
        report: board.report,
        raq_items: raqItems,
        analysis_items: analysisItems,
      }
      const bytes = await generateRaqPrintPdf(payload)
      downloadRaqPdf(bytes, buildRaqPdfFileName(payload))
    } catch {
      setExportError('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="public-posto">
        <div className="public-posto__shell">
          <p className="public-posto__status">Carregando informações do posto...</p>
        </div>
      </div>
    )
  }

  if (error && !board) {
    return (
      <div className="public-posto">
        <div className="public-posto__shell">
          <p className="public-posto__error">{error}</p>
        </div>
      </div>
    )
  }

  if (!board) return null

  const hasItems = board.raq_items.length > 0 || board.analysis_items.length > 0

  return (
    <div className="public-posto">
      <div className="public-posto__glow" aria-hidden="true" />

      <div className="public-posto__shell">
        {hasItems && (
          <button
            type="button"
            className="public-posto__export"
            onClick={handleExportPdf}
            disabled={exporting || visibleProducts.length === 0}
            title="Exportar PDF dos RAQs visíveis"
          >
            {exporting ? 'Exportando...' : 'Exportar'}
          </button>
        )}

        <header className="public-posto__hero">
          <img
            src="/imagens/logo_teuposto.png"
            alt="Teu Posto"
            className="public-posto__logo"
          />
          <div className="public-posto__posto">
            <p className="public-posto__eyebrow">Consulta pública</p>
            <h1>{board.posto.nome}</h1>
            <div className="public-posto__meta">
              <span>CNPJ {formatCnpj(board.posto.cnpj)}</span>
              <span className="public-posto__meta-dot" aria-hidden="true">
                ·
              </span>
              <span>{board.posto.endereco || 'Endereço não informado'}</span>
            </div>
            <p className="public-posto__live">
              Cada combustível exibe o último RAQ lançado daquele produto
            </p>
          </div>
        </header>

        {error && <p className="public-posto__error">{error}</p>}
        {exportError && <p className="public-posto__error">{exportError}</p>}

        <section className="public-posto__section">
          <div className="public-posto__section-head">
            <div>
              <h2>Análises de Combustíveis</h2>
              <p>Registro das Análises da Qualidade (RAQ)</p>
            </div>
          </div>

          {!hasItems ? (
            <div className="public-posto__empty">
              <strong>Nenhum RAQ publicado ainda</strong>
              <p>Assim que o posto lançar um RAQ, ele aparece aqui automaticamente.</p>
            </div>
          ) : (
            <>
              {products.length > 1 && (
                <label className="public-posto__filter">
                  <span>Combustível</span>
                  <select
                    value={productFilter}
                    onChange={(event) =>
                      setProductFilter(event.target.value as FuelProductKey | 'all')
                    }
                  >
                    <option value="all">Todos</option>
                    {products.map((key) => (
                      <option key={key} value={key}>
                        {FUEL_PRODUCT_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="public-posto__fuel-list">
                {visibleProducts.map((productKey) => (
                  <FuelPublicCard
                    key={productKey}
                    productKey={productKey}
                    raq={board.raq_items.find((item) => item.product_key === productKey)}
                    analysis={board.analysis_items.find((item) => item.product_key === productKey)}
                    fallbackAuthor={board.report?.author_full_name}
                    fallbackSignaturePath={board.report?.signature_storage_path}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function FuelPublicCard({
  productKey,
  raq,
  analysis,
  fallbackAuthor,
  fallbackSignaturePath,
}: {
  productKey: FuelProductKey
  raq?: PublicPostoBoard['raq_items'][number]
  analysis?: PublicPostoBoard['analysis_items'][number]
  fallbackAuthor?: string | null
  fallbackSignaturePath?: string | null
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)

  const author =
    analysis?.author_full_name || raq?.author_full_name || fallbackAuthor || null
  const signaturePath =
    analysis?.signature_storage_path ||
    raq?.signature_storage_path ||
    fallbackSignaturePath ||
    null
  const submittedAt =
    analysis?.report_submitted_at || raq?.report_submitted_at || null

  useEffect(() => {
    let active = true
    if (!analysis?.photo_storage_path) {
      setPhotoUrl(null)
      return
    }
    getPublicFuelFileUrl(analysis.photo_storage_path)
      .then((url) => {
        if (active) setPhotoUrl(url)
      })
      .catch(() => {
        if (active) setPhotoUrl(null)
      })
    return () => {
      active = false
    }
  }, [analysis?.photo_storage_path])

  useEffect(() => {
    let active = true
    if (!signaturePath) {
      setSignatureUrl(null)
      return
    }
    getPublicFuelFileUrl(signaturePath)
      .then((url) => {
        if (active) setSignatureUrl(url)
      })
      .catch(() => {
        if (active) setSignatureUrl(null)
      })
    return () => {
      active = false
    }
  }, [signaturePath])

  return (
    <article className="public-posto__fuel-card">
      <header className="public-posto__fuel-card-head">
        <div>
          <h3>{FUEL_PRODUCT_LABELS[productKey]}</h3>
          {submittedAt && (
            <p className="public-posto__fuel-stamp">
              Lançado em {formatDateTimePtBr(submittedAt)}
            </p>
          )}
        </div>
        {analysis?.densidade_status && (
          <span
            className={`fuel-density__badge fuel-density__badge--${analysis.densidade_status}`}
          >
            {DENSITY_CONFORMITY_LABELS[analysis.densidade_status]}
          </span>
        )}
      </header>

      <div className="public-posto__fuel-grid">
        <section>
          <h4>Recebimento</h4>
          {raq ? (
            <dl>
              <div>
                <dt>Volume</dt>
                <dd>{raq.volume_received_liters ?? '—'} L</dd>
              </div>
              <div>
                <dt>Coleta</dt>
                <dd>{raq.collection_date ? formatDatePtBr(raq.collection_date) : '—'}</dd>
              </div>
              <div>
                <dt>Transportador</dt>
                <dd>
                  {raq.transporter_name ?? '—'}
                  {raq.transporter_cnpj ? ` · CNPJ ${formatCnpj(raq.transporter_cnpj)}` : ''}
                </dd>
              </div>
              <div>
                <dt>Nota fiscal</dt>
                <dd>
                  {raq.invoice_number ?? '—'}
                  {raq.invoice_file_name ? ` · ${raq.invoice_file_name}` : ''}
                </dd>
              </div>
              <div>
                <dt>Placa</dt>
                <dd>{raq.truck_plate ?? '—'}</dd>
              </div>
              <div>
                <dt>Motorista</dt>
                <dd>{raq.driver_name ?? '—'}</dd>
              </div>
              <div>
                <dt>Distribuidor</dt>
                <dd>
                  {raq.distributor_name ?? '—'}
                  {raq.distributor_cnpj ? ` · CNPJ ${formatCnpj(raq.distributor_cnpj)}` : ''}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="public-posto__muted">Sem dados de recebimento.</p>
          )}
        </section>

        <section>
          <h4>Análise</h4>
          {analysis ? (
            <dl>
              <div>
                <dt>Aspecto</dt>
                <dd>{analysis.aspecto ?? '—'}</dd>
              </div>
              <div>
                <dt>Cor</dt>
                <dd>{analysis.cor ?? '—'}</dd>
              </div>
              <div>
                <dt>Temperatura</dt>
                <dd>{analysis.temperatura_observada ?? '—'}</dd>
              </div>
              <div>
                <dt>ME observada</dt>
                <dd>{analysis.massa_especifica_observada ?? '—'}</dd>
              </div>
              <div>
                <dt>ME 20 °C</dt>
                <dd>{analysis.massa_especifica_convertida ?? '—'}</dd>
              </div>
              {analysis.teor_alcool_gasolina && (
                <div>
                  <dt>
                    {productKey.startsWith('etanol-')
                      ? 'Teor alcoólico (°INPM)'
                      : 'Teor de álcool'}
                  </dt>
                  <dd>
                    {analysis.teor_alcool_gasolina}
                    {productKey.startsWith('etanol-') &&
                    !analysis.teor_alcool_gasolina.includes('INPM')
                      ? ' °INPM'
                      : ''}
                  </dd>
                </div>
              )}
              <div>
                <dt>Data e hora da foto</dt>
                <dd>
                  {analysis.photo_captured_at
                    ? formatDateTimePtBr(analysis.photo_captured_at)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Coordenadas</dt>
                <dd>
                  {analysis.photo_latitude != null && analysis.photo_longitude != null
                    ? formatCoords(analysis.photo_latitude, analysis.photo_longitude)
                    : '—'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="public-posto__muted">Sem dados de análise.</p>
          )}
        </section>
      </div>

      {photoUrl && (
        <div className="public-posto__media">
          <h4>Foto do local</h4>
          <img
            src={photoUrl}
            alt={`Foto ${FUEL_PRODUCT_LABELS[productKey]}`}
            className="public-posto__photo"
          />
        </div>
      )}

      <div className="public-posto__signoff">
        <div>
          <h4>Responsável</h4>
          <p>{author || '—'}</p>
        </div>
        {signatureUrl && (
          <div className="public-posto__signature">
            <h4>Assinatura</h4>
            <img src={signatureUrl} alt={`Assinatura de ${author || 'responsável'}`} />
          </div>
        )}
      </div>
    </article>
  )
}
