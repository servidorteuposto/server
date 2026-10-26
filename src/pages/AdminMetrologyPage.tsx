import { useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../components/regulatory/ConfirmDialog'
import { formatDateTimePtBr } from '../config/fuel-analyses'
import { statusLabel } from '../config/nozzle-metrology'
import {
  deleteAdminMetrologyVerification,
  listAdminMetrologyVerifications,
  type AdminMetrologyVerification,
} from '../lib/admin-ops'
import { formatCnpj } from '../lib/cnpj'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'
import './AdminAccountsPage.css'
import './AdminRaqsPage.css'

export default function AdminMetrologyPage() {
  const [rows, setRows] = useState<AdminMetrologyVerification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [postoFilter, setPostoFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AdminMetrologyVerification | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAdminMetrologyVerifications()
      setRows(data)
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as metrologias.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const postos = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      if (!map.has(row.posto_id)) map.set(row.posto_id, row.posto_nome)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = query.replace(/\D/g, '')

    return rows.filter((row) => {
      if (postoFilter && row.posto_id !== postoFilter) return false
      const day = row.verified_at.slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      if (!q && !digits) return true

      const haystack = [
        row.posto_nome,
        row.employee_full_name,
        statusLabel(row.overall_status),
        formatCnpj(row.posto_cnpj),
        formatDateTimePtBr(row.verified_at),
      ]
        .join(' ')
        .toLowerCase()

      if (q && haystack.includes(q)) return true
      if (digits && row.posto_cnpj.includes(digits)) return true
      return false
    })
  }, [rows, query, postoFilter, dateFrom, dateTo])

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
      const result = await deleteAdminMetrologyVerification(deleteTarget.id)
      setRows((current) => current.filter((row) => row.id !== deleteTarget.id))
      setSuccess(result.message || `Metrologia de ${deleteTarget.posto_nome} excluída.`)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a metrologia.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="settings-page admin-accounts-page admin-raqs-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Metrologias lançadas</h1>
          <p>
            Só o administrador consegue excluir uma verificação metrológica. Filtre pelo posto, CNPJ
            ou data e confira os dados antes de remover.
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
            placeholder="Posto, CNPJ, responsável, resultado..."
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
        {loading
          ? 'Carregando...'
          : `${filtered.length} verificação${filtered.length === 1 ? '' : 'ões'}`}
      </p>

      {error && <p className="reg-doc-form__error reg-docs-page__banner">{error}</p>}
      {success && <p className="settings-success">{success}</p>}

      {loading ? (
        <p className="admin-accounts-empty">Carregando metrologias lançadas...</p>
      ) : filtered.length === 0 ? (
        <p className="admin-accounts-empty">Nenhuma metrologia encontrada com esse filtro.</p>
      ) : (
        <div className="admin-accounts-list">
          {filtered.map((row) => (
            <article key={row.id} className="admin-accounts-card">
              <div className="admin-accounts-card__main">
                <div className="admin-accounts-card__title">
                  <h3>{row.posto_nome}</h3>
                  {row.overall_status === 'reprovado' ? (
                    <span className="admin-accounts-badge admin-accounts-badge--expired">
                      {statusLabel(row.overall_status)}
                    </span>
                  ) : (
                    <span className="admin-accounts-badge admin-accounts-badge--active">
                      {statusLabel(row.overall_status)}
                    </span>
                  )}
                </div>
                <dl className="admin-accounts-card__meta">
                  <div>
                    <dt>CNPJ</dt>
                    <dd>{formatCnpj(row.posto_cnpj)}</dd>
                  </div>
                  <div>
                    <dt>Lançada em</dt>
                    <dd>{formatDateTimePtBr(row.verified_at)}</dd>
                  </div>
                  <div>
                    <dt>Responsável</dt>
                    <dd>{row.employee_full_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Bicos</dt>
                    <dd>
                      {row.nozzle_count} bico{row.nozzle_count === 1 ? '' : 's'}
                    </dd>
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
                    setDeleteTarget(row)
                  }}
                >
                  Excluir metrologia
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir metrologia"
        message={
          deleteTarget
            ? `Excluir a verificação de ${deleteTarget.posto_nome} (CNPJ ${formatCnpj(deleteTarget.posto_cnpj)}), lançada em ${formatDateTimePtBr(deleteTarget.verified_at)}? Essa ação não pode ser desfeita.`
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
