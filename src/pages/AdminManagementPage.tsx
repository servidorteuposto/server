import { useCallback, useEffect, useState } from 'react'
import {
  bytesToGb,
  deleteSecureFile,
  FLOW_LABELS,
  formatSecureFileSize,
  getManagementDashboard,
  listManagementPostos,
  listSecureFiles,
  runManagementAlertCheck,
  saveManagementSettings,
  unlockSecureFile,
  uploadSecureFile,
  type ManagementDashboard,
  type ManagementPosto,
  type SecureFileMeta,
} from '../lib/admin-management'
import { formatCnpj } from '../lib/cnpj'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'
import './AdminManagementPage.css'

type PostoFilter = 'active' | 'inactive' | 'all'

function UsageMeter({
  label,
  percent,
  usedLabel,
  quotaLabel,
  nearLimit,
}: {
  label: string
  percent: number
  usedLabel: string
  quotaLabel: string
  nearLimit: boolean
}) {
  return (
    <div className={`admin-mgmt-meter${nearLimit ? ' admin-mgmt-meter--warn' : ''}`}>
      <div className="admin-mgmt-meter__head">
        <strong>{label}</strong>
        <span>
          {usedLabel} / {quotaLabel} ({percent}%)
        </span>
      </div>
      <div className="admin-mgmt-meter__track" aria-hidden>
        <div
          className="admin-mgmt-meter__fill"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {nearLimit && (
        <p className="admin-mgmt-meter__warn">Restam ≤10% da cota — alerta WhatsApp habilitado.</p>
      )}
    </div>
  )
}

