import { useEffect, useMemo, useState } from 'react'
import {
  FUEL_PRODUCT_LABELS,
  formatCnpj,
  formatCoords,
  formatCpf,
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
import './PublicPostoPage.css'

type PublicPostoPageProps = {
  slug: string
}

export default function PublicPostoPage({ slug }: PublicPostoPageProps) {
  const [board, setBoard] = useState<PublicPostoBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [productFilter, setProductFilter] = useState<FuelProductKey | 'all'>('all')

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

  const filteredRaq = useMemo(() => {
    if (!board) return []
    if (productFilter === 'all') return board.raq_items
    return board.raq_items.filter((item) => item.product_key === productFilter)
  }, [board, productFilter])

  const filteredAnalysis = useMemo(() => {
    if (!board) return []
    if (productFilter === 'all') return board.analysis_items
    return board.analysis_items.filter((item) => item.product_key === productFilter)
  }, [board, productFilter])

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

  return (
    <div className="public-posto">
      <div className="public-posto__glow" aria-hidden="true" />

      <div className="public-posto__shell">
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
              Atualização em tempo real · cada combustível mostra o último RAQ daquele produto
            </p>
          </div>
        </header>

        {error && <p className="public-posto__error">{error}</p>}

        <section className="public-posto__section">
          <div className="public-posto__section-head">
            <div>
              <h2>Análises de Combustíveis</h2>
              <p>Registro das Análises da Qualidade (RAQ)</p>
            </div>
            {board.report && (
              <p className="public-posto__stamp">
                {formatDateTimePtBr(board.report.submitted_at)}
              </p>
            )}
          </div>

          {!board.report || (board.raq_items.length === 0 && board.analysis_items.length === 0) ? (
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

              <h3>Recebimento</h3>
              <div className="public-posto__grid">
                {filteredRaq.map((item) => (
                  <article key={item.id} className="public-posto__item">
                    <h4>{FUEL_PRODUCT_LABELS[item.product_key]}</h4>
                    <dl>
                      <div>
                        <dt>Volume</dt>
                        <dd>{item.volume_received_liters ?? '—'} L</dd>
                      </div>
                      <div>
                        <dt>Coleta</dt>
                        <dd>
                          {item.collection_date ? formatDatePtBr(item.collection_date) : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Transportador</dt>
                        <dd>{item.transporter_name ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Nota fiscal</dt>
                        <dd>{item.invoice_number ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Placa / motorista</dt>
                        <dd>
                          {item.truck_plate ?? '—'} · {item.driver_name ?? '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Distribuidor</dt>
                        <dd>{item.distributor_name ?? '—'}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>

              <h3>Análise do produto</h3>
              <div className="public-posto__grid">
                {filteredAnalysis.map((item) => (
                  <AnalysisPublicCard key={item.id} item={item} />
                ))}
              </div>

              <p className="public-posto__author">
                Responsável: {board.report.author_full_name} · CPF{' '}
                {formatCpf(board.report.author_cpf)}
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function AnalysisPublicCard({
  item,
}: {
  item: PublicPostoBoard['analysis_items'][number]
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!item.photo_storage_path) return
    getPublicFuelFileUrl(item.photo_storage_path)
      .then((url) => {
        if (active) setPhotoUrl(url)
      })
      .catch(() => {
        if (active) setPhotoUrl(null)
      })
    return () => {
      active = false
    }
  }, [item.photo_storage_path])

  return (
    <article className="public-posto__item">
      <header className="public-posto__item-head">
        <h4>{FUEL_PRODUCT_LABELS[item.product_key]}</h4>
        {item.densidade_status && (
          <span className={`fuel-density__badge fuel-density__badge--${item.densidade_status}`}>
            {DENSITY_CONFORMITY_LABELS[item.densidade_status]}
          </span>
        )}
      </header>
      <dl>
        <div>
          <dt>Aspecto</dt>
          <dd>{item.aspecto ?? '—'}</dd>
        </div>
        <div>
          <dt>Cor</dt>
          <dd>{item.cor ?? '—'}</dd>
        </div>
        <div>
          <dt>Temperatura</dt>
          <dd>{item.temperatura_observada ?? '—'}</dd>
        </div>
        <div>
          <dt>ME observada</dt>
          <dd>{item.massa_especifica_observada ?? '—'}</dd>
        </div>
        <div>
          <dt>ME 20 °C</dt>
          <dd>{item.massa_especifica_convertida ?? '—'}</dd>
        </div>
        {item.teor_alcool_gasolina && (
          <div>
            <dt>
              {item.product_key.startsWith('etanol-')
                ? 'Teor alcoólico (°INPM)'
                : 'Teor de álcool'}
            </dt>
            <dd>
              {item.teor_alcool_gasolina}
              {item.product_key.startsWith('etanol-') && !item.teor_alcool_gasolina.includes('INPM')
                ? ' °INPM'
                : ''}
            </dd>
          </div>
        )}
        <div>
          <dt>Foto</dt>
          <dd>
            {item.photo_captured_at ? formatDateTimePtBr(item.photo_captured_at) : '—'}
            {item.photo_latitude != null && item.photo_longitude != null
              ? ` · ${formatCoords(item.photo_latitude, item.photo_longitude)}`
              : ''}
          </dd>
        </div>
      </dl>
      {photoUrl && (
        <img
          src={photoUrl}
          alt={`Foto ${FUEL_PRODUCT_LABELS[item.product_key]}`}
          className="public-posto__photo"
        />
      )}
    </article>
  )
}
