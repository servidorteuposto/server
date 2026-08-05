export type MenuId =
  | 'documentos-regulatorios'
  | 'seguranca-trabalho'
  | 'analises-combustiveis'
  | 'equipamentos-obrigatorios'
  | 'verificacao-metrologica-bicos'
  | 'relatorios-drenagens-diesel'
  | 'cadastro-direto'
  | 'suporte'
  | 'painel-suporte'
  | 'contas-usuarios'
  | 'gerenciamento'
  | 'configuracoes'

export type MenuItem = {
  id: MenuId
  label: string
  description: string
  adminOnly?: boolean
  hideForAdmin?: boolean
}

export const MENU_ITEMS: MenuItem[] = [
  {
    id: 'documentos-regulatorios',
    label: 'Documentos Regulatórios',
    description: 'Gestão de documentos exigidos pela regulação do setor.',
  },
  {
    id: 'analises-combustiveis',
    label: 'Análises de Combustíveis',
    description: 'Laudos, amostras e histórico de análises de combustíveis.',
  },
  {
    id: 'equipamentos-obrigatorios',
    label: 'Equipamentos Obrigatórios',
    description: 'Cadastro de termômetros, densímetros, balde aferidor e proveta.',
  },
  {
    id: 'verificacao-metrologica-bicos',
    label: 'Verificação Metrológica de Bicos',
    description: 'Controle conforme Portaria 227/2022 — INMETRO.',
  },
  {
    id: 'relatorios-drenagens-diesel',
    label: 'Drenagens de Tanques de Diesel',
    description: 'Relatórios e registros de drenagens dos tanques de óleo diesel.',
  },
  {
    id: 'seguranca-trabalho',
    label: 'Segurança do Trabalho',
    description: 'Registros e controles de segurança ocupacional do posto.',
  },
  {
    id: 'cadastro-direto',
    label: 'Cadastro Direto',
    description: 'Cadastro de transportadores e distribuidores para agilizar o RAQ.',
  },
  {
    id: 'configuracoes',
    label: 'Configurações do Sistema',
    description: 'Preferências, usuários e parâmetros gerais do sistema.',
  },
  {
    id: 'painel-suporte',
    label: 'Painel de Suporte',
    description: 'Visualize chamados de usuários com e sem cadastro.',
    adminOnly: true,
  },
  {
    id: 'contas-usuarios',
    label: 'Contas dos Usuários',
    description: 'Liberar acesso e entrar no sistema de cada posto.',
    adminOnly: true,
  },
  {
    id: 'gerenciamento',
    label: 'Gerenciamento',
    description: 'Monitoramento Supabase, Vercel, domínio e postos em tempo real.',
    adminOnly: true,
  },
  {
    id: 'suporte',
    label: 'Suporte',
    description: 'Envie dúvida, sugestão ou reclamação para a equipe do teu posto.',
    hideForAdmin: true,
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
  return getVisibleMenuItems(isAdmin)
}
