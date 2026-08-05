import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteAdminAccount,
  listAdminAccounts,
  startAdminImpersonation,
  subscriptionStatusLabel,
  unlockAdminAccount,
  type AdminAccount,
} from '../lib/admin-ops'
import { formatCnpj } from '../lib/cnpj'
import { formatDateTimePtBr } from '../config/fuel-analyses'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'
import './AdminAccountsPage.css'

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listAdminAccounts()
      setAccounts(rows)
    } catch (err) {
      setAccounts([])
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as contas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((account) => {
      const haystack = [
        account.nome,
        account.email ?? '',
        account.cnpj,
        account.telefone ?? '',
        account.subscription_status,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [accounts, filter])

  async function handleUnlock(account: AdminAccount) {
    setBusyId(account.id)
    setError(null)
    setSuccess(null)
    try {
      const updated = await unlockAdminAccount(account.id)
      setAccounts((current) => current.map((row) => (row.id === updated.id ? updated : row)))
      setSuccess(`Acesso liberado para ${updated.nome}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao liberar acesso.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleEnter(account: AdminAccount) {
    setBusyId(account.id)
    setError(null)
    setSuccess(null)
    try {
      await startAdminImpersonation(account.id)
      setSuccess(`Abrindo o sistema de ${account.nome} em nova aba...`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar na conta.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(account: AdminAccount) {
    const confirmed = window.confirm(
      `Excluir a conta de "${account.nome}"?\n\nIsso apaga o login e todos os dados do posto (RAQ, drenagens, documentos etc.). Esta ação não pode ser desfeita.`,
    )
    if (!confirmed) return

    const confirmedAgain = window.confirm(
      `Confirma a exclusão definitiva de "${account.nome}" (CNPJ ${formatCnpj(account.cnpj)})?`,
    )
    if (!confirmedAgain) return

    setBusyId(account.id)
    setError(null)
    setSuccess(null)
    try {
      const result = await deleteAdminAccount(account.id)
      setAccounts((current) => current.filter((row) => row.id !== account.id))
      setSuccess(result.message || `Conta de ${account.nome} excluída.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a conta.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="settings-page admin-accounts-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Contas dos usuários</h1>
          <p>
            Liberar acesso sem pagamento, entrar no sistema de qualquer posto e excluir contas
            do sistema.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </header>

      <div className="admin-accounts-toolbar">
        <label className="reg-doc-form__field admin-accounts-search">
          <span>Buscar</span>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Nome, CNPJ, e-mail..."
          />
        </label>
      </div>

      {error && <p className="reg-doc-form__error reg-docs-page__banner">{error}</p>}
      {success && <p className="settings-success">{success}</p>}

      {loading ? (
        <p className="admin-accounts-empty">Carregando contas...</p>
      ) : filtered.length === 0 ? (
        <p className="admin-accounts-empty">Nenhuma conta encontrada.</p>
      ) : (
        <div className="admin-accounts-list">
          {filtered.map((account) => {
            const busy = busyId === account.id
            const unlocked = account.subscription_status === 'active'
            return (
              <article key={account.id} className="admin-accounts-card">
                <div className="admin-accounts-card__main">
                  <div className="admin-accounts-card__title">
                    <h3>{account.nome}</h3>
                    <span
                      className={`admin-accounts-badge admin-accounts-badge--${account.subscription_status}`}
                    >
                      {subscriptionStatusLabel(account.subscription_status)}
                    </span>
                  </div>
                  <dl className="admin-accounts-card__meta">
                    <div>
                      <dt>CNPJ</dt>
                      <dd>{formatCnpj(account.cnpj)}</dd>
                    </div>
                    <div>
                      <dt>E-mail</dt>
                      <dd>{account.email || '—'}</dd>
                    </div>
                    <div>
                      <dt>Telefone</dt>
                      <dd>{account.telefone || '—'}</dd>
                    </div>
                    <div>
                      <dt>Cadastro</dt>
                      <dd>{formatDateTimePtBr(account.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Assinatura até</dt>
                      <dd>
                        {account.subscription_ends_at
                          ? formatDateTimePtBr(account.subscription_ends_at)
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="admin-accounts-card__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={busy || unlocked}
                    onClick={() => void handleUnlock(account)}
                  >
                    {unlocked ? 'Acesso liberado' : busy ? 'Liberando...' : 'Liberar acesso'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || !account.user_id || !account.email}
                    onClick={() => void handleEnter(account)}
                  >
                    {busy ? 'Abrindo...' : 'Entrar no sistema'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={busy}
                    onClick={() => void handleDelete(account)}
                  >
                    {busy ? 'Excluindo...' : 'Excluir conta'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