export default function AdminManagementPage() {
  const [dashboard, setDashboard] = useState<ManagementDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [whatsapp1, setWhatsapp1] = useState('')
  const [whatsapp2, setWhatsapp2] = useState('')
  const [domainExpires, setDomainExpires] = useState('')
  const [dbGb, setDbGb] = useState('0.5')
  const [storageGb, setStorageGb] = useState('1')
  const [resendDaily, setResendDaily] = useState('100')
  const [resendMonthly, setResendMonthly] = useState('3000')

  const [modalFilter, setModalFilter] = useState<PostoFilter | null>(null)
  const [modalRows, setModalRows] = useState<ManagementPosto[]>([])
  const [modalLoading, setModalLoading] = useState(false)

  const [secureFiles, setSecureFiles] = useState<SecureFileMeta[]>([])
  const [secureLoading, setSecureLoading] = useState(false)
  const [secureUploading, setSecureUploading] = useState(false)
  const [secureTitle, setSecureTitle] = useState('')
  const [securePassword, setSecurePassword] = useState('')
  const [securePassword2, setSecurePassword2] = useState('')
  const [secureFile, setSecureFile] = useState<File | null>(null)
  const [unlockTarget, setUnlockTarget] = useState<{
    file: SecureFileMeta
    mode: 'view' | 'download'
  } | null>(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [txtPreview, setTxtPreview] = useState<{ title: string; content: string } | null>(null)

  const applyForm = useCallback((data: ManagementDashboard) => {
    setWhatsapp1(data.settings.alert_whatsapp_1 ?? '')
    setWhatsapp2(data.settings.alert_whatsapp_2 ?? '')
    setDomainExpires(data.settings.domain_expires_on ?? '')
    setDbGb(String(bytesToGb(data.settings.quotas.db_bytes)))
    setStorageGb(String(bytesToGb(data.settings.quotas.storage_bytes)))
    setResendDaily(String(data.settings.quotas.resend_daily ?? 100))
    setResendMonthly(String(data.settings.quotas.resend_monthly ?? 3000))
  }, [])

  const loadSecureFiles = useCallback(async () => {
    setSecureLoading(true)
    try {
      const files = await listSecureFiles()
      setSecureFiles(files)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar documentos seguros.')
    } finally {
      setSecureLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await getManagementDashboard()
      setDashboard(data)
      applyForm(data)
      await loadSecureFiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o painel.')
    } finally {
      setLoading(false)
    }
  }, [applyForm, loadSecureFiles])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 45_000)
    return () => window.clearInterval(timer)
  }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await saveManagementSettings({
        alert_whatsapp_1: whatsapp1,
        alert_whatsapp_2: whatsapp2,
        domain_expires_on: domainExpires,
        quotas_gb: {
          db_gb: Number(dbGb) || 0.5,
          storage_gb: Number(storageGb) || 1,
          resend_daily: Number(resendDaily) || 100,
          resend_monthly: Number(resendMonthly) || 3000,
        },
      })
      setSuccess('Configurações salvas.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAlertCheck() {
    setChecking(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await runManagementAlertCheck()
      const sent = result.sent?.length ? result.sent.join(', ') : 'nenhum'
      setSuccess(`Verificação concluída. Alertas enviados: ${sent}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na verificação.')
    } finally {
      setChecking(false)
    }
  }

  async function openPostos(filter: PostoFilter) {
    setModalFilter(filter)
    setModalLoading(true)
    setModalRows([])
    try {
      const rows = await listManagementPostos(filter)
      setModalRows(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao listar postos.')
      setModalFilter(null)
    } finally {
      setModalLoading(false)
    }
  }

  async function handleSecureUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!secureFile) {
      setError('Selecione um arquivo PDF ou TXT.')
      return
    }
    if (securePassword !== securePassword2) {
      setError('As senhas não coincidem.')
      return
    }
    setSecureUploading(true)
    setError(null)
    setSuccess(null)
    try {
      await uploadSecureFile({
        title: secureTitle.trim() || secureFile.name,
        password: securePassword,
        file: secureFile,
      })
      setSecureTitle('')
      setSecurePassword('')
      setSecurePassword2('')
      setSecureFile(null)
      setSuccess('Arquivo anexado com senha.')
      await loadSecureFiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao anexar arquivo.')
    } finally {
      setSecureUploading(false)
    }
  }

  async function handleUnlockSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unlockTarget) return
    const mode = unlockTarget.mode
    setUnlockBusy(true)
    setError(null)
    try {
      const unlocked = await unlockSecureFile({
        fileId: unlockTarget.file.id,
        password: unlockPassword,
        mode,
      })
      setUnlockTarget(null)
      setUnlockPassword('')

      if (mode === 'download') {
        window.open(unlocked.url, '_blank', 'noopener,noreferrer')
        setSuccess('Download liberado.')
        return
      }

      if (unlocked.mime_type === 'application/pdf') {
        window.open(unlocked.url, '_blank', 'noopener,noreferrer')
        setSuccess('PDF liberado em nova aba.')
        return
      }

      const response = await fetch(unlocked.url)
      const text = await response.text()
      setTxtPreview({ title: unlocked.title, content: text })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível liberar o arquivo.')
    } finally {
      setUnlockBusy(false)
    }
  }

  async function handleDeleteSecure(file: SecureFileMeta) {
    if (!window.confirm(`Excluir “${file.title}”?`)) return
    setError(null)
    try {
      await deleteSecureFile(file.id)
      setSuccess('Arquivo excluído.')
      await loadSecureFiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir.')
    }
  }

  const domainLabel = (() => {
    if (!dashboard?.domain.expires_on) return 'Data não cadastrada'
    const d = dashboard.domain.days_left
    if (d == null) return dashboard.domain.expires_on
    if (d < 0) return `Expirado há ${Math.abs(d)} dia(s)`
    if (d === 0) return 'Expira hoje'
    return `${d} dia(s) restantes`
  })()

  return (
    <section className="reg-docs-page admin-mgmt-page">
      <header className="reg-docs-page__header">
        <div>
          <h1>Gerenciamento</h1>
          <p>
            Monitoramento em tempo real da infraestrutura, domínio e postos. Atualiza a cada 45s.
          </p>
        </div>
        <div className="admin-mgmt-header-actions">
          <button type="button" className="btn btn--secondary" onClick={() => void load()} disabled={loading}>
            Atualizar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleAlertCheck()}
            disabled={checking}
          >
            {checking ? 'Verificando…' : 'Verificar alertas agora'}
          </button>
        </div>
      </header>

      {error && <p className="reg-doc-form__error reg-docs-page__banner">{error}</p>}
      {success && <p className="settings-success">{success}</p>}

      {loading && !dashboard ? (
        <p className="admin-accounts-empty">Carregando painel…</p>
      ) : dashboard ? (
        <>
          <section className="admin-mgmt-section">
            <h2>Postos</h2>
            <div className="admin-mgmt-cards">
              <button
                type="button"
                className="admin-mgmt-stat"
                onClick={() => void openPostos('active')}
              >
                <span className="admin-mgmt-stat__label">Plano ativo</span>
                <strong className="admin-mgmt-stat__value">{dashboard.postos.active}</strong>
              </button>
              <button
                type="button"
                className="admin-mgmt-stat"
                onClick={() => void openPostos('inactive')}
              >
                <span className="admin-mgmt-stat__label">Inativos</span>
                <strong className="admin-mgmt-stat__value">{dashboard.postos.inactive}</strong>
              </button>
              <button type="button" className="admin-mgmt-stat" onClick={() => void openPostos('all')}>
                <span className="admin-mgmt-stat__label">Total cadastrados</span>
                <strong className="admin-mgmt-stat__value">{dashboard.postos.total}</strong>
              </button>
            </div>
          </section>

          <section className="admin-mgmt-section">
            <h2>Supabase</h2>
            <p className="admin-mgmt-hint">
              Fluxo de hoje ({dashboard.supabase.today}) · cotas editáveis abaixo
            </p>
            <UsageMeter
              label="Banco de dados"
              percent={dashboard.supabase.db.percent}
              usedLabel={dashboard.supabase.db.used_label}
              quotaLabel={dashboard.supabase.db.quota_label}
              nearLimit={dashboard.supabase.db.near_limit}
            />
            <UsageMeter
              label="Storage (buckets)"
              percent={dashboard.supabase.storage.percent}
              usedLabel={dashboard.supabase.storage.used_label}
              quotaLabel={dashboard.supabase.storage.quota_label}
              nearLimit={dashboard.supabase.storage.near_limit}
            />

            <div className="admin-mgmt-grid">
              <div className="admin-mgmt-panel">
                <h3>Fluxo do dia</h3>
                <ul className="admin-mgmt-list">
                  {Object.entries(dashboard.supabase.flow_today).map(([key, value]) => (
                    <li key={key}>
                      <span>{FLOW_LABELS[key] ?? key}</span>
                      <strong>{value}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="admin-mgmt-panel">
                <h3>Maiores tabelas</h3>
                <ul className="admin-mgmt-list">
                  {dashboard.supabase.tables.slice(0, 8).map((t) => (
                    <li key={`${t.schema}.${t.name}`}>
                      <span>
                        {t.schema}.{t.name}
                      </span>
                      <strong>
                        {(t.bytes / 1024 ** 2).toFixed(t.bytes > 10 * 1024 ** 2 ? 0 : 1)} MB
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="admin-mgmt-panel">
                <h3>Buckets</h3>
                {dashboard.supabase.storage.buckets.length === 0 ? (
                  <p className="admin-mgmt-muted">Nenhum arquivo no storage.</p>
                ) : (
                  <ul className="admin-mgmt-list">
                    {dashboard.supabase.storage.buckets.map((b) => (
                      <li key={b.bucket}>
                        <span>
                          {b.bucket} · {b.objects} arq.
                        </span>
                        <strong>
                          {(b.bytes / 1024 ** 2).toFixed(b.bytes > 10 * 1024 ** 2 ? 0 : 1)} MB
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="admin-mgmt-section">
            <h2>E-mail (Resend) e acessos</h2>
            <div className="admin-mgmt-grid">
              <div className="admin-mgmt-panel">
                <h3>Resend</h3>
                <p className="admin-mgmt-muted">{dashboard.resend.message}</p>
                {!dashboard.resend.configured ? (
                  <p className="admin-mgmt-muted">
                    O secret RESEND_API_KEY já usado nos e-mails do app também alimenta este painel.
                  </p>
                ) : (
                  <>
                    {dashboard.resend.daily.used != null && (
                      <UsageMeter
                        label="Cota diária de e-mails"
                        percent={dashboard.resend.daily.percent ?? 0}
                        usedLabel={`${dashboard.resend.daily.used} e-mails`}
                        quotaLabel={`${dashboard.resend.daily.quota}/dia`}
                        nearLimit={dashboard.resend.daily.near_limit}
                      />
                    )}
                    {dashboard.resend.monthly.used != null && (
                      <UsageMeter
                        label="Cota mensal de e-mails"
                        percent={dashboard.resend.monthly.percent ?? 0}
                        usedLabel={`${dashboard.resend.monthly.used} e-mails`}
                        quotaLabel={`${dashboard.resend.monthly.quota}/mês`}
                        nearLimit={dashboard.resend.monthly.near_limit}
                      />
                    )}
                    <ul className="admin-mgmt-list">
                      <li>
                        <span>E-mails na lista de hoje (amostra)</span>
                        <strong>{dashboard.resend.emails_today}</strong>
                      </li>
                    </ul>
                    {dashboard.resend.domains.length > 0 && (
                      <>
                        <h3 style={{ marginTop: '1rem' }}>Domínios</h3>
                        <ul className="admin-mgmt-list">
                          {dashboard.resend.domains.map((d) => (
                            <li key={d.name}>
                              <span>{d.name}</span>
                              <strong>{d.status}</strong>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {dashboard.resend.recent.length > 0 && (
                      <>
                        <h3 style={{ marginTop: '1rem' }}>Últimos envios</h3>
                        <ul className="admin-mgmt-list admin-mgmt-list--compact">
                          {dashboard.resend.recent.map((mail) => (
                            <li key={mail.id}>
                              <span>
                                {mail.subject}
                                <small>
                                  {mail.to} · {mail.last_event}
                                </small>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="admin-mgmt-panel">
                <h3>Login e acessos (app)</h3>
                <ul className="admin-mgmt-list">
                  <li>
                    <span>Postos ativos</span>
                    <strong>{dashboard.access.active_postos}</strong>
                  </li>
                  <li>
                    <span>Alertas conta bloqueada hoje</span>
                    <strong>{dashboard.access.security_alerts_today}</strong>
                  </li>
                  <li>
                    <span>Tentativas de cadastro hoje</span>
                    <strong>{dashboard.access.registration_attempts_today}</strong>
                  </li>
                  <li>
                    <span>Chamados hoje</span>
                    <strong>{dashboard.access.support_tickets_today}</strong>
                  </li>
                  <li>
                    <span>Pagamentos MP hoje</span>
                    <strong>{dashboard.access.mp_payments_today}</strong>
                  </li>
                  <li>
                    <span>Lembretes operacionais WhatsApp</span>
                    <strong>{dashboard.access.whatsapp_reminders_today}</strong>
                  </li>
                  <li>
                    <span>Total WhatsApp hoje</span>
                    <strong>{dashboard.access.whatsapp_sends_today}</strong>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="admin-mgmt-section">
            <h2>Domínio</h2>
            <div
              className={`admin-mgmt-domain${
                dashboard.domain.expired || dashboard.domain.warn_2d
                  ? ' admin-mgmt-domain--danger'
                  : dashboard.domain.warn_7d
                    ? ' admin-mgmt-domain--warn'
                    : ''
              }`}
            >
              <div>
                <span className="admin-mgmt-stat__label">Expiração</span>
                <strong>{dashboard.domain.expires_on ?? '—'}</strong>
              </div>
              <div>
                <span className="admin-mgmt-stat__label">Contador</span>
                <strong>{domainLabel}</strong>
              </div>
            </div>
            <p className="admin-mgmt-hint">
              Aviso WhatsApp automático 7 dias antes e novamente com 2 dias ou menos, se não renovar.
            </p>
          </section>

          <section className="admin-mgmt-section">
            <h2>Documentos seguros</h2>
            <p className="admin-mgmt-hint">
              Anexe PDF ou TXT com senha. Só o admin consegue ver ou baixar após digitar a senha.
            </p>
            <form className="admin-mgmt-form admin-mgmt-secure-form" onSubmit={(e) => void handleSecureUpload(e)}>
              <div className="admin-mgmt-form__grid">
                <label>
                  Título
                  <input
                    value={secureTitle}
                    onChange={(e) => setSecureTitle(e.target.value)}
                    placeholder="Ex.: Contrato confidencial"
                  />
                </label>
                <label>
                  Arquivo (PDF ou TXT)
                  <input
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={(e) => setSecureFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label>
                  Senha
                  <input
                    type="password"
                    value={securePassword}
                    onChange={(e) => setSecurePassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Confirmar senha
                  <input
                    type="password"
                    value={securePassword2}
                    onChange={(e) => setSecurePassword2(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <button type="submit" className="btn btn--primary" disabled={secureUploading}>
                {secureUploading ? 'Anexando…' : 'Anexar com senha'}
              </button>
            </form>

            {secureLoading ? (
              <p className="admin-mgmt-muted">Carregando documentos…</p>
            ) : secureFiles.length === 0 ? (
              <p className="admin-mgmt-muted">Nenhum documento seguro ainda.</p>
            ) : (
              <ul className="admin-mgmt-secure-list">
                {secureFiles.map((file) => (
                  <li key={file.id} className="admin-mgmt-secure-card">
                    <div>
                      <h3>{file.title}</h3>
                      <p className="admin-mgmt-muted">
                        {file.original_filename} · {file.mime_type === 'application/pdf' ? 'PDF' : 'TXT'} ·{' '}
                        {formatSecureFileSize(file.size_bytes)} ·{' '}
                        {new Date(file.created_at).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </p>
                    </div>
                    <div className="admin-mgmt-secure-actions">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => {
                          setUnlockPassword('')
                          setUnlockTarget({ file, mode: 'view' })
                        }}
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => {
                          setUnlockPassword('')
                          setUnlockTarget({ file, mode: 'download' })
                        }}
                      >
                        Baixar
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => void handleDeleteSecure(file)}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-mgmt-section">
            <h2>Alertas e cotas</h2>
            <form className="admin-mgmt-form" onSubmit={(e) => void handleSave(e)}>
              <div className="admin-mgmt-form__grid">
                <label>
                  WhatsApp alerta 1
                  <input
                    value={whatsapp1}
                    onChange={(e) => setWhatsapp1(e.target.value)}
                    placeholder="11999999999"
                    inputMode="tel"
                  />
                </label>
                <label>
                  WhatsApp alerta 2
                  <input
                    value={whatsapp2}
                    onChange={(e) => setWhatsapp2(e.target.value)}
                    placeholder="11988888888"
                    inputMode="tel"
                  />
                </label>
                <label>
                  Domínio expira em
                  <input
                    type="date"
                    value={domainExpires}
                    onChange={(e) => setDomainExpires(e.target.value)}
                  />
                </label>
                <label>
                  Cota DB (GB)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={dbGb}
                    onChange={(e) => setDbGb(e.target.value)}
                  />
                </label>
                <label>
                  Cota Storage (GB)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={storageGb}
                    onChange={(e) => setStorageGb(e.target.value)}
                  />
                </label>
                <label>
                  Cota Resend / dia
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={resendDaily}
                    onChange={(e) => setResendDaily(e.target.value)}
                  />
                </label>
                <label>
                  Cota Resend / mês
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={resendMonthly}
                    onChange={(e) => setResendMonthly(e.target.value)}
                  />
                </label>
              </div>
              {dashboard.settings.last_alerts &&
                Object.keys(dashboard.settings.last_alerts).length > 0 && (
                  <p className="admin-mgmt-hint">
                    Últimos alertas:{' '}
                    {Object.entries(dashboard.settings.last_alerts)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(' · ')}
                  </p>
                )}
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar configurações'}
              </button>
            </form>
          </section>

          <p className="admin-mgmt-muted">
            Atualizado em{' '}
            {new Date(dashboard.generated_at).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            })}
          </p>
        </>
      ) : null}

      {modalFilter && (
        <div
          className="admin-mgmt-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalFilter(null)}
        >
          <div className="admin-mgmt-modal__panel" onClick={(e) => e.stopPropagation()}>
            <header className="admin-mgmt-modal__header">
              <h3>
                {modalFilter === 'active'
                  ? 'Postos com plano ativo'
                  : modalFilter === 'inactive'
                    ? 'Postos inativos'
                    : 'Todos os postos'}
              </h3>
              <button type="button" className="btn btn--secondary" onClick={() => setModalFilter(null)}>
                Fechar
              </button>
            </header>
            {modalLoading ? (
              <p className="admin-mgmt-muted">Carregando lista…</p>
            ) : modalRows.length === 0 ? (
              <p className="admin-mgmt-muted">Nenhum posto neste filtro.</p>
            ) : (
              <ul className="admin-mgmt-posto-list">
                {modalRows.map((posto) => (
                  <li key={posto.id} className="admin-mgmt-posto">
                    <h4>{posto.nome}</h4>
                    <p>
                      <strong>CNPJ:</strong> {formatCnpj(posto.cnpj)}
                    </p>
                    <p>
                      <strong>Endereço:</strong> {posto.endereco}
                    </p>
                    <p>
                      <strong>E-mail:</strong> {posto.email || '—'}
                    </p>
                    <p>
                      <strong>Telefone:</strong> {posto.telefone || '—'}
                    </p>
                    <p>
                      <strong>WhatsApps aviso:</strong>{' '}
                      {posto.avisos.length ? posto.avisos.join(', ') : '—'}
                    </p>
                    <p>
                      <strong>Status:</strong> {posto.subscription_status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {unlockTarget && (
        <div
          className="admin-mgmt-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!unlockBusy) {
              setUnlockTarget(null)
              setUnlockPassword('')
            }
          }}
        >
          <div className="admin-mgmt-modal__panel" onClick={(e) => e.stopPropagation()}>
            <header className="admin-mgmt-modal__header">
              <h3>
                {unlockTarget.mode === 'download' ? 'Baixar' : 'Abrir'}: {unlockTarget.file.title}
              </h3>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={unlockBusy}
                onClick={() => {
                  setUnlockTarget(null)
                  setUnlockPassword('')
                }}
              >
                Fechar
              </button>
            </header>
            <form className="admin-mgmt-form" onSubmit={(e) => void handleUnlockSubmit(e)}>
              <label>
                Senha do arquivo
                <input
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  autoFocus
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" className="btn btn--primary" disabled={unlockBusy || !unlockPassword}>
                {unlockBusy ? 'Validando…' : 'Liberar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {txtPreview && (
        <div
          className="admin-mgmt-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setTxtPreview(null)}
        >
          <div className="admin-mgmt-modal__panel admin-mgmt-modal__panel--wide" onClick={(e) => e.stopPropagation()}>
            <header className="admin-mgmt-modal__header">
              <h3>{txtPreview.title}</h3>
              <button type="button" className="btn btn--secondary" onClick={() => setTxtPreview(null)}>
                Fechar
              </button>
            </header>
            <pre className="admin-mgmt-txt-preview">{txtPreview.content}</pre>
          </div>
        </div>
      )}
    </section>
  )
}
