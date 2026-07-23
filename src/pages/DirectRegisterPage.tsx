import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { formatCnpj, isValidCnpj } from '../config/fuel-analyses'
import { PARTNER_TYPE_LABELS, type PartnerType } from '../config/partners'
import {
  fetchAddressByCep,
  formatCep,
  stripCep,
} from '../config/posto-settings'
import { formatPhone } from '../config/work-safety'
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
  const [cepLoading, setCepLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PostoPartner | null>(null)

  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')

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
    setTelefone('')
    setCep('')
    setLogradouro('')
    setNumero('')
    setBairro('')
    setCidade('')
    setUf('')
    setFormError(null)
  }

  function startEdit(partner: PostoPartner) {
    setTab(partner.partner_type)
    setEditingId(partner.id)
    setRazaoSocial(partner.razao_social)
    setCnpj(formatCnpj(partner.cnpj))
    setTelefone(partner.telefone ? formatPhone(partner.telefone) : '')
    setCep(partner.cep ? formatCep(partner.cep) : '')
    setLogradouro(partner.logradouro ?? '')
    setNumero(partner.numero ?? '')
    setBairro(partner.bairro ?? '')
    setCidade(partner.cidade ?? '')
    setUf(partner.uf ?? '')
    setFormError(null)
  }

  async function lookupCep(value: string) {
    const digits = stripCep(value)
    if (digits.length !== 8) return

    setCepLoading(true)
    setFormError(null)
    try {
      const address = await fetchAddressByCep(digits)
      if (!address) {
        setFormError('CEP não encontrado. Você pode preencher o endereço manualmente.')
        return
      }
      setLogradouro(address.logradouro || '')
      setBairro(address.bairro || '')
      setCidade(address.localidade || '')
      setUf(address.uf || '')
    } catch {
      setFormError('Não foi possível consultar o CEP. Tente novamente ou preencha manualmente.')
    } finally {
      setCepLoading(false)
    }
  }

  function handleCepChange(value: string) {
    const formatted = formatCep(value)
    setCep(formatted)
    if (stripCep(formatted).length === 8) {
      void lookupCep(formatted)
    }
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

    const cepDigits = stripCep(cep)
    if (cepDigits && cepDigits.length !== 8) {
      setFormError('Informe um CEP válido com 8 dígitos.')
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
        telefone,
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        uf,
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
            sugestões automáticas de razão social e CNPJ.
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
                disabled={busy || cepLoading}
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
                disabled={busy || cepLoading}
                required
                placeholder="00.000.000/0000-00"
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Telefone</span>
              <input
                type="tel"
                value={telefone}
                onChange={(event) => setTelefone(formatPhone(event.target.value))}
                disabled={busy || cepLoading}
                placeholder="(00) 00000-0000"
              />
            </label>
            <label className="reg-doc-form__field">
              <span>CEP</span>
              <input
                type="text"
                inputMode="numeric"
                value={cep}
                onChange={(event) => handleCepChange(event.target.value)}
                disabled={busy || cepLoading}
                placeholder="00000-000"
              />
              {cepLoading && <small className="direct-register-hint">Consultando CEP...</small>}
            </label>
            <label className="reg-doc-form__field direct-register-grid__full">
              <span>Logradouro</span>
              <input
                type="text"
                value={logradouro}
                onChange={(event) => setLogradouro(event.target.value)}
                disabled={busy || cepLoading}
                placeholder="Rua, avenida..."
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Número</span>
              <input
                type="text"
                value={numero}
                onChange={(event) => setNumero(event.target.value)}
                disabled={busy || cepLoading}
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Bairro</span>
              <input
                type="text"
                value={bairro}
                onChange={(event) => setBairro(event.target.value)}
                disabled={busy || cepLoading}
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Cidade</span>
              <input
                type="text"
                value={cidade}
                onChange={(event) => setCidade(event.target.value)}
                disabled={busy || cepLoading}
              />
            </label>
            <label className="reg-doc-form__field">
              <span>UF</span>
              <input
                type="text"
                value={uf}
                onChange={(event) => setUf(event.target.value.toUpperCase().slice(0, 2))}
                disabled={busy || cepLoading}
                maxLength={2}
                placeholder="UF"
              />
            </label>
          </div>

          {formError && <p className="reg-doc-form__error">{formError}</p>}

          <div className="reg-doc-card__actions">
            <button type="submit" className="btn btn--primary" disabled={busy || cepLoading}>
              {busy ? 'Salvando...' : editingId ? 'Salvar alteração' : 'Cadastrar'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={resetForm}
                disabled={busy || cepLoading}
              >
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
                  {partner.telefone && <p>Tel. {formatPhone(partner.telefone)}</p>}
                  {partner.endereco && <p>{partner.endereco}</p>}
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
