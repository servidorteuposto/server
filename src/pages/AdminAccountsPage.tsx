import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../components/regulatory/ConfirmDialog'
import {
  deleteAdminAccount,
  listAdminAccounts,
  pauseAdminAccount,
  setAdminAccountPassword,
  startAdminImpersonation,
  subscriptionStatusLabel,
  unlockAdminAccount,
  type AdminAccount,
} from '../lib/admin-ops'
import { formatCnpj } from '../lib/cnpj'
import { formatDateTimePtBr } from '../config/fuel-analyses'
import { isValidPassword, PASSWORD_RULE_MESSAGE } from '../lib/password'
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
  const [passwordTarget, setPasswordTarget] = useState<AdminAccount | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pauseTarget, setPauseTarget] = useState<AdminAccount | null>(null)
  const [pausing, setPausing] = useState(false)

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

  function closePasswordModal() {
    if (savingPassword) return
    setPasswordTarget(null)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
  }

  function openPasswordModal(account: AdminAccount) {
    setError(null)
    setSuccess(null)
    setPasswordTarget(account)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
  }

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

  async function confirmPauseAccount() {
    if (!pauseTarget || pausing) return

    setPausing(true)
    setBusyId(pauseTarget.id)
    setError(null)
    setSuccess(null)

    try {
      const updated = await pauseAdminAccount(pauseTarget.id)
      setAccounts((current) => current.map((row) => (row.id === updated.id ? updated : row)))
      setSuccess(`Acesso pausado para ${updated.nome}. A conta permanece inativa até a renovação.`)
      setPauseTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao pausar acesso.')
    } finally {
      setPausing(false)
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

  function openDeleteModal(account: AdminAccount) {
    setError(null)
    setSuccess(null)
    setDeleteTarget(account)
  }

  function closeDeleteModal() {
    if (deleting) return
    setDeleteTarget(null)
  }

  async function confirmDeleteAccount() {
    if (!deleteTarget || deleting) return

    setDeleting(true)
    setBusyId(deleteTarget.id)
    setError(null)
    setSuccess(null)

    try {
      const result = await deleteAdminAccount(deleteTarget.id)
      setAccounts((current) => current.filter((row) => row.id !== deleteTarget.id))
      setSuccess(result.message || `Conta de ${deleteTarget.nome} excluída.`)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a conta.')
    } finally {
      setDeleting(false)
      setBusyId(null)
    }
  }

  async function handleSetPassword(event: FormEvent) {
    event.preventDefault()
    if (!passwordTarget) return

    if (!isValidPassword(newPassword)) {
      setPasswordError(PASSWORD_RULE_MESSAGE)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }

    setSavingPassword(true)
    setPasswordError(null)
    setError(null)
    setSuccess(null)

    try {
      const result = await setAdminAccountPassword(passwordTarget.id, newPassword)
      setSuccess(result.message || `Senha de ${passwordTarget.nome} alterada.`)
      setPasswordTarget(null)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Falha ao alterar a senha.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <section className="settings-page admin-accounts-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Contas dos usuários</h1>
          <p>
            Liberar ou pausar acesso, entrar no sistema, alterar senha e excluir contas dos postos.
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
                  {unlocked ? (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={busy}
                      onClick={() => {
                        setError(null)
                        setSuccess(null)
                        setPauseTarget(account)
                      }}
                    >
                      {busy ? 'Pausando...' : 'Pausar acesso'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={busy}
                      onClick={() => void handleUnlock(account)}
                    >
                      {busy ? 'Liberando...' : 'Liberar acesso'}
                    </button>
                  )}
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
                    className="btn btn--secondary"
                    disabled={busy || !account.user_id}
                    onClick={() => openPasswordModal(account)}
                  >
                    Alterar senha
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={busy}
                    onClick={() => openDeleteModal(account)}
                  >
                    Excluir conta
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pauseTarget)}
        title="Pausar acesso"
        message={
          pauseTarget
            ? `Pausar o acesso de "${pauseTarget.nome}" (CNPJ ${formatCnpj(pauseTarget.cnpj)})?\n\nNada é excluído. A conta fica inativa: o posto vê que o prazo venceu e precisa renovar o plano. Um aviso será enviado no WhatsApp.`
            : ''
        }
        confirmLabel="Pausar acesso"
        busyLabel="Pausando..."
        busy={pausing}
        onConfirm={() => void confirmPauseAccount()}
        onCancel={() => {
          if (!pausing) setPauseTarget(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir conta"
        message={
          deleteTarget
            ? `Excluir "${deleteTarget.nome}" (CNPJ ${formatCnpj(deleteTarget.cnpj)})?\n\nIsso apaga o login e todos os dados do posto (RAQ, drenagens, documentos etc.). Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir definitivamente"
        busyLabel="Excluindo..."
        busy={deleting}
        onConfirm={() => void confirmDeleteAccount()}
        onCancel={closeDeleteModal}
      />

      {passwordTarget && (
        <div className="reg-doc-modal" role="presentation" onClick={closePasswordModal}>
          <div
            className="reg-doc-modal__dialog admin-accounts-password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-set-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="reg-doc-modal__header">
              <h2 id="admin-set-password-title">Alterar senha</h2>
              <button
                type="button"
                className="reg-doc-modal__close"
                onClick={closePasswordModal}
                aria-label="Fechar"
                disabled={savingPassword}
              >
                ×
              </button>
            </header>

            <p className="admin-accounts-password-modal__hint">
              Defina uma nova senha para <strong>{passwordTarget.nome}</strong>
              {passwordTarget.email ? ` (${passwordTarget.email})` : ''}.
            </p>

            <form className="admin-accounts-password-modal__form" onSubmit={handleSetPassword}>
              <label className="reg-doc-form__field">
                <span>Nova senha</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={savingPassword}
                  required
                />
              </label>
              <label className="reg-doc-form__field">
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={savingPassword}
                  required
                />
              </label>
              <p className="admin-accounts-password-modal__rule">{PASSWORD_RULE_MESSAGE}</p>
              {passwordError && <p className="reg-doc-form__error">{passwordError}</p>}
              <div className="reg-doc-modal__actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={closePasswordModal}
                  disabled={savingPassword}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={savingPassword}>
                  {savingPassword ? 'Salvando...' : 'Salvar senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
