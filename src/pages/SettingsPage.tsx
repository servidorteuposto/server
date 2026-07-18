import { FormEvent, useCallback, useEffect, useState } from 'react'
import { formatCnpj, formatCoords } from '../config/fuel-analyses'
import {
  POSTO_PHOTO_MAX_BYTES,
  fetchAddressByCep,
  formatCep,
  getCurrentPosition,
  isImageFile,
  stripCep,
} from '../config/posto-settings'
import {
  getMyPostoSettings,
  getPostoPhotoUrl,
  updatePostoSettings,
  type PostoSettingsProfile,
} from '../lib/posto-profile'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'

type SettingsPageProps = {
  isReadOnly: boolean
}

export default function SettingsPage({ isReadOnly }: SettingsPageProps) {
  const [profile, setProfile] = useState<PostoSettingsProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)

  const fillFromProfile = useCallback((data: PostoSettingsProfile) => {
    setProfile(data)
    setNome(data.nome)
    setCep(data.cep ? formatCep(data.cep) : '')
    setLogradouro(data.logradouro ?? (data.cep ? '' : data.endereco ?? ''))
    setNumero(data.numero ?? '')
    setComplemento(data.complemento ?? '')
    setBairro(data.bairro ?? '')
    setCidade(data.cidade ?? '')
    setUf(data.uf ?? '')
    setLatitude(data.latitude != null ? String(data.latitude) : '')
    setLongitude(data.longitude != null ? String(data.longitude) : '')
    setPhotoFile(null)
    setRemovePhoto(false)
  }, [])

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const data = await getMyPostoSettings()
      fillFromProfile(data)

      if (data.foto_storage_path) {
        try {
          const url = await getPostoPhotoUrl(data.foto_storage_path)
          setPhotoPreview(url)
        } catch {
          setPhotoPreview(null)
        }
      } else {
        setPhotoPreview(null)
      }
    } catch {
      setPageError('Não foi possível carregar as configurações do posto.')
    } finally {
      setLoading(false)
    }
  }, [fillFromProfile])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  useEffect(() => {
    if (!photoFile) return
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

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
      if (address.complemento) setComplemento(address.complemento)
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

  async function handleUseCurrentLocation() {
    setGeoLoading(true)
    setFormError(null)
    try {
      const position = await getCurrentPosition()
      setLatitude(position.coords.latitude.toFixed(6))
      setLongitude(position.coords.longitude.toFixed(6))
    } catch {
      setFormError(
        'Não foi possível obter a localização. Verifique a permissão do navegador e tente novamente.',
      )
    } finally {
      setGeoLoading(false)
    }
  }

  function handlePhotoChange(file: File | null) {
    setFormError(null)
    if (!file) {
      setPhotoFile(null)
      return
    }
    if (!isImageFile(file)) {
      setFormError('A foto do posto deve ser JPG, PNG ou WebP.')
      return
    }
    if (file.size > POSTO_PHOTO_MAX_BYTES) {
      setFormError('A foto do posto deve ter no máximo 5 MB.')
      return
    }
    setRemovePhoto(false)
    setPhotoFile(file)
  }

  function handleRemovePhoto() {
    setPhotoFile(null)
    setRemovePhoto(true)
    setPhotoPreview(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!profile || isReadOnly) return

    if (!nome.trim()) {
      setFormError('Informe a razão social da empresa.')
      return
    }

    const cepDigits = stripCep(cep)
    if (cepDigits && cepDigits.length !== 8) {
      setFormError('Informe um CEP válido com 8 dígitos.')
      return
    }

    let lat: number | null = null
    let lng: number | null = null
    if (latitude.trim() || longitude.trim()) {
      lat = Number(latitude.replace(',', '.'))
      lng = Number(longitude.replace(',', '.'))
      if (
        Number.isNaN(lat) ||
        Number.isNaN(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        setFormError('Informe coordenadas válidas (latitude e longitude).')
        return
      }
    }

    setBusy(true)
    setFormError(null)
    setSuccessMessage(null)

    try {
      const saved = await updatePostoSettings({
        postoId: profile.id,
        nome,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        latitude: lat,
        longitude: lng,
        photoFile,
        existingPhotoPath: profile.foto_storage_path,
        removePhoto,
      })

      fillFromProfile(saved)
      if (saved.foto_storage_path) {
        const url = await getPostoPhotoUrl(saved.foto_storage_path)
        setPhotoPreview(url)
      } else {
        setPhotoPreview(null)
      }
      setSuccessMessage('Configurações salvas com sucesso.')
    } catch {
      setFormError('Não foi possível salvar as configurações. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando configurações...</p>
  }

  if (pageError && !profile) {
    return <p className="reg-doc-form__error">{pageError}</p>
  }

  if (!profile) return null

  return (
    <section className="settings-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Configurações do Sistema</h1>
          <p>Dados cadastrais do posto, endereço, foto e localização.</p>
        </div>
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      <form className="settings-card" onSubmit={handleSubmit}>
        <section className="settings-section">
          <h2>Empresa</h2>
          <label className="reg-doc-form__field">
            <span>Razão social</span>
            <input
              type="text"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              disabled={isReadOnly || busy}
              required
            />
          </label>
          <label className="reg-doc-form__field">
            <span>CNPJ</span>
            <input type="text" value={formatCnpj(profile.cnpj)} disabled readOnly />
            <small className="settings-hint">O CNPJ não pode ser alterado após o cadastro.</small>
          </label>
        </section>

        <section className="settings-section">
          <h2>Endereço</h2>
          <div className="settings-grid settings-grid--cep">
            <label className="reg-doc-form__field">
              <span>CEP</span>
              <input
                type="text"
                inputMode="numeric"
                value={cep}
                onChange={(event) => handleCepChange(event.target.value)}
                disabled={isReadOnly || busy || cepLoading}
                placeholder="00000-000"
              />
              {cepLoading && <small className="settings-hint">Consultando CEP...</small>}
            </label>
            <label className="reg-doc-form__field">
              <span>UF</span>
              <input
                type="text"
                value={uf}
                onChange={(event) => setUf(event.target.value.toUpperCase().slice(0, 2))}
                disabled={isReadOnly || busy}
                maxLength={2}
                placeholder="UF"
              />
            </label>
          </div>

          <label className="reg-doc-form__field">
            <span>Logradouro</span>
            <input
              type="text"
              value={logradouro}
              onChange={(event) => setLogradouro(event.target.value)}
              disabled={isReadOnly || busy}
              placeholder="Rua, avenida..."
            />
          </label>

          <div className="settings-grid">
            <label className="reg-doc-form__field">
              <span>Número</span>
              <input
                type="text"
                value={numero}
                onChange={(event) => setNumero(event.target.value)}
                disabled={isReadOnly || busy}
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Complemento</span>
              <input
                type="text"
                value={complemento}
                onChange={(event) => setComplemento(event.target.value)}
                disabled={isReadOnly || busy}
              />
            </label>
          </div>

          <div className="settings-grid">
            <label className="reg-doc-form__field">
              <span>Bairro</span>
              <input
                type="text"
                value={bairro}
                onChange={(event) => setBairro(event.target.value)}
                disabled={isReadOnly || busy}
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Cidade</span>
              <input
                type="text"
                value={cidade}
                onChange={(event) => setCidade(event.target.value)}
                disabled={isReadOnly || busy}
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>Foto do posto</h2>
          <div className="settings-photo">
            {photoPreview ? (
              <img src={photoPreview} alt="Foto do posto" className="settings-photo__preview" />
            ) : (
              <div className="settings-photo__empty">Nenhuma foto anexada</div>
            )}
            {!isReadOnly && (
              <div className="settings-photo__actions">
                <label className="btn btn--secondary settings-photo__upload">
                  {photoPreview ? 'Trocar foto' : 'Anexar foto'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    hidden
                    disabled={busy}
                    onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
                  />
                </label>
                {photoPreview && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={handleRemovePhoto}
                    disabled={busy}
                  >
                    Remover
                  </button>
                )}
              </div>
            )}
            <small className="settings-hint">JPG, PNG ou WebP · máx. 5 MB</small>
          </div>
        </section>

        <section className="settings-section">
          <h2>Localização do posto</h2>
          <p className="settings-section__hint">
            Use a localização atual do dispositivo ou informe as coordenadas manualmente.
          </p>
          <div className="settings-grid">
            <label className="reg-doc-form__field">
              <span>Latitude</span>
              <input
                type="text"
                inputMode="decimal"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                disabled={isReadOnly || busy}
                placeholder="-23.550520"
              />
            </label>
            <label className="reg-doc-form__field">
              <span>Longitude</span>
              <input
                type="text"
                inputMode="decimal"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                disabled={isReadOnly || busy}
                placeholder="-46.633308"
              />
            </label>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleUseCurrentLocation}
              disabled={busy || geoLoading}
            >
              {geoLoading ? 'Obtendo localização...' : 'Usar localização atual'}
            </button>
          )}
          {latitude && longitude && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude)) && (
            <p className="settings-coords">
              Coordenadas: {formatCoords(Number(latitude), Number(longitude))}
            </p>
          )}
        </section>

        {formError && <p className="reg-doc-form__error">{formError}</p>}
        {successMessage && <p className="settings-success">{successMessage}</p>}

        {!isReadOnly && (
          <div className="settings-actions">
            <button type="submit" className="btn btn--primary" disabled={busy || cepLoading}>
              {busy ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        )}
      </form>
    </section>
  )
}
