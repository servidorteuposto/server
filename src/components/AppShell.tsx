import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  getMainMenuItems,
  getMenuItem,
  type MenuId,
} from '../config/menu'
import { formatCoords } from '../config/fuel-analyses'
import { formatCnpj } from '../lib/cnpj'
import { getMyPostoProfile } from '../lib/fuel-analyses'
import { getMyPostoSettings, getPostoPhotoUrl } from '../lib/posto-profile'
import { MenuIcon } from './MenuIcons'
import DieselDrainagesPage from '../pages/DieselDrainagesPage'
import DirectRegisterPage from '../pages/DirectRegisterPage'
import FuelAnalysesPage from '../pages/FuelAnalysesPage'
import MandatoryEquipmentsPage from '../pages/MandatoryEquipmentsPage'
import NozzleMetrologyPage from '../pages/NozzleMetrologyPage'
import ModulePage from '../pages/ModulePage'
import RegulatoryDocumentsPage from '../pages/RegulatoryDocumentsPage'
import SettingsPage from '../pages/SettingsPage'
import AdminAccountsPage from '../pages/AdminAccountsPage'
import AdminManagementPage from '../pages/AdminManagementPage'
import AdminSupportPage from '../pages/AdminSupportPage'
import SupportPage from '../pages/SupportPage'
import WorkSafetyPage from '../pages/WorkSafetyPage'
import { endImpersonateMode, getImpersonateLabel, isImpersonating } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { getRenewalNoticeKind } from '../lib/payment'
import type { SubscriptionStatus } from '../lib/subscription'
import './AppShell.css'

const DRAWER_MQ = '(max-width: 960px)'

type AppShellProps = {
  user: User
  isReadOnly: boolean
  isAdmin: boolean
  subscriptionStatus: SubscriptionStatus | null
  subscriptionEndsAt: string | null
  billingMode: 'one_time' | 'recurring' | null
  daysLeft: number | null
}

type HomePostoInfo = {
  nome: string | null
  cnpj: string | null
  latitude: number | null
  longitude: number | null
  photoUrl: string | null
}

