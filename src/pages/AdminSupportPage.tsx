import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  deleteSupportTicket,
  getSupportAttachmentUrl,
  listSupportTickets,
  replySupportTicket,
  updateSupportTicketStatus,
  type SupportAudience,
  type SupportCategory,
  type SupportTicket,
  type SupportTicketStatus,
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

const STATUS_FILTERS: { id: SupportTicketStatus | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'aberta', label: 'Abertas' },
  { id: 'em_andamento', label: 'Em andamento' },
  { id: 'respondida', label: 'Respondidas' },
]

const STATUS_ACTIONS: SupportTicketStatus[] = ['aberta', 'em_andamento', 'respondida']

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

function TicketCard({
  ticket,
  onUpdated,
  onDeleted,
}: {
  ticket: SupportTicket
  onUpdated: (ticket: SupportTicket) => void
  onDeleted: (ticketId: string) => void
}) {
  const [urls, setUrls] = useState<string[]>([])
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)

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

  async function handleStatus(status: SupportTicketStatus) {
    if (busy || ticket.status === status) return
    setBusy(true)
    setActionError(null)
    setActionOk(null)
    try {
      const updated = await updateSupportTicketStatus(ticket.id, status)
      onUpdated(updated)
      setActionOk(`Status: ${SUPPORT_STATUS_LABELS[status]}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar status.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy) return
    const confirmed = window.confirm(
      `Excluir o chamado de ${ticket.name}? Essa ação não pode ser desfeita.`,
    )
    if (!confirmed) return

    setBusy(true)
    setActionError(null)
    setActionOk(null)
    try {
      await deleteSupportTicket(ticket.id)
      onDeleted(ticket.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao excluir.')
      setBusy(false)
    }
  }

  async function handleReply(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setActionError(null)
    setActionOk(null)
    try {
      const updated = await replySupportTicket(ticket.id, reply)
      onUpdated(updated)
      setReply('')
      setActionOk('Resposta enviada por e-mail (suporte@appteuposto.com.br).')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao enviar resposta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="admin-support-card" data-status={ticket.status}>
      <header className="admin-support-card__header">
        <div className="admin-support-card__title">
          <h3>{ticket.name}</h3>
          <span className="admin-support-card__badge">{SUPPORT_CATEGORY_LABELS[ticket.category]}</span>
        </div>
        <div className="admin-support-card__meta-right">
          <span className={`admin-support-card__status admin-support-card__status--${ticket.status}`}>
            {SUPPORT_STATUS_LABELS[ticket.status]}
          </span>
          <time className="admin-support-card__time" dateTime={ticket.created_at}>
            {formatDateTime(ticket.created_at)}
          </time>
        </div>
      </header>

      <p className="admin-support-card__contact">
        <span>{ticket.email}</span>
        <span>{ticket.phone}</span>
      </p>

      <p className="admin-support-card__message">{ticket.message}</p>

      {urls.length > 0 && (
        <div className="admin-support-card__photos">
          {urls.map((url, index) => (
            <a key={`${ticket.id}-${index}`} href={url} target="_blank" rel="noreferrer" title="Abrir anexo">
              <img src={url} alt={`Print ${index + 1} de ${ticket.name}`} />
            </a>
          ))}
        </div>
      )}

      {ticket.admin_reply && (
        <div className="admin-support-card__reply-box">
          <strong>Resposta enviada</strong>
          {ticket.replied_at && (
            <time dateTime={ticket.replied_at}>{formatDateTime(ticket.replied_at)}</time>
          )}
          <p>{ticket.admin_reply}</p>
        </div>
      )}

      <div className="admin-support-card__actions" role="group" aria-label="Status do chamado">
        {STATUS_ACTIONS.map((status) => (
          <button
            key={status}
            type="button"
            className="admin-support-card__action-btn"
            data-active={ticket.status === status}
            disabled={busy}
            onClick={() => void handleStatus(status)}
          >
            {SUPPORT_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <form className="admin-support-card__reply-form" onSubmit={(event) => void handleReply(event)}>
        <label className="admin-support-card__reply-label" htmlFor={`reply-${ticket.id}`}>
          Responder por e-mail
        </label>
        <textarea
          id={`reply-${ticket.id}`}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Digite a resposta que será enviada ao e-mail do usuário…"
          rows={3}
          disabled={busy}
          required
          minLength={5}
          maxLength={5000}
        />
        <div className="admin-support-card__reply-footer">
          <span className="admin-support-card__reply-hint">
            Envio via Resend · respostas vão para suporte@appteuposto.com.br
          </span>
          <div className="admin-support-card__reply-buttons">
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void handleDelete()}>
              Excluir
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy || reply.trim().length < 5}>
              {busy ? 'Enviando…' : 'Enviar resposta'}
            </button>
          </div>
        </div>
      </form>

      {actionError && <p className="admin-support-card__feedback admin-support-card__feedback--error">{actionError}</p>}
      {actionOk && <p className="admin-support-card__feedback admin-support-card__feedback--ok">{actionOk}</p>}
    </article>
  )
}

export default function AdminSupportPage() {
  const [audience, setAudience] = useState<SupportAudience>('sem_cadastro')
  const [category, setCategory] = useState<SupportCategory>('reclamacao')
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'todas'>('todas')
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
    () =>
      tickets.filter((ticket) => {
        if (ticket.category !== category) return false
        if (statusFilter === 'todas') return true
        return ticket.status === statusFilter
      }),
    [tickets, category, statusFilter],
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

  function handleUpdated(updated: SupportTicket) {
    setTickets((current) => current.map((ticket) => (ticket.id === updated.id ? updated : ticket)))
  }

  function handleDeleted(ticketId: string) {
    setTickets((current) => current.filter((ticket) => ticket.id !== ticketId))
  }

  return (
    <section className="settings-page admin-support-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Painel de Suporte</h1>
          <p>Chamados enviados pelo site — responda por e-mail, altere o status ou exclua.</p>
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

      <div className="admin-support-tabs admin-support-tabs--secondary" role="tablist" aria-label="Status">
        {STATUS_FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="admin-support-tabs__btn"
            aria-selected={statusFilter === tab.id}
            data-active={statusFilter === tab.id}
            onClick={() => setStatusFilter(tab.id)}
          >
            {tab.label}
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
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </section>
  )
}
