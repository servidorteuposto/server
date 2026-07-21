import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  SUPPORT_CATEGORY_LABELS,
  getSupportAttachmentUrl,
  listSupportTickets,
  type SupportAudience,
  type SupportCategory,
  type SupportTicket,
} from '../lib/support-contact'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'
import './AdminSupportPage.css'

const AUDIENCE_TABS: { id: SupportAudience; label: string }[] = [
  { id: 'sem_cadastro', label: 'Usuários sem cadastro' },
  { id: 'com_cadastro', label: 'Usuários com cadastro' },
]

const CATEGORY_TABS: { id: SupportCategory; label: string }[] = [
  { id: 'reclamacao', label: 'Reclamação' },
  { id: 'duvida', label: 'Dúvida' },
  { id: 'sugestao', label: 'Sugestão' },
]

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!ticket.attachment_paths?.length) {
        setUrls([])
        return
      }

      const signed = await Promise.all(
        ticket.attachment_paths.map((path) => getSupportAttachmentUrl(path)),
      )
      if (!cancelled) {
        setUrls(signed.filter((url): url is string => Boolean(url)))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [ticket.attachment_paths])

  return (
    <article className="admin-support-card">
      <header className="admin-support-card__header">
        <div>
          <h3>{ticket.name}</h3>
          <p>{formatDateTime(ticket.created_at)}</p>
        </div>
        <span className="admin-support-card__badge">{SUPPORT_CATEGORY_LABELS[ticket.category]}</span>
      </header>

      <dl className="admin-support-card__meta">
        <div>
          <dt>E-mail</dt>
          <dd>{ticket.email}</dd>
        </div>
        <div>
          <dt>Telefone</dt>
          <dd>{ticket.phone}</dd>
        </div>
      </dl>

      <p className="admin-support-card__message">{ticket.message}</p>

      {urls.length > 0 && (
        <div className="admin-support-card__photos">
          {urls.map((url, index) => (
            <a key={`${ticket.id}-${index}`} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={`Print ${index + 1} de ${ticket.name}`} />
            </a>
          ))}
        </div>
      )}
    </article>
  )
}

export default function AdminSupportPage() {
  const [audience, setAudience] = useState<SupportAudience>('sem_cadastro')
  const [category, setCategory] = useState<SupportCategory>('reclamacao')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTickets = useCallback(async (nextAudience: SupportAudience) => {
    setLoading(true)
    setError(null)
    try {
      const data = await listSupportTickets(nextAudience)
      setTickets(data)
    } catch (err) {
      setTickets([])
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os chamados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTickets(audience)
  }, [audience, loadTickets])

  const filtered = useMemo(
    () => tickets.filter((ticket) => ticket.category === category),
    [tickets, category],
  )

  const counts = useMemo(() => {
    const base: Record<SupportCategory, number> = {
      reclamacao: 0,
      duvida: 0,
      sugestao: 0,
    }
    for (const ticket of tickets) {
      base[ticket.category] += 1
    }
    return base
  }, [tickets])

  return (
    <section className="settings-page admin-support-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Painel de Suporte</h1>
          <p>Chamados enviados pelo site, separados por cadastro e tipo de solicitação.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void loadTickets(audience)}
          disabled={loading}
        >
          Atualizar
        </button>
      </header>

      <div className="admin-support-tabs" role="tablist" aria-label="Tipo de usuário">
        {AUDIENCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="admin-support-tabs__btn"
            aria-selected={audience === tab.id}
            data-active={audience === tab.id}
            onClick={() => setAudience(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-support-tabs admin-support-tabs--secondary" role="tablist" aria-label="Categoria">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="admin-support-tabs__btn"
            aria-selected={category === tab.id}
            data-active={category === tab.id}
            onClick={() => setCategory(tab.id)}
          >
            {tab.label}
            <span className="admin-support-tabs__count">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      {error && <p className="reg-doc-form__error reg-docs-page__banner">{error}</p>}

      {loading ? (
        <p className="admin-support-empty">Carregando chamados...</p>
      ) : filtered.length === 0 ? (
        <p className="admin-support-empty">Nenhum chamado nesta categoria.</p>
      ) : (
        <div className="admin-support-list">
          {filtered.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </section>
  )
}
