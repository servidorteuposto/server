# WhatsApp Meta Cloud API — secrets

Substituem a Z-API. Configure no Supabase (Edge Functions secrets):

```bash
npx supabase secrets set META_WHATSAPP_TOKEN="SEU_TOKEN_PERMANENTE" META_WHATSAPP_PHONE_NUMBER_ID="1291300347394180" --project-ref jilzklxnejztpphbryti

# Opcional:
# npx supabase secrets set META_GRAPH_API_VERSION="v21.0" --project-ref jilzklxnejztpphbryti
# npx supabase secrets set META_WHATSAPP_WABA_ID="SEU_WABA_ID" --project-ref jilzklxnejztpphbryti

# Remover Z-API:
npx supabase secrets unset WHATSAPP_WEBHOOK_URL WHATSAPP_API_KEY --project-ref jilzklxnejztpphbryti
```

## Deploy das functions afetadas

```bash
npm run supabase:deploy-admin-management
npm run supabase:deploy-admin-management-alerts
npm run supabase:deploy-operational-reminders
npm run supabase:deploy-alerts
npm run supabase:deploy-drainage-reminders
npm run supabase:deploy-raq-alert
npm run supabase:deploy-metrology-alert
```

## Modelos admin (criar na WABA do número real)

- `aviso_admin_db`
- `aviso_admin_r2`
- `aviso_admin_resend`
- `aviso_admin_dominio`

## Modelo admin — banco (DB)

Nome na WABA: `aviso_admin_db` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Teu Posto — alerta de infraestrutura.

O recurso monitorado atingiu {{porcentagem}}% da cota.
Uso atual: {{um}}GB
Cota: {{dois}}GB

Revise o uso no painel Gerenciamento e libere espaço ou amplie o plano se necessário.
```

Variáveis (3): `porcentagem`, `um` (uso em GB, sem sufixo), `dois` (cota em GB, sem sufixo)

## Modelo admin — armazenamento (R2)

Nome na WABA: `aviso_admin_r2` (Utilidade / Portuguese (BR)), params **nomeados**.

Mesmo corpo e variáveis do `aviso_admin_db`: `porcentagem`, `um`, `dois` (valores em GB, sem sufixo).

## Modelo admin — cota de e-mail (Resend)

Nome na WABA: `aviso_admin_resend` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Teu Posto — alerta de cota de e-mail (Resend).

Período: {{um}}
Enviados: {{dois}}
Limite: {{tres}}
Restantes: {{quatro}}

Evite disparos não essenciais até a cota renovar.
```

Variáveis (4): `um` (diaria/mensal), `dois` (enviados), `tres` (limite), `quatro` (restantes)

## Modelo admin — domínio

Nome na WABA: `aviso_admin_dominio` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Teu Posto — alerta de domínio.

Dias restantes: {{x}}
Data de vencimento: {{y}}

Renove o registro do domínio para evitar indisponibilidade do site.
```

Variáveis (2): `x` (dias restantes), `y` (data de vencimento dd/mm/aaaa)

## Modelo posto — Assinatura vencida / acesso pausado

Nome na WABA: `aviso_assinatura_vencida` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo (modelo na Meta):

```
O prazo da utilização da plataforma expirou!

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Renove seu plano para continuar utilizando nossos serviços.
```

Variáveis: `razao`, `cnpj`, `endereco`

Enviado quando o admin pausa o acesso da conta.

## Modelo posto — Acesso bloqueado (senha)

Nome na WABA: `aviso_bloqueio` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Alerta de segurança — acesso bloqueado!

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

O acesso ao sistema foi bloqueado temporariamente após várias tentativas de login com senha incorreta.

Para liberar o acesso, abra o site do Teu Posto e use a opção Esqueci minha senha.

Se você não reconhece essas tentativas, redefina a senha imediatamente.
```

Variáveis (3): `razao`, `cnpj`, `endereco`

## Modelo posto — Assinatura em 2 dias

Nome na WABA: `aviso_assinatura_2d` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Lembrete de renovação da assinatura.

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Seu plano expira em 2 dias.

Renove pelo app com PIX, cartão ou boleto para manter o acesso completo.
```

Variáveis (3): `razao`, `cnpj`, `endereco`

## Modelo posto — Assinatura em 7 dias

Nome na WABA: `aviso_assinatura_7d` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Lembrete de renovação da assinatura.

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Seu plano expira em 7 dias.

Renove pelo app com PIX, cartão ou boleto para manter o acesso completo.
```

Variáveis (3): `razao`, `cnpj`, `endereco`

## Modelo posto — RAQ periódico (a cada 7 dias)

Nome na WABA: `aviso_raq1` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Lembre-se de fazer o Registro de Qualidade!

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Este é o aviso periódico (a cada 7 dias) para registrar o RAQ (análise de qualidade do combustível) no sistema do posto.

Conclua o lançamento quando a análise for realizada.
```

Variáveis (3): `razao`, `cnpj`, `endereco`

Só depois do primeiro RAQ; 7 dias após o último lançamento (a contagem reinicia se lançar de novo).

## Modelo posto — Drenagem de diesel

Nome na WABA: `aviso_drenagem_diesel` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Drenagem semanal pendente!

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Completou 7 dias desde a última drenagem do tanque {{tanque}}.

Realize a drenagem e lance o relatório no sistema.
```

