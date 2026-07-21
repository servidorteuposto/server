import { useEffect, useState } from 'react'
import SupportContactForm from '../components/SupportContactForm'
import { formatCnpj } from '../lib/cnpj'
import { getMyPostoSettings, type PostoSettingsProfile } from '../lib/posto-profile'
import { supabase } from '../lib/supabase'
import '../pages/RegulatoryDocumentsPage.css'
import './SettingsPage.css'
import './SupportPage.css'

export default function SupportPage() {
  const [profile, setProfile] = useState<PostoSettingsProfile | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [{ data: authData }, posto] = await Promise.all([
          supabase.auth.getUser(),
          getMyPostoSettings().catch(() => null),
        ])

        if (cancelled) return

        setUserEmail(authData.user?.email ?? '')
        setProfile(posto)
      } catch {
        if (!cancelled) {
          setLoadError('Não foi possível carregar seus dados. Você ainda pode enviar a mensagem.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="settings-page support-page">
      <header className="reg-docs-page__header settings-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Suporte</h1>
          <p>Envie dúvida, sugestão ou reclamação. Você pode anexar até 3 prints.</p>
        </div>
      </header>

      {loadError && <p className="reg-doc-form__error reg-docs-page__banner">{loadError}</p>}

      <div className="settings-card support-page__card">
        {loading ? (
          <p className="support-page__loading">Carregando...</p>
        ) : (
          <SupportContactForm
            variant="app"
            audience="com_cadastro"
            defaultName={profile?.nome ?? ''}
            defaultEmail={userEmail || profile?.email || ''}
            defaultPhone={profile?.telefone ?? ''}
            defaultCnpj={profile?.cnpj ? formatCnpj(profile.cnpj) : ''}
            postoId={profile?.id ?? null}
          />
        )}
      </div>
    </section>
  )
}
