import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { formatCnpj, isValidCnpj } from '../config/fuel-analyses'
import { PARTNER_TYPE_LABELS, type PartnerType } from '../config/partners'
import ConfirmDialog from '../components/regulatory/ConfirmDialog'
import {
  deletePartner,
  getMyPostoId,
  listPartners,
  partnerTypeListLabel,
  savePartner,
  type PostoPartner,
} from '../lib/partners'
import '../pages/RegulatoryDocumentsPage.css'
import './DirectRegisterPage.css'

type DirectRegisterPageProps = {
  isReadOnly: boolean
}

export default function DirectRegisterPage({ isReadOnly }: DirectRegisterPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [partners, setPartners] = useState<PostoPartner[]>([])
  const [tab, setTab] = useState<PartnerType>('transporter')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PostoPartner | null>(null)

  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [motorista, setMotorista] = useState('')
  const [placa, setPlaca] = useState('')

  const filteredPartners = useMemo(
    () => partners.filter((partner) => partner.partner_type === tab),
    [partners, tab],
  )

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const rows = await listPartners(id)
      setPartners(rows)
    } catch {
      setPageError('Não foi possível carregar o Cadastro Direto.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  function resetForm() {
    setEditingId(null)
    setRazaoSocial('')
    setCnpj('')
    setMotorista('')
    setPlaca('')
    setFormError(null)
  }

  function startEdit(partner: PostoPartner) {
    setTab(partner.partner_type)
    setEditingId(partner.id)
    setRazaoSocial(partner.razao_social)
    setCnpj(formatCnpj(partner.cnpj))
    setMotorista(partner.motorista ?? '')
    setPlaca(partner.placa ?? '')
    setFormError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!postoId || isReadOnly) return

    if (!razaoSocial.trim()) {
      setFormError('Informe a razão social.')
      return
    }
    if (!isValidCnpj(cnpj)) {
      setFormError('Informe um CNPJ válido.')
      return
    }

    setBusy(true)
    setFormError(null)

    try {
      const saved = await savePartner({
        postoId,
        partnerType: tab,
        razaoSocial,
        cnpj,
        motorista: tab === 'transporter' ? motorista : undefined,
        placa: tab === 'transporter' ? placa : undefined,
        existingId: editingId ?? undefined,
      })

      setPartners((current) => {
        const without = current.filter((item) => item.id !== saved.id)
        return [...without, saved].sort((a, b) =>
          a.razao_social.localeCompare(b.razao_social, 'pt-BR'),
        )
      })
      resetForm()
    } catch {
      setFormError('Não foi possível salvar. Verifique se o CNPJ já está cadastrado neste tipo.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || isReadOnly) return
    setBusy(true)
    try {
      await deletePartner(deleteTarget.id)
      setPartners((current) => current.filter((item) => item.id !== deleteTarget.id))
      if (editingId === deleteTarget.id) resetForm()
      setDeleteTarget(null)
    } catch {
      setPageError('Não foi possível remover o cadastro.')
      setDeleteTarget(null)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando Cadastro Direto...</p>
  }

  return (
    <section className="direct-register-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Cadastro Direto</h1>
          <p>
            Cadastre transportadores e distribuidores para agilizar o lançamento do RAQ com
            sugestões automáticas.
          </p>
        </div>
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      <div className="direct-register-tabs">
        {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((type) => (
          <button
            key={type}
            type="button"
            className="direct-register-tabs__btn"
            data-active={tab === type}
            onClick={() => {
              setTab(type)
              resetForm()
            }}
          >
            {PARTNER_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {!isReadOnly && (
        <form className="direct-register-card" onSubmit={handleSubmit}>
          <h2>
            {editingId
              ? `Editar ${PARTNER_TYPE_LABELS[tab].toLowerCase()}`
              : `Novo ${PARTNER_TYPE_LABELS[tab].toLowerCase()}`}
          </h2>

          <div className="direct-register-grid">
            <label className="reg-doc-form__field">
              <span>Razão social *</span>
              <input
                type="text"
                value={razaoSocial}
                onChange={(event) => setRazaoSocial(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label className="reg-doc-form__field">
              <span>CNPJ *</span>
              <input
                type="text"
                inputMode="numeric"
                value={cnpj}
                onChange={(event) => setCnpj(formatCnpj(event.target.value))}
                disabled={busy}
                required
                placeholder="00.000.000/0000-00"
              />
            </label>
            {tab === 'transporter' && (
              <>
                <label className="reg-doc-form__field">
                  <span>Nome do motorista</span>
                  <input
                    type="text"
                    value={motorista}
                    onChange={(event) => setMotorista(event.target.value)}
                    disabled={busy}
                    placeholder="Opcional"
                  />
                </label>
                <label className="reg-doc-form__field">
                  <span>Placa do caminhão</span>
                  <input
                    type="text"
                    value={placa}
                    onChange={(event) => setPlaca(event.target.value.toUpperCase())}
                    disabled={busy}
                    placeholder="Opcional"
                  />
                </label>
              </>
            )}
          </div>

          {formError && <p className="reg-doc-form__error">{formError}</p>}

          <div className="reg-doc-card__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Salvando...' : editingId ? 'Salvar alteração' : 'Cadastrar'}
            </button>
            {editingId && (
              <button type="button" className="btn btn--secondary" onClick={resetForm} disabled={busy}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      )}

      <section className="direct-register-card">
        <h2>{partnerTypeListLabel(tab)} cadastrados</h2>
        {!filteredPartners.length ? (
          <p className="reg-doc-card__empty">Nenhum cadastro ainda.</p>
        ) : (
          <div className="direct-register-list">
            {filteredPartners.map((partner) => (
              <article key={partner.id} className="direct-register-list__item">
                <div>
                  <h3>{partner.razao_social}</h3>
                  <p>CNPJ {formatCnpj(partner.cnpj)}</p>
                  {partner.partner_type === 'transporter' && partner.motorista && (
                    <p>Motorista: {partner.motorista}</p>
                  )}
                  {partner.partner_type === 'transporter' && partner.placa && (
                    <p>Placa: {partner.placa}</p>
                  )}
                </div>
                {!isReadOnly && (
                  <div className="direct-register-list__actions">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => startEdit(partner)}
                      disabled={busy}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => setDeleteTarget(partner)}
                      disabled={busy}
                    >
                      Remover
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remover cadastro"
        message={
          deleteTarget
            ? `Deseja remover "${deleteTarget.razao_social}"? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Remover"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