Variáveis (4): `razao`, `cnpj`, `endereco`, `tanque`

## Modelo posto — Laudos de Engenharia e Saúde Ocupacional

Nome na WABA: `aviso_laudos_de_engenharia_e_saude_ocupacional` (Utilidade / pt_BR).

Corpo:

```
O documento {{doc}} na área de Laudos de Engenharia e Saúde Ocupacional (Segurança do Trabalho) está prestes a expirar.

O documento expira em: {{x}}.

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Renove o documento e fique em dias com seus documentos!
```

Variáveis (5): `doc`, `x` (data de vencimento dd/mm/aaaa), `razao`, `cnpj`, `endereco`

Avisos 30, 15, 7, 1 e 0 dias antes do vencimento — só após cadastrar o laudo em Segurança do Trabalho.

## Modelo posto — Cursos de funcionários (NR-20 / NR-35)

Nome na WABA: `aviso_treinamentos` (Utilidade / pt_BR).

Corpo:

```
A reciclagem do funcionário {{func}} do treinamento {{tre}} está prestes à expirar no dia {{dia}}.

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

É de extrema importância a reativação desse documento!
```

Variáveis (6): `func`, `tre`, `dia`, `razao`, `cnpj`, `endereco`

Avisos 30, 15, 7, 1 e 0 dias antes — só após anexar o certificado do funcionário.

## Modelo posto — RAQ fora das especificações


Nome na WABA: `aviso_raq_fora` (Utilidade / Portuguese (BR)), params **nomeados**.

Cabeçalho (texto): `Teu Posto:`

Corpo:

```
A análise do combustível {{combustivel}} lançado em sistema hoje {{data}} está fora dos padrões de conformidade.

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Dados observados:
Aspecto: {{aspecto}}
Cor: {{cor}}
Temperatura Observada (°C): {{tempo}}
Massa Específica Observada (Dt): {{massa}}
Massa Específica Convertida 20/4 °C (D20): {{massac}}
{{tipo}} {{teor}}

Verifique no sistema os dados lançados!
```

Variáveis (12): `combustivel`, `data`, `razao`, `cnpj`, `endereco`, `aspecto`, `cor`, `tempo`, `massa`, `massac`, `tipo`, `teor`

- `tipo`: etanol → `Teor Alcoólico ºINPM (calculado):`; gasolina → `Teor Alcoólico (% v/v) (calculado):`; diesel → vazio
- `teor`: valor com 1 casa decimal + unidade (`ºINPM` ou `% v/v`); diesel → vazio

Botão URL estático: **Acesse Teu Posto** → `https://www.appteuposto.com.br`

O envio lê as variáveis reais do modelo na WABA e manda só o que o template espera (isso corrige diferença de quantidade de params). RAQ/metrologia fora saem na hora do lançamento.

## Modelo posto — Documento perto de expirar

Nome na WABA: `aviso_doc_prazo` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Documento perto de expirar!

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

O documento {{documento}} expira em {{dias}} dias.

Organize a renovação e atualize o arquivo no sistema.
```

Variáveis (5): `razao`, `cnpj`, `endereco`, `documento`, `dias`

## Modelo posto — Documento vencido

Nome na WABA: `aviso_doc_vencido` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Validade expirada!

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

O documento {{documento}} expirou!

A validade está expirada. Renove e atualize o anexo no Teu Posto o quanto antes.
```

Variáveis (4): `razao`, `cnpj`, `endereco`, `documento`

## Modelo posto — Metrologia periódica (15 dias)

Nome na WABA: `aviso_metrologia` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
Metrologia em dia?

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Já se passaram 15 dias desde a ultima verificação metrológica.

Faça uma nova metrologia dos bicos e registre no Teu Posto.
```

Variáveis (3): `razao`, `cnpj`, `endereco`

## Modelo posto — Metrologia reprovada

Nome na WABA: `aviso_metrologia_fora` (Utilidade / Portuguese (BR)), params **nomeados**.

Corpo:

```
A metrologia do bico número {{number}} lançado em sistema hoje {{data}} está fora dos padrões de conformidade.

Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Dados observados:
Volumetria mínima: {{volmin}}
Vazão: {{vazaomin}}
Volumetria máxima: {{volmax}}
Vazão: {{vazaomax}}
Lacres: {{lacre}}
Vazamento: {{vaz}}
Mangueira: {{mang}}
Display: {{display}}

Verifique no sistema os dados lançados!
```

Variáveis (13): `number`, `data`, `razao`, `cnpj`, `endereco`, `volmin`, `vazaomin`, `volmax`, `vazaomax`, `lacre`, `vaz`, `mang`, `display`

Valores enviados no bico:

- **Número (`number`):** `01`
- **Volumetria (`volmin` / `volmax`):** `+20`, `-100`, `0`
- **Vazão (`vazaomin` / `vazaomax`):** `5 L`
- **Lacres (`lacre`):** `OK` ou `FALTANDO`
- **Vazamento (`vaz`):** `POSSUI` ou `NAO POSSUI`
- **Mangueira (`mang`):** `OK` ou `DANIFICADA`
- **Display (`display`):** `OK` ou `QUEIMADO`

Botão URL estático: **Acesse Teu Posto** → `https://www.appteuposto.com.br`

Enviado ao **salvar** a verificação metrológica com resultado **REPROVADO** (um aviso por bico reprovado). Rascunho não dispara.
