import { useCallback, useEffect, useState } from 'react'
import {
  bytesToGb,
  FLOW_LABELS,
  getManagementDashboard,
  listManagementPostos,
  runManagementAlertCheck,
  saveManagementSettings,
  type ManagementDashboard,
  type ManagementPosto,
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
  const [dbGb, setDbGb] = useState('8')
  const [storageGb, setStorageGb] = useState('100')
  const [vercelGb, setVercelGb] = useState('100')

  const [modalFilter, setModalFilter] = useState<PostoFilter | null>(null)
  const [modalRows, setModalRows] = useState<ManagementPosto[]>([])
  const [modalLoading, setModalLoading] = useState(false)

  const applyForm = useCallback((data: ManagementDashboard) => {
    setWhatsapp1(data.settings.alert_whatsapp_1 ?? '')
    setWhatsapp2(data.settings.alert_whatsapp_2 ?? '')
    setDomainExpires(data.settings.domain_expires_on ?? '')
    setDbGb(String(bytesToGb(data.settings.quotas.db_bytes)))
    setStorageGb(String(bytesToGb(data.settings.quotas.storage_bytes)))
    setVercelGb(String(bytesToGb(data.settings.quotas.vercel_bandwidth_bytes)))
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await getManagementDashboard()
      setDashboard(data)
      applyForm(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o painel.')
    } finally {
      setLoading(false)
    }
  }, [applyForm])

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
          db_gb: Number(dbGb) || 8,
          storage_gb: Number(storageGb) || 100,
          vercel_bandwidth_gb: Number(vercelGb) || 100,
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
            <h2>Vercel e acessos</h2>
            <div className="admin-mgmt-grid">
              <div className="admin-mgmt-panel">
                <h3>Hospedagem Vercel</h3>
                <p className="admin-mgmt-muted">{dashboard.vercel.message}</p>
                {dashboard.vercel.configured && dashboard.vercel.project && (
                  <p>
                    Projeto:{' '}
                    <strong>{String(dashboard.vercel.project.name ?? '—')}</strong>
                  </p>
                )}
                {dashboard.vercel.bandwidth_bytes != null ? (
                  <UsageMeter
                    label="Bandwidth (estimado)"
                    percent={dashboard.vercel.bandwidth_percent ?? 0}
                    usedLabel={dashboard.vercel.bandwidth_used_label ?? '—'}
                    quotaLabel={dashboard.vercel.bandwidth_quota_label}
                    nearLimit={dashboard.vercel.bandwidth_near_limit}
                  />
                ) : (
                  <p className="admin-mgmt-muted">
                    Sem dado de bandwidth na API. Configure VERCEL_TOKEN / PROJECT_ID / TEAM_ID nos
                    secrets e ajuste a cota abaixo.
                  </p>
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
                  Cota Bandwidth Vercel (GB)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={vercelGb}
                    onChange={(e) => setVercelGb(e.target.value)}
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
    </section>
  )
}
