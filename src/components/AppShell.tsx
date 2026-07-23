import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  getMainMenuItems,
  getMenuItem,
  getPinnedMenuItems,
  type MenuId,
} from '../config/menu'
import { formatCnpj } from '../lib/cnpj'
import { getMyPostoProfile } from '../lib/fuel-analyses'
import { MenuIcon } from './MenuIcons'
import DieselDrainagesPage from '../pages/DieselDrainagesPage'
import DirectRegisterPage from '../pages/DirectRegisterPage'
import FuelAnalysesPage from '../pages/FuelAnalysesPage'
import ModulePage from '../pages/ModulePage'
import RegulatoryDocumentsPage from '../pages/RegulatoryDocumentsPage'
import SettingsPage from '../pages/SettingsPage'
import AdminSupportPage from '../pages/AdminSupportPage'
import SupportPage from '../pages/SupportPage'
import WorkSafetyPage from '../pages/WorkSafetyPage'
import { supabase } from '../lib/supabase'
import './AppShell.css'

const DRAWER_MQ = '(max-width: 960px)'

type AppShellProps = {
  user: User
  isReadOnly: boolean
  isAdmin: boolean
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

function capitalizePt(value: string) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function HomeStatusFooter() {
  const [now, setNow] = useState(() => new Date())
  const [ip, setIp] = useState<string | null>(null)
  const [ipError, setIpError] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('https://api.ipify.org?format=json')
      .then((response) => {
        if (!response.ok) throw new Error('ip_failed')
        return response.json() as Promise<{ ip: string }>
      })
      .then((data) => {
        if (!cancelled) setIp(data.ip)
      })
      .catch(() => {
        if (!cancelled) setIpError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dateLabel = capitalizePt(
    now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
  )
  const timeLabel = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <footer className="home-chooser__status" aria-live="polite">
      <div className="home-chooser__status-item">
        <span className="home-chooser__status-label">Horário</span>
        <strong>{timeLabel}</strong>
      </div>
      <div className="home-chooser__status-item">
        <span className="home-chooser__status-label">Data</span>
        <strong>{dateLabel}</strong>
      </div>
      <div className="home-chooser__status-item">
        <span className="home-chooser__status-label">IP conectado</span>
        <strong>{ip ?? (ipError ? 'Indisponível' : 'Consultando...')}</strong>
      </div>
    </footer>
  )
}

export default function AppShell({ isReadOnly, isAdmin }: AppShellProps) {
  const isDrawerLayout = useDrawerLayout()
  /** null = ainda não escolheu módulo após o login */
  const [activeMenuId, setActiveMenuId] = useState<MenuId | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [postoNome, setPostoNome] = useState<string | null>(null)
  const [postoCnpj, setPostoCnpj] = useState<string | null>(null)

  const mainMenuItems = getMainMenuItems(isAdmin)
  const pinnedMenuItems = getPinnedMenuItems(isAdmin)
  const activeModule = activeMenuId ? getMenuItem(activeMenuId) : null

  useEffect(() => {
    let cancelled = false
    void getMyPostoProfile()
      .then((profile) => {
        if (cancelled) return
        setPostoNome(profile.nome?.trim() || null)
        setPostoCnpj(profile.cnpj ? formatCnpj(profile.cnpj) : null)
      })
      .catch(() => {
        if (cancelled) return
        setPostoNome(null)
        setPostoCnpj(null)
      })
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
              src="/imagens/logo_teuposto.png"
              alt="Teu Posto"
              className="home-chooser__logo"
            />
          </div>
          <HomeStatusFooter />
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
    if (activeMenuId === 'configuracoes') {
      return <SettingsPage isReadOnly={isReadOnly} />
    }
    return <ModulePage module={activeModule} isReadOnly={isReadOnly} />
  }

  return (
    <div className="app-shell" data-menu-ready={activeMenuId !== null}>
      {isReadOnly && (
        <div className="readonly-banner" role="status">
          Sua assinatura venceu. O sistema está em modo visualização — você pode consultar os dados,
          mas não preencher ou alterar nada até renovar a assinatura.
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

        {isDrawerLayout && !sidebarOpen && (
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
        )}

        <aside
          className="app-sidebar"
          data-open={!isDrawerLayout || sidebarOpen}
          aria-hidden={isDrawerLayout && !sidebarOpen}
        >
          <div className="app-sidebar__brand">
            <img src="/imagens/logo_teuposto.png" alt="Teu Posto" className="app-sidebar__logo" />
          </div>

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

          <div className="app-sidebar__bottom">
            <nav className="app-sidebar__pinned" aria-label="Atalhos">
              <ul>
                {pinnedMenuItems.map((item) => (
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
                <span className="app-sidebar__footer-sep" aria-hidden="true" />
                <button
                  type="button"
                  className="app-sidebar__support"
                  onClick={() => selectMenu(isAdmin ? 'painel-suporte' : 'suporte')}
                >
                  Suporte
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="app-main">
          <main className="app-content" data-home={activeMenuId === null}>
            {renderActivePage()}
          </main>
        </div>
      </div>
    </div>
  )
}