function useDrawerLayout() {
  const [isDrawer, setIsDrawer] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DRAWER_MQ).matches : true,
  )

  useEffect(() => {
    const media = window.matchMedia(DRAWER_MQ)
    const onChange = () => setIsDrawer(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return isDrawer
}

function HomePostoFooter({ info }: { info: HomePostoInfo }) {
  const coords =
    info.latitude != null && info.longitude != null
      ? formatCoords(info.latitude, info.longitude)
      : 'Não informadas'

  return (
    <footer className="home-chooser__status" aria-live="polite">
      <div className="home-chooser__status-item">
        <span className="home-chooser__status-label">Razão social</span>
        <strong>{info.nome ?? 'Não informada'}</strong>
      </div>
      <div className="home-chooser__status-item">
        <span className="home-chooser__status-label">CNPJ</span>
        <strong>{info.cnpj ?? 'Não informado'}</strong>
      </div>
      <div className="home-chooser__status-item">
        <span className="home-chooser__status-label">Coordenadas</span>
        <strong>{coords}</strong>
      </div>
    </footer>
  )
}

export default function AppShell({
  isReadOnly,
  isAdmin,
  subscriptionStatus,
  subscriptionEndsAt,
  billingMode,
  daysLeft,
}: AppShellProps) {
  const isDrawerLayout = useDrawerLayout()
  /** null = ainda não escolheu módulo após o login */
  const [activeMenuId, setActiveMenuId] = useState<MenuId | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [postoNome, setPostoNome] = useState<string | null>(null)
  const [postoCnpj, setPostoCnpj] = useState<string | null>(null)
  const [homePosto, setHomePosto] = useState<HomePostoInfo>({
    nome: null,
    cnpj: null,
    latitude: null,
    longitude: null,
    photoUrl: null,
  })

  const renewalNotice = isAdmin
    ? null
    : getRenewalNoticeKind({
        status: subscriptionStatus,
        endsAt: subscriptionEndsAt,
        daysLeft,
      })
  const isRecurring = billingMode === 'recurring'
  const mainMenuItems = getMainMenuItems(isAdmin)
  const activeModule = activeMenuId ? getMenuItem(activeMenuId) : null

  useEffect(() => {
    let cancelled = false

    async function loadHomePosto() {
      try {
        const settings = await getMyPostoSettings()
        if (cancelled) return

        const nome = settings.nome?.trim() || null
        const cnpj = settings.cnpj ? formatCnpj(settings.cnpj) : null
        setPostoNome(nome)
        setPostoCnpj(cnpj)

        let photoUrl: string | null = null
        if (settings.foto_storage_path) {
          try {
            photoUrl = await getPostoPhotoUrl(settings.foto_storage_path)
          } catch {
            photoUrl = null
          }
        }

        if (cancelled) return
        setHomePosto({
          nome,
          cnpj,
          latitude: settings.latitude,
          longitude: settings.longitude,
          photoUrl,
        })
      } catch {
        if (cancelled) return
        try {
          const profile = await getMyPostoProfile()
          if (cancelled) return
          const nome = profile.nome?.trim() || null
          const cnpj = profile.cnpj ? formatCnpj(profile.cnpj) : null
          setPostoNome(nome)
          setPostoCnpj(cnpj)
          setHomePosto({
            nome,
            cnpj,
            latitude: null,
            longitude: null,
            photoUrl: null,
          })
        } catch {
          if (cancelled) return
          setPostoNome(null)
          setPostoCnpj(null)
          setHomePosto({
            nome: null,
            cnpj: null,
            latitude: null,
            longitude: null,
            photoUrl: null,
          })
        }
      }
    }

    void loadHomePosto()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isDrawerLayout && activeMenuId === null) {
      setSidebarOpen(true)
    }
  }, [isDrawerLayout, activeMenuId])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('suporte') !== '1') return

    setActiveMenuId(isAdmin ? 'painel-suporte' : 'suporte')
    setSidebarOpen(false)
    params.delete('suporte')
    const next = params.toString()
    const cleanUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', cleanUrl)
  }, [isAdmin])

  useEffect(() => {
    if (!isDrawerLayout) {
      setSidebarOpen(false)
    }
  }, [isDrawerLayout])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function selectMenu(id: MenuId) {
    setActiveMenuId(id)
    setSidebarOpen(false)
  }

  function goHome() {
    setActiveMenuId(null)
  }

  function renderActivePage() {
    if (!activeMenuId || !activeModule) {
      return (
        <section className="home-chooser">
          <header className="home-chooser__header">
            <h1>Bem-vindo ao Teu Posto</h1>
            <p>
              {isDrawerLayout
                ? 'Abra o menu azul e escolha por onde deseja começar.'
                : 'Escolha no menu ao lado a área em que deseja entrar.'}
            </p>
          </header>
          <div className="home-chooser__logo-wrap">
            <img
              src={homePosto.photoUrl || '/imagens/logo_teuposto.png'}
              alt={homePosto.photoUrl ? 'Foto do posto' : 'Teu Posto'}
              className={
                homePosto.photoUrl
                  ? 'home-chooser__logo home-chooser__logo--photo'
                  : 'home-chooser__logo'
              }
            />
          </div>
          <HomePostoFooter info={homePosto} />
        </section>
      )
    }

    if (activeMenuId === 'documentos-regulatorios') {
      return <RegulatoryDocumentsPage isReadOnly={isReadOnly} />
    }
    if (activeMenuId === 'seguranca-trabalho') {
      return <WorkSafetyPage isReadOnly={isReadOnly} />
    }
    if (activeMenuId === 'analises-combustiveis') {
      return <FuelAnalysesPage isReadOnly={isReadOnly} />
    }
    if (activeMenuId === 'equipamentos-obrigatorios') {
      return <MandatoryEquipmentsPage isReadOnly={isReadOnly} />
    }
    if (activeMenuId === 'verificacao-metrologica-bicos') {
      return <NozzleMetrologyPage isReadOnly={isReadOnly} />
    }
    if (activeMenuId === 'relatorios-drenagens-diesel') {
      return <DieselDrainagesPage isReadOnly={isReadOnly} />
    }
    if (activeMenuId === 'cadastro-direto') {
      return <DirectRegisterPage isReadOnly={isReadOnly} />
    }
    if (activeMenuId === 'suporte' && !isAdmin) {
      return <SupportPage />
    }
    if (activeMenuId === 'painel-suporte' && isAdmin) {
      return <AdminSupportPage />
    }
    if (activeMenuId === 'contas-usuarios' && isAdmin) {
      return <AdminAccountsPage />
    }
    if (activeMenuId === 'gerenciamento' && isAdmin) {
      return <AdminManagementPage />
    }
    if (activeMenuId === 'configuracoes') {
      return <SettingsPage isReadOnly={isReadOnly} />
    }
    return <ModulePage module={activeModule} isReadOnly={isReadOnly} />
  }

  return (
    <div className="app-shell" data-menu-ready={activeMenuId !== null}>
      {isImpersonating() && (
        <div className="impersonate-banner" role="status">
          <span>
            Você está acessando como <strong>{getImpersonateLabel() || 'usuário'}</strong>
          </span>
          <button type="button" className="impersonate-banner__btn" onClick={() => void endImpersonateMode()}>
            Sair desta conta
          </button>
        </div>
      )}
      {isReadOnly && (
        <div className="readonly-banner" role="status">
          Sua assinatura venceu. O sistema está em modo visualização — você pode consultar os dados,
          mas não preencher ou alterar nada até renovar a assinatura. Saia e entre novamente na tela
          de pagamento para renovar.
        </div>
      )}
      {!isReadOnly && renewalNotice === 'day_before' && (
        <div className="renewal-banner renewal-banner--warn" role="status">
          {isRecurring
            ? 'Sua assinatura vence amanhã. A renovação automática do cartão deve ocorrer em breve — confira se o cartão está válido.'
            : 'Sua assinatura vence amanhã. Renove o plano para não perder o acesso completo.'}
        </div>
      )}
      {!isReadOnly && renewalNotice === 'due_day' && (
        <div className="renewal-banner renewal-banner--urgent" role="status">
          {isRecurring
            ? 'Hoje é o dia da renovação automática. Se a cobrança falhar, atualize o cartão no Mercado Pago ou fale com o suporte.'
            : 'Hoje sua assinatura completa 30 dias. Renove o pagamento o quanto antes para manter o acesso.'}
        </div>
      )}

      <div className="app-shell__body">
        <button
          type="button"
          className="app-shell__overlay"
          aria-label="Fechar menu"
          data-visible={isDrawerLayout && sidebarOpen}
          onClick={() => setSidebarOpen(false)}
        />

        <aside
          className="app-sidebar"
          data-open={!isDrawerLayout || sidebarOpen}
          aria-hidden={isDrawerLayout && !sidebarOpen}
        >
          <button
            type="button"
            className="app-sidebar__brand"
            onClick={goHome}
            aria-label="Voltar ao início"
            title="Voltar ao início"
          >
            <img src="/imagens/logo_teuposto.png" alt="Teu Posto" className="app-sidebar__logo" />
          </button>

          <nav className="app-sidebar__nav" aria-label="Menu principal">
            <ul>
              {mainMenuItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="app-sidebar__link"
                    data-active={activeMenuId === item.id}
                    onClick={() => selectMenu(item.id)}
                  >
                    <MenuIcon id={item.id} className="app-sidebar__icon" />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="app-sidebar__footer">
            <div className="app-sidebar__posto">
              <strong className="app-sidebar__razao">
                {postoNome ?? (isAdmin ? 'Administrador' : 'Carregando...')}
              </strong>
              {postoCnpj && <span className="app-sidebar__cnpj">CNPJ {postoCnpj}</span>}
            </div>
            <div className="app-sidebar__footer-links">
              <button type="button" className="app-sidebar__logout" onClick={handleSignOut}>
                Sair
              </button>
            </div>
          </div>
        </aside>

        <div className="app-main">
          {isDrawerLayout && (
            <header className="app-topbar">
              {!sidebarOpen ? (
                <button
                  type="button"
                  className="app-shell__mobile-menu"
                  aria-label="Abrir menu"
                  aria-expanded={sidebarOpen}
                  onClick={() => setSidebarOpen(true)}
                >
                  <span />
                  <span />
                  <span />
                </button>
              ) : (
                <span className="app-topbar__spacer" aria-hidden="true" />
              )}
              <button
                type="button"
                className="app-topbar__brand"
                onClick={goHome}
                aria-label="Voltar ao início"
                title="Voltar ao início"
              >
                <img
                  src="/imagens/logoteuposto2.png"
                  alt="Teu Posto"
                  className="app-topbar__logo"
                />
              </button>
              <span className="app-topbar__spacer" aria-hidden="true" />
            </header>
          )}
          <main className="app-content" data-home={activeMenuId === null}>
            {renderActivePage()}
          </main>
        </div>
      </div>
    </div>
  )
}
