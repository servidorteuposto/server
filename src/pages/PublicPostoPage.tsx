import { useEffect, useMemo, useState } from 'react'
import {
  formatCnpj,
  formatCoords,
  formatCpf,
  formatDateTimePtBr,
  FUEL_PRODUCT_LABELS,
  type FuelProductKey,
} from '../config/fuel-analyses'
import { formatDatePtBr, getDocumentExpiryStatus, EXPIRY_STATUS_LABELS } from '../config/regulatory-documents'
import {
  fetchPublicPostoBoard,
  getPublicFuelFileUrl,
  getPublicRegulatoryFileUrl,
  uniqueProductsFromBoard,
  type PublicPostoBoard,
  type PublicRegulatoryDocument,
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
  const [openingDocId, setOpeningDocId] = useState<string | null>(null)

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

  async function openDocument(doc: PublicRegulatoryDocument) {
    setOpeningDocId(doc.id)
    try {
      const path = doc.preview_storage_path ?? doc.storage_path
      const url = await getPublicRegulatoryFileUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Não foi possível abrir o documento.')
    } finally {
      setOpeningDocId(null)
    }
  }

  if (loading) {
    return (
      <div className="public-posto">
        <p className="public-posto__status">Carregando informações do posto...</p>
      </div>
    )
  }

  if (error && !board) {
    return (
      <div className="public-posto">
        <p className="public-posto__error">{error}</p>
      </div>
    )
  }

  if (!board) return null

  return (
    <div className="public-posto">
      <header className="public-posto__hero">
        <p className="public-posto__brand">teu posto</p>
        <h1>{board.posto.nome}</h1>
        <p>CNPJ {formatCnpj(board.posto.cnpj)}</p>
        <p>{board.posto.endereco || 'Endereço não informado'}</p>
        <p className="public-posto__live">Dados públicos em tempo real · vale o último lançamento</p>
      </header>

      {error && <p className="public-posto__error">{error}</p>}

      <section className="public-posto__section">
        <div className="public-posto__section-head">
          <h2>Análises de Combustíveis (RAQ)</h2>
          {board.report ? (
            <p>
              Lançado em {formatDateTimePtBr(board.report.submitted_at)} por{' '}
              {board.report.author_full_name}
            </p>
          ) : (
            <p>Nenhum RAQ publicado ainda.</p>
          )}
        </div>

        {board.report && products.length > 0 && (
          <label className="public-posto__filter">
            <span>Filtrar combustível</span>
            <select
              value={productFilter}
              onChange={(event) =>
                setProductFilter(event.target.value as FuelProductKey | 'all')
              }
            >
              <option value="all">Todos os combustíveis</option>
              {products.map((key) => (
                <option key={key} value={key}>
                  {FUEL_PRODUCT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        )}

        {board.report && (
          <>
            <h3>Registro das Análises da Qualidade</h3>
            <div className="public-posto__grid">
              {filteredRaq.map((item) => (
                <article key={item.id} className="public-posto__card">
                  <h4>{FUEL_PRODUCT_LABELS[item.product_key]}</h4>
                  <p>Volume: {item.volume_received_liters ?? '—'} L</p>
                  <p>
                    Coleta:{' '}
                    {item.collection_date ? formatDatePtBr(item.collection_date) : '—'}
                  </p>
                  <p>Transportador: {item.transporter_name ?? '—'}</p>
                  <p>NF: {item.invoice_number ?? '—'}</p>
                  <p>
                    Placa: {item.truck_plate ?? '—'} · Motorista: {item.driver_name ?? '—'}
                  </p>
                  <p>Distribuidor: {item.distributor_name ?? '—'}</p>
                </article>
              ))}
            </div>

            <h3>Análises dos Combustíveis</h3>
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

      <section className="public-posto__section">
        <div className="public-posto__section-head">
          <h2>Documentos públicos</h2>
          <p>Alvarás e certificados disponíveis para consulta.</p>
        </div>

        {!board.documents.length ? (
          <p className="public-posto__empty">Nenhum documento público disponível.</p>
        ) : (
          <div className="public-posto__docs">
            {board.documents.map((doc) => {
              const status = getDocumentExpiryStatus(doc.expires_at)
              return (
                <article key={doc.id} className="public-posto__doc">
                  <div>
                    <h4>{doc.title}</h4>
                    <p>
                      Expedição {formatDatePtBr(doc.issued_at)}
                      {doc.expires_at ? ` · Validade ${formatDatePtBr(doc.expires_at)}` : ''}
                    </p>
                    <span className={`public-posto__badge public-posto__badge--${status}`}>
                      {EXPIRY_STATUS_LABELS[status]}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="public-posto__doc-btn"
                    onClick={() => openDocument(doc)}
                    disabled={openingDocId === doc.id}
                  >
                    {openingDocId === doc.id ? 'Abrindo...' : 'Ver PDF'}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>
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
    <article className="public-posto__card">
      <header className="public-posto__card-head">
        <h4>{FUEL_PRODUCT_LABELS[item.product_key]}</h4>
        {item.densidade_status && (
          <span className={`fuel-density__badge fuel-density__badge--${item.densidade_status}`}>
            {item.densidade_status === 'apto' ? 'Apto' : 'Inapto'}
          </span>
        )}
      </header>
      <p>Aspecto: {item.aspecto ?? '—'}</p>
      <p>Cor: {item.cor ?? '—'}</p>
      <p>Temperatura: {item.temperatura_observada ?? '—'}</p>
      <p>ME observada: {item.massa_especifica_observada ?? '—'}</p>
      <p>ME 20 °C: {item.massa_especifica_convertida ?? '—'}</p>
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
      {photoUrl && (
        <img src={photoUrl} alt={`Foto ${FUEL_PRODUCT_LABELS[item.product_key]}`} className="public-posto__photo" />
      )}
    </article>
  )
}
