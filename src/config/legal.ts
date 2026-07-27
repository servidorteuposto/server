export type LegalDocId = 'termos-de-uso' | 'privacidade' | 'cookies' | 'seguranca'

export type LegalSection = {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export type LegalDocument = {
  id: LegalDocId
  title: string
  shortTitle: string
  updatedAt: string
  intro: string
  sections: LegalSection[]
}

/** Dados do controlador — ajuste CNPJ/razão social se necessário. */
export const LEGAL_CONTROLLER = {
  brand: 'Teu Posto',
  product: 'aplicativo e plataforma Teu Posto (appteuposto.com.br)',
  siteUrl: 'https://www.appteuposto.com.br',
  /** Canal público de contato (formulário de suporte no app). */
  supportUrl: '/?suporte=1',
  supportLabel: 'formulário de suporte',
  supportPath: 'Suporte',
  /** Preencha com a razão social e CNPJ oficiais do operador do serviço. */
  legalName: 'Operador do Teu Posto',
  jurisdiction: 'Brasil',
  law: 'Lei nº 13.709/2018 (LGPD)',
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    id: 'termos-de-uso',
    title: 'Termos de Uso',
    shortTitle: 'Termos de Uso',
    updatedAt: '27/07/2026',
    intro:
      'Estes Termos de Uso regulam o acesso e a utilização do Teu Posto, plataforma de gestão regulatória e operacional para postos de combustíveis. Ao criar conta, acessar ou usar o serviço, você declara ter lido e aceitado estes Termos e a Política de Privacidade.',
    sections: [
      {
        title: '1. Aceitação e elegibilidade',
        paragraphs: [
          'O serviço destina-se a pessoas jurídicas ou seus representantes legalmente autorizados (postos e equipes) para fins profissionais.',
          'Ao cadastrar-se, você declara ter capacidade e autorização para vincular o posto aos presentes Termos e às obrigações da LGPD quando tratar dados de terceiros (colaboradores, motoristas, parceiros etc.).',
        ],
      },
      {
        title: '2. Descrição do serviço',
        paragraphs: [
          'O Teu Posto oferece ferramentas digitais para organização de documentos regulatórios, análises de combustíveis, verificação metrológica, drenagens, equipamentos obrigatórios, segurança do trabalho, cadastros e demais módulos disponibilizados conforme o plano contratado.',
          'Funcionalidades podem evoluir; avisaremos alterações relevantes quando impactarem materialmente o uso ou o tratamento de dados.',
        ],
      },
      {
        title: '3. Cadastro, conta e assinatura',
        paragraphs: [
          'Para usar o sistema é necessário cadastro com dados verdadeiros e atualizados (razão social, CNPJ, e-mail e demais informações solicitadas).',
          'Você é responsável por manter a confidencialidade da senha e por atividades realizadas na conta. Em caso de suspeita de uso indevido, altere a senha e contate o suporte.',
          'O acesso pleno depende da assinatura ativa e do pagamento conforme as condições comerciais vigentes. Contas vencidas podem permanecer em modo somente leitura ou ter o acesso restrito, conforme a política do produto.',
        ],
      },
      {
        title: '4. Uso permitido e proibições',
        paragraphs: ['É permitido usar o Teu Posto apenas para fins legítimos relacionados à operação do posto. É proibido:'],
        bullets: [
          'Compartilhar credenciais ou permitir acesso não autorizado',
          'Inserir dados falsos, ilícitos ou de terceiros sem base legal',
          'Tentar invadir, sobrecarregar, engenheirar reversamente ou explorar falhas do sistema',
          'Usar o serviço para spam, fraude ou qualquer atividade ilegal',
          'Violar direitos de propriedade intelectual ou a LGPD',
        ],
      },
      {
        title: '5. Conteúdo e dados do usuário',
        paragraphs: [
          'Documentos, fotos, assinaturas, dados cadastrais e demais conteúdos enviados pelo posto permanecem sob sua responsabilidade quanto à licitude, qualidade e atualização.',
          'Você concede ao Teu Posto licença limitada para armazenar, processar e exibir esse conteúdo exclusivamente para prestar o serviço (incluindo backups, segurança e suporte).',
          'Quando o posto tratar dados pessoais de colaboradores ou terceiros no sistema, o posto atua, em regra, como controlador desses dados, e o Teu Posto como operador, nos termos da LGPD, processando-os conforme instruções e a finalidade do serviço.',
        ],
      },
      {
        title: '6. Disponibilidade e limitações',
        paragraphs: [
          'Envidamos esforços razoáveis para manter o serviço disponível e seguro, mas não garantimos operação ininterrupta ou isenta de erros. Manutenções programadas ou emergenciais podem ocorrer.',
          'O Teu Posto é ferramenta de apoio à conformidade; não substitui assessoria jurídica, contábil ou a responsabilidade do posto perante órgãos reguladores (ANP, INMETRO, órgãos ambientais, bombeiros etc.).',
        ],
      },
      {
        title: '7. Propriedade intelectual',
        paragraphs: [
          'Marca, layout, código, textos e demais elementos do Teu Posto são protegidos. É vedada a reprodução não autorizada.',
          'Conteúdo inserido pelo usuário permanece de titularidade do usuário ou de quem lhe detém os direitos, observados os limites legais.',
        ],
      },
      {
        title: '8. Privacidade, cookies e segurança',
        paragraphs: [
          'O tratamento de dados pessoais segue a Política de Privacidade, a Política de Cookies e a Política de Segurança, partes integrantes destes Termos.',
        ],
      },
      {
        title: '9. Suspensão e encerramento',
        paragraphs: [
          'Podemos suspender ou encerrar o acesso em caso de violação destes Termos, inadimplemento, risco à segurança ou determinação legal.',
          'Você pode solicitar o encerramento da conta pelo suporte. Após o encerramento, dados serão retidos ou eliminados conforme a Política de Privacidade e obrigações legais.',
        ],
      },
      {
        title: '10. Limitação de responsabilidade',
        paragraphs: [
          'Na máxima extensão permitida pela legislação brasileira, o Teu Posto não responde por lucros cessantes, danos indiretos ou prejuízos decorrentes de uso inadequado, indisponibilidade temporária, ou decisões tomadas com base em informações inseridas pelo usuário.',
          'Nada nestes Termos exclui responsabilidade por dolo ou demais hipóteses inafastáveis por lei.',
        ],
      },
      {
        title: '11. Alterações',
        paragraphs: [
          'Podemos atualizar estes Termos. A versão vigente será publicada no site/app com a data de atualização. O uso continuado após a publicação pode constituir aceitação, quando aplicável. Em mudanças relevantes, poderemos solicitar novo aceite.',
        ],
      },
      {
        title: '12. Foro e legislação',
        paragraphs: [
          `Estes Termos são regidos pelas leis da República Federativa do Brasil, em especial a ${LEGAL_CONTROLLER.law} e o Código de Defesa do Consumidor, quando aplicável.`,
          'Fica eleito o foro da comarca do domicílio do usuário consumidor, ou outro foro legalmente competente, para dirimir controvérsias.',
        ],
      },
      {
        title: '13. Contato',
        paragraphs: [
          `Dúvidas sobre estes Termos: use o ${LEGAL_CONTROLLER.supportLabel} no aplicativo (menu ${LEGAL_CONTROLLER.supportPath} ou a opção “Fale com o suporte” na tela de login).`,
        ],
      },
    ],
  },
  {
    id: 'privacidade',
    title: 'Política de Privacidade',
    shortTitle: 'Privacidade',
    updatedAt: '27/07/2026',
    intro:
      'Esta Política descreve como o Teu Posto trata dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018) e demais normas aplicáveis.',
    sections: [
      {
        title: '1. Controlador e canal de atendimento',
        paragraphs: [
          `Controlador dos dados pessoais tratados para operação da plataforma (contas, autenticação, assinatura, suporte e melhoria do serviço): ${LEGAL_CONTROLLER.legalName}, marca ${LEGAL_CONTROLLER.brand}, serviço ${LEGAL_CONTROLLER.product}.`,
          `Canal para exercício de direitos e dúvidas de privacidade: ${LEGAL_CONTROLLER.supportLabel} no aplicativo (menu ${LEGAL_CONTROLLER.supportPath} ou “Fale com o suporte” na tela de login).`,
          'Quando o posto cadastra ou anexa dados de colaboradores, motoristas, parceiros ou terceiros, o posto é, em regra, o controlador desses dados; o Teu Posto atua como operador, processando-os para viabilizar as funcionalidades contratadas.',
        ],
      },
      {
        title: '2. Dados que podemos tratar',
        paragraphs: ['Conforme o uso do serviço, podemos tratar:'],
        bullets: [
          'Dados cadastrais: razão social, CNPJ, e-mail, telefone/WhatsApp, endereço, coordenadas e foto do posto',
          'Dados de acesso: credenciais (senha armazenada de forma criptografada/hash), logs de autenticação e segurança',
          'Dados operacionais: documentos, PDFs, fotos com data/hora/GPS, assinaturas, lançamentos de análises, metrologia, drenagens, equipamentos e segurança do trabalho',
          'Dados de suporte: mensagens, anexos e metadados de tickets',
          'Dados técnicos: endereço IP, identificadores de dispositivo/navegador, cookies e registros de segurança (conforme Política de Cookies)',
        ],
      },
      {
        title: '3. Finalidades e bases legais (art. 7º e 11 da LGPD)',
        paragraphs: ['Tratamos dados pessoais para:'],
        bullets: [
          'Execução de contrato / procedimentos preliminares: criar conta, autenticar, prestar o serviço e gerir assinatura (art. 7º, V)',
          'Cumprimento de obrigação legal ou regulatória, quando aplicável (art. 7º, II)',
          'Legítimo interesse: segurança da informação, prevenção a fraudes e melhoria do serviço, com equilíbrio aos direitos do titular (art. 7º, IX)',
          'Consentimento: quando exigido (ex.: cookies não essenciais), podendo ser revogado (art. 7º, I)',
          'Exercício regular de direitos em processo judicial, administrativo ou arbitral (art. 7º, VI)',
        ],
      },
      {
        title: '4. Compartilhamento',
        paragraphs: [
          'Podemos compartilhar dados com prestadores que nos auxiliam na operação (hospedagem, autenticação, e-mail transacional, infraestrutura), sempre sob contrato e medidas de segurança adequadas, na qualidade de operadores.',
          'Exemplos típicos: provedores de nuvem/banco de dados, autenticação, envio de e-mails (ex.: Resend) e CDN/DNS (ex.: Cloudflare), conforme configuração vigente.',
          'Também poderemos divulgar dados se exigido por lei, ordem judicial ou autoridade competente.',
          'Não vendemos dados pessoais.',
        ],
      },
      {
        title: '5. Transferência internacional',
        paragraphs: [
          'Alguns fornecedores podem processar dados fora do Brasil. Nesses casos, adotamos salvaguardas compatíveis com a LGPD (contratuais e/ou mecanismos reconhecidos), buscando nível adequado de proteção.',
        ],
      },
      {
        title: '6. Armazenamento e retenção',
        paragraphs: [
          'Mantemos dados pelo tempo necessário às finalidades, à vigência da conta/assinatura e a obrigações legais ou de defesa de direitos.',
          'Após o encerramento, poderemos anonimizar ou eliminar dados, ressalvados prazos legais de guarda e backups de segurança por período limitado.',
        ],
      },
      {
        title: '7. Direitos do titular (arts. 18 e seguintes da LGPD)',
        paragraphs: ['Você pode solicitar, na forma da lei:'],
        bullets: [
          'Confirmação da existência de tratamento',
          'Acesso aos dados',
          'Correção de dados incompletos, inexatos ou desatualizados',
          'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade',
          'Portabilidade, quando aplicável',
          'Informação sobre compartilhamentos',
          'Informação sobre a possibilidade de não consentir e consequências',
          'Revogação do consentimento',
          'Revisão de decisões automatizadas, quando cabível',
        ],
      },
      {
        title: '8. Como exercer seus direitos',
        paragraphs: [
          `Envie solicitação pelo ${LEGAL_CONTROLLER.supportLabel} no aplicativo (menu ${LEGAL_CONTROLLER.supportPath} ou “Fale com o suporte” na tela de login), identificando-se adequadamente. Responderemos no prazo legal, podendo solicitar informações adicionais para confirmar a identidade.`,
          'Também é possível apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).',
        ],
      },
      {
        title: '9. Segurança',
        paragraphs: [
          'Adotamos medidas técnicas e administrativas para proteger dados pessoais contra acessos não autorizados e incidentes. Detalhes constam na Política de Segurança.',
          'Nenhum sistema é 100% seguro; pedimos que você também proteja suas credenciais e dispositivos.',
        ],
      },
      {
        title: '10. Crianças e adolescentes',
        paragraphs: [
          'O serviço não é direcionado a crianças ou adolescentes. Não coletamos intencionalmente dados de menores. Se identificar cadastro indevido, contate-nos para exclusão.',
        ],
      },
      {
        title: '11. Alterações',
        paragraphs: [
          'Esta Política pode ser atualizada. A versão vigente indica a data de atualização. Em mudanças relevantes, poderemos notificar pelos canais habituais ou solicitar novo aceite.',
        ],
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Política de Cookies',
    shortTitle: 'Cookies',
    updatedAt: '27/07/2026',
    intro:
      'Esta Política explica o que são cookies, quais utilizamos no Teu Posto e como você pode gerenciá-los, em conformidade com a LGPD e boas práticas de transparência.',
    sections: [
      {
        title: '1. O que são cookies',
        paragraphs: [
          'Cookies são pequenos arquivos armazenados no seu navegador ou dispositivo quando você acessa um site ou aplicativo web. Tecnologias similares (localStorage, sessionStorage) também podem ser usadas para a mesma finalidade prática.',
        ],
      },
      {
        title: '2. Por que usamos',
        paragraphs: ['Utilizamos cookies e armazenamento local principalmente para:'],
        bullets: [
          'Manter a sessão autenticada e preferências essenciais de uso',
          'Garantir segurança (ex.: prevenção a abuso e proteção da conta)',
          'Lembrar escolhas do usuário (ex.: “lembrar e-mail/CNPJ” no login, preferências de cookies)',
          'Operar o Progressive Web App (PWA), quando instalado',
        ],
      },
      {
        title: '3. Tipos de cookies',
        paragraphs: [],
        bullets: [
          'Necessários / essenciais: indispensáveis para login, segurança e funcionamento básico. Base legal típica: execução de contrato e/ou legítimo interesse (segurança).',
          'Preferências: lembram escolhas (ex.: consentimento de cookies, identificador lembrado). Podem depender de consentimento quando não forem estritamente necessários.',
          'Analíticos / marketing: apenas se forem ativados no futuro. Nesse caso, serão descritos nesta Política e dependerão de consentimento, salvo se forem estritamente necessários.',
        ],
      },
      {
        title: '4. O que utilizamos hoje',
        paragraphs: [
          'Na versão atual do Teu Posto, o uso predominante é de cookies/armazenamento essenciais e de preferências ligadas ao funcionamento do app (autenticação Supabase, sessão, preferências locais e registro do consentimento de cookies).',
          'Não utilizamos, neste momento, cookies de publicidade de terceiros para remarketing. Se isso mudar, atualizaremos esta Política e o banner de consentimento.',
        ],
      },
      {
        title: '5. Consentimento',
        paragraphs: [
          'Ao acessar o site/app, apresentamos informações sobre cookies. Cookies essenciais podem ser utilizados independentemente de consentimento, na medida permitida pela LGPD.',
          'Para cookies não essenciais (quando existirem), solicitaremos consentimento. Você pode alterar ou revogar preferências a qualquer momento pelas configurações do navegador e, quando disponível, pelo próprio banner/gestão de cookies.',
        ],
      },
      {
        title: '6. Como gerenciar',
        paragraphs: [
          'Você pode bloquear ou apagar cookies nas configurações do navegador. Aviso: bloquear cookies essenciais pode impedir login ou o funcionamento correto do Teu Posto.',
          'Em dispositivos móveis/PWA, limpar dados do site/app remove armazenamento local associado.',
        ],
      },
      {
        title: '7. Contato',
        paragraphs: [
          `Dúvidas: use o ${LEGAL_CONTROLLER.supportLabel} no aplicativo (menu ${LEGAL_CONTROLLER.supportPath} ou “Fale com o suporte” na tela de login).`,
        ],
      },
    ],
  },
  {
    id: 'seguranca',
    title: 'Política de Segurança da Informação',
    shortTitle: 'Segurança',
    updatedAt: '27/07/2026',
    intro:
      'Esta Política descreve princípios e medidas de segurança adotados no Teu Posto para proteger dados pessoais e informações do posto, alinhados à LGPD (arts. 46 e seguintes) e a boas práticas de segurança da informação.',
    sections: [
      {
        title: '1. Objetivo',
        paragraphs: [
          'Preservar a confidencialidade, integridade e disponibilidade das informações tratadas na plataforma, reduzindo riscos de acesso indevido, vazamento, alteração ou destruição não autorizada.',
        ],
      },
      {
        title: '2. Medidas técnicas e administrativas',
        paragraphs: ['Entre as medidas adotadas ou suportadas pela arquitetura do serviço, destacam-se:'],
        bullets: [
          'Comunicação criptografada (HTTPS/TLS) entre cliente e servidores',
          'Autenticação com provedor especializado; senhas armazenadas de forma segura (hash)',
          'Controle de acesso por conta e políticas no banco de dados (isolamento por posto, quando aplicável)',
          'Registro e tratamento de eventos de segurança (ex.: bloqueio após tentativas inválidas de login)',
          'Envio de alertas de segurança por canais configurados (e-mail/WhatsApp), quando aplicável',
          'Uso de infraestrutura de nuvem com controles de rede, backups e monitoramento',
          'Proteções de borda (ex.: CDN/WAF/bot protection) quando configuradas no domínio',
        ],
      },
      {
        title: '3. Responsabilidades do usuário',
        paragraphs: ['A segurança também depende do usuário. Recomendamos:'],
        bullets: [
          'Usar senha forte e exclusiva; não compartilhar credenciais',
          'Manter dispositivos e navegadores atualizados',
          'Desconfiar de links ou e-mails suspeitos; o Teu Posto não solicita senha por e-mail',
          'Revogar acessos de ex-colaboradores e proteger o dispositivo com o app instalado',
          'Reportar incidentes imediatamente pelo suporte',
        ],
      },
      {
        title: '4. Desenvolvimento e fornecedores',
        paragraphs: [
          'Alterações no sistema devem preservar controles de segurança. Fornecedores com acesso a dados pessoais são selecionados e contratados com deveres de confidencialidade e segurança compatíveis com a LGPD.',
        ],
      },
      {
        title: '5. Incidentes de segurança',
        paragraphs: [
          'Em caso de incidente que possa acarretar risco ou dano relevante aos titulares, adotaremos medidas de contenção, avaliação de impacto e comunicações exigidas pela LGPD e pela ANPD, quando cabível.',
          'Usuários afetados poderão ser avisados pelos canais cadastrados (e-mail/WhatsApp/suporte).',
        ],
      },
      {
        title: '6. Continuidade e backups',
        paragraphs: [
          'Mantemos práticas de backup e recuperação compatíveis com a criticidade do serviço, observando prazos de retenção e segurança dos dumps.',
        ],
      },
      {
        title: '7. Limitação',
        paragraphs: [
          'Embora adotemos medidas razoáveis e atualizadas, nenhum ambiente digital é isento de riscos. Esta Política não constitui garantia absoluta contra ataques ou falhas de terceiros.',
        ],
      },
      {
        title: '8. Contato',
        paragraphs: [
          `Para reportar vulnerabilidades ou incidentes: use o ${LEGAL_CONTROLLER.supportLabel} no aplicativo (menu ${LEGAL_CONTROLLER.supportPath} ou “Fale com o suporte” na tela de login).`,
        ],
      },
    ],
  },
]

export function getLegalDocument(id: string | null | undefined): LegalDocument | null {
  if (!id) return null
  return LEGAL_DOCUMENTS.find((doc) => doc.id === id) ?? null
}

export function buildLegalPath(id: LegalDocId) {
  return `/legal/${id}`
}

export const COOKIE_CONSENT_STORAGE_KEY = 'teuposto_cookie_consent_v1'
