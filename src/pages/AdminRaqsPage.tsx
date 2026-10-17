import { useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../components/regulatory/ConfirmDialog'
import { FUEL_PRODUCT_LABELS, formatDateTimePtBr, type FuelProductKey } from '../config/fuel-analyses'
import { deleteAdminRaqReport, listAdminRaqReports, type AdminRaqReport } from '../lib/admin-ops'
import { formatCnpj } from '../lib/cnpj'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'
import './AdminAccountsPage.css'
import './AdminRaqsPage.css'

function productLabel(key: string) {
  return FUEL_PRODUCT_LABELS[key as FuelProductKey] ?? key
}

function reportDateKey(value: string) {
  return value.slice(0, 10)
}

export default function AdminRaqsPage() {
  const [reports, setReports] = useState<AdminRaqReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [postoFilter, setPostoFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AdminRaqReport | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listAdminRaqReports()
      setReports(rows)
    } catch (err) {
      setReports([])
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os RAQs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const postos = useMemo(() => {
    const map = new Map<string, string>()
    for (const report of reports) {
      if (!map.has(report.posto_id)) {
        map.set(report.posto_id, report.posto_nome)
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [reports])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = query.replace(/\D/g, '')

    return reports.filter((report) => {
      if (postoFilter && report.posto_id !== postoFilter) return false

      const day = reportDateKey(report.submitted_at)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false

      if (!q && !digits) return true

      const products = report.products.map(productLabel).join(' ')
      const invoices = report.invoice_numbers.join(' ')
      const haystack = [
        report.posto_nome,
        report.razao_social,
        report.author_full_name,
        report.endereco ?? '',
        products,
        invoices,
        formatCnpj(report.posto_cnpj),
        formatCnpj(report.cnpj),
        formatDateTimePtBr(report.submitted_at),
      ]
        .join(' ')
        .toLowerCase()

      if (q && haystack.includes(q)) return true
      if (digits && (report.posto_cnpj.includes(digits) || report.cnpj.includes(digits))) return true
      return Boolean(q) || Boolean(digits) ? false : true
    })
  }, [reports, query, postoFilter, dateFrom, dateTo])

  function clearFilters() {
    setQuery('')
    setPostoFilter('')
    setDateFrom('')
    setDateTo('')
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await deleteAdminRaqReport(deleteTarget.id)
      setReports((current) => current.filter((row) => row.id !== deleteTarget.id))
      setSuccess(result.message || `RAQ de ${deleteTarget.posto_nome} excluído.`)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir o RAQ.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="settings-page admin-accounts-page admin-raqs-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>RAQs lançados</h1>
          <p>
            Só o administrador consegue excluir um RAQ. Filtre pelo posto, CNPJ ou data e confira os
            dados antes de remover.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </header>

      <div className="admin-raqs-toolbar">
        <label className="reg-doc-form__field">
          <span>Buscar</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Posto, CNPJ, combustível, NF, responsável..."
          />
        </label>
        <label className="reg-doc-form__field">
          <span>Posto</span>
          <select value={postoFilter} onChange={(event) => setPostoFilter(event.target.value)}>
            <option value="">Todos os postos</option>
            {postos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label className="reg-doc-form__field">
          <span>De</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="reg-doc-form__field">
          <span>Até</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <button type="button" className="btn btn--secondary admin-raqs-clear" onClick={clearFilters}>
          Limpar filtro
        </button>
      </div>

      <p className="admin-raqs-count">
        {loading ? 'Carregando...' : `${filtered.length} RAQ${filtered.length === 1 ? '' : 's'}`}
      </p>

      {error && <p className="reg-doc-form__error reg-docs-page__banner">{error}</p>}
      {success && <p className="settings-success">{success}</p>}

      {loading ? (
        <p className="admin-accounts-empty">Carregando RAQs lançados...</p>
      ) : filtered.length === 0 ? (
        <p className="admin-accounts-empty">Nenhum RAQ encontrado com esse filtro.</p>
      ) : (
        <div className="admin-accounts-list">
          {filtered.map((report) => (
            <article key={report.id} className="admin-accounts-card">
              <div className="admin-accounts-card__main">
                <div className="admin-accounts-card__title">
                  <h3>{report.posto_nome}</h3>
                  {report.has_inapto ? (
                    <span className="admin-accounts-badge admin-accounts-badge--expired">Fora de spec</span>
                  ) : (
                    <span className="admin-accounts-badge admin-accounts-badge--active">RAQ</span>
                  )}
                </div>
                <dl className="admin-accounts-card__meta">
                  <div>
                    <dt>CNPJ</dt>
                    <dd>{formatCnpj(report.posto_cnpj || report.cnpj)}</dd>
                  </div>
                  <div>
                    <dt>Lançado em</dt>
                    <dd>{formatDateTimePtBr(report.submitted_at)}</dd>
                  </div>
                  <div>
                    <dt>Responsável</dt>
                    <dd>{report.author_full_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Razão social no RAQ</dt>
                    <dd>{report.razao_social || '—'}</dd>
                  </div>
                  <div>
                    <dt>Combustíveis</dt>
                    <dd>
                      {report.products.length
                        ? report.products.map(productLabel).join(' · ')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Nota fiscal</dt>
                    <dd>{report.invoice_numbers.join(' · ') || '—'}</dd>
                  </div>
                </dl>
              </div>
              <div className="admin-accounts-card__actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setError(null)
                    setSuccess(null)
                    setDeleteTarget(report)
                  }}
                >
                  Excluir RAQ
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir RAQ"
        message={
          deleteTarget
            ? `Excluir o RAQ de ${deleteTarget.posto_nome} (CNPJ ${formatCnpj(deleteTarget.posto_cnpj || deleteTarget.cnpj)}), lançado em ${formatDateTimePtBr(deleteTarget.submitted_at)}? Essa ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        busyLabel="Excluindo..."
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null)
        }}
      />
    </section>
  )
}
