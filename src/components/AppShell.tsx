import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { DEFAULT_MENU_ID, MENU_ITEMS, getMenuItem, type MenuId } from '../config/menu'
import { MenuIcon } from './MenuIcons'
import DieselDrainagesPage from '../pages/DieselDrainagesPage'
import FuelAnalysesPage from '../pages/FuelAnalysesPage'
import ModulePage from '../pages/ModulePage'
import RegulatoryDocumentsPage from '../pages/RegulatoryDocumentsPage'
import SettingsPage from '../pages/SettingsPage'
import WorkSafetyPage from '../pages/WorkSafetyPage'
import { supabase } from '../lib/supabase'
import './AppShell.css'

type AppShellProps = {
  user: User
  isReadOnly: boolean
  isAdmin: boolean
}

export default function AppShell({ user, isReadOnly, isAdmin }: AppShellProps) {
  const [activeMenuId, setActiveMenuId] = useState<MenuId>(DEFAULT_MENU_ID)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activeModule = getMenuItem(activeMenuId)

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function selectMenu(id: MenuId) {
    setActiveMenuId(id)
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell">
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
          data-visible={sidebarOpen}
          onClick={() => setSidebarOpen(false)}
        />

        <aside className="app-sidebar" data-open={sidebarOpen}>
          <div className="app-sidebar__brand">
            <img src="/imagens/logo_teuposto.png" alt="Teu Posto" className="app-sidebar__logo" />
          </div>

          <nav className="app-sidebar__nav" aria-label="Menu principal">
            <ul>
              {MENU_ITEMS.map((item) => (
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
            {isAdmin && <span className="app-sidebar__badge">Admin</span>}
            <span className="app-sidebar__email">{user.email}</span>
            <button type="button" className="app-sidebar__logout" onClick={handleSignOut}>
              Sair
            </button>
          </div>
        </aside>

        <div className="app-main">
          <button
            type="button"
            className="app-shell__mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setSidebarOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>

          <main className="app-content">
            {activeMenuId === 'documentos-regulatorios' ? (
              <RegulatoryDocumentsPage isReadOnly={isReadOnly} />
            ) : activeMenuId === 'seguranca-trabalho' ? (
              <WorkSafetyPage isReadOnly={isReadOnly} />
            ) : activeMenuId === 'analises-combustiveis' ? (
              <FuelAnalysesPage isReadOnly={isReadOnly} />
            ) : activeMenuId === 'relatorios-drenagens-diesel' ? (
              <DieselDrainagesPage isReadOnly={isReadOnly} />
            ) : activeMenuId === 'configuracoes' ? (
              <SettingsPage isReadOnly={isReadOnly} />
            ) : (
              <ModulePage module={activeModule} isReadOnly={isReadOnly} />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
