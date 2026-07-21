export type MenuId =
  | 'documentos-regulatorios'
  | 'seguranca-trabalho'
  | 'analises-combustiveis'
  | 'verificacao-metrologica-bicos'
  | 'relatorios-drenagens-diesel'
  | 'suporte'
  | 'painel-suporte'
  | 'configuracoes'

export type MenuItem = {
  id: MenuId
  label: string
  description: string
  adminOnly?: boolean
  hideForAdmin?: boolean
  /** Itens fixos na base da sidebar (sem scroll). */
  pinned?: boolean
}

export const MENU_ITEMS: MenuItem[] = [
  {
    id: 'documentos-regulatorios',
    label: 'Documentos Regulatórios',
    description: 'Gestão de documentos exigidos pela regulação do setor.',
  },
  {
    id: 'seguranca-trabalho',
    label: 'Segurança do Trabalho',
    description: 'Registros e controles de segurança ocupacional do posto.',
  },
  {
    id: 'analises-combustiveis',
    label: 'Análises de Combustíveis',
    description: 'Laudos, amostras e histórico de análises de combustíveis.',
  },
  {
    id: 'verificacao-metrologica-bicos',
    label: 'Verificação Metrológica de Bicos',
    description: 'Controle de verificações metrológicas dos bicos de abastecimento.',
  },
  {
    id: 'relatorios-drenagens-diesel',
    label: 'Relatórios de Drenagens de Tanques de Óleo Diesel',
    description: 'Relatórios e registros de drenagens dos tanques de óleo diesel.',
  },
  {
    id: 'suporte',
    label: 'Suporte',
    description: 'Envie dúvida, sugestão ou reclamação para a equipe do teu posto.',
    hideForAdmin: true,
    pinned: true,
  },
  {
    id: 'painel-suporte',
    label: 'Painel de Suporte',
    description: 'Visualize chamados de usuários com e sem cadastro.',
    adminOnly: true,
    pinned: true,
  },
  {
    id: 'configuracoes',
    label: 'Configurações do Sistema',
    description: 'Preferências, usuários e parâmetros gerais do sistema.',
    pinned: true,
  },
]

export const DEFAULT_MENU_ID: MenuId = 'documentos-regulatorios'

export function getMenuItem(id: MenuId) {
  return MENU_ITEMS.find((item) => item.id === id) ?? MENU_ITEMS[0]
}

export function getVisibleMenuItems(isAdmin: boolean) {
  return MENU_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin
    if (item.hideForAdmin) return !isAdmin
    return true
  })
}

export function getMainMenuItems(isAdmin: boolean) {
  return getVisibleMenuItems(isAdmin).filter((item) => !item.pinned)
}

export function getPinnedMenuItems(isAdmin: boolean) {
  return getVisibleMenuItems(isAdmin).filter((item) => item.pinned)
}
