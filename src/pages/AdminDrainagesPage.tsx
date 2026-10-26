import { useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../components/regulatory/ConfirmDialog'
import { formatDateTimePtBr } from '../config/fuel-analyses'
import {
  deleteAdminDrainageReport,
  listAdminDrainageReports,
  type AdminDrainageReport,
} from '../lib/admin-ops'
import { formatCnpj } from '../lib/cnpj'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'
import './AdminAccountsPage.css'
import './AdminRaqsPage.css'

function formatYesNo(value: boolean | null) {
  if (value === true) return 'Sim'
  if (value === false) return 'Não'
  return '—'
}

function formatLiters(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} L`
}

export default function AdminDrainagesPage() {
  const [rows, setRows] = useState<AdminDrainageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [postoFilter, setPostoFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AdminDrainageReport | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAdminDrainageReports()
      setRows(data)
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as drenagens.')
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
      const day = row.drained_at.slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      if (!q && !digits) return true

      const haystack = [
        row.posto_nome,
        row.operator_full_name,
        row.tank_name,
        formatCnpj(row.posto_cnpj),
        formatDateTimePtBr(row.drained_at),
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
      const result = await deleteAdminDrainageReport(deleteTarget.id)
      setRows((current) => current.filter((row) => row.id !== deleteTarget.id))
      setSuccess(result.message || `Drenagem de ${deleteTarget.posto_nome} excluída.`)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a drenagem.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="settings-page admin-accounts-page admin-raqs-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Drenagens lançadas</h1>
          <p>
            Só o administrador consegue excluir uma drenagem. Filtre pelo posto, CNPJ ou data e
            confira os dados antes de remover.
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
            placeholder="Posto, CNPJ, tanque, operador..."
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
        {loading ? 'Carregando...' : `${filtered.length} drenagem${filtered.length === 1 ? '' : 's'}`}
      </p>

      {error && <p className="reg-doc-form__error reg-docs-page__banner">{error}</p>}
      {success && <p className="settings-success">{success}</p>}

      {loading ? (
        <p className="admin-accounts-empty">Carregando drenagens lançadas...</p>
      ) : filtered.length === 0 ? (
        <p className="admin-accounts-empty">Nenhuma drenagem encontrada com esse filtro.</p>
      ) : (
        <div className="admin-accounts-list">
          {filtered.map((row) => (
            <article key={row.id} className="admin-accounts-card">
              <div className="admin-accounts-card__main">
                <div className="admin-accounts-card__title">
                  <h3>{row.posto_nome}</h3>
                  <span className="admin-accounts-badge admin-accounts-badge--active">Drenagem</span>
                </div>
                <dl className="admin-accounts-card__meta">
                  <div>
                    <dt>CNPJ</dt>
                    <dd>{formatCnpj(row.posto_cnpj)}</dd>
                  </div>
                  <div>
                    <dt>Lançada em</dt>
                    <dd>{formatDateTimePtBr(row.drained_at)}</dd>
                  </div>
                  <div>
                    <dt>Tanque</dt>
                    <dd>{row.tank_name}</dd>
                  </div>
                  <div>
                    <dt>Operador</dt>
                    <dd>{row.operator_full_name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Volume</dt>
                    <dd>{formatLiters(row.drained_volume_liters)}</dd>
                  </div>
                  <div>
                    <dt>Água / Impurezas</dt>
                    <dd>
                      {formatYesNo(row.water_present)} / {formatYesNo(row.impurities_present)}
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
                  Excluir drenagem
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir drenagem"
        message={
          deleteTarget
            ? `Excluir a drenagem de ${deleteTarget.posto_nome} (CNPJ ${formatCnpj(deleteTarget.posto_cnpj)}), tanque ${deleteTarget.tank_name}, lançada em ${formatDateTimePtBr(deleteTarget.drained_at)}? Essa ação não pode ser desfeita.`
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
