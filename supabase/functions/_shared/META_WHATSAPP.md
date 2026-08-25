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

## Modelo posto — Laudos de Engenharia e Saúde Ocupacional

Nome na WABA: `aviso_laudos_de_engenharia_e_saude_ocupacional` (Utilidade / pt_BR).

Variáveis: `doc`, `x` (data de vencimento dd/mm/aaaa), `razao`, `cnpj`, `endereco`

Avisos 30, 15, 7, 1 e 0 dias antes do vencimento — só após cadastrar o laudo em Segurança do Trabalho.

## Modelo posto — Cursos de funcionários (NR-20 / NR-35)

Nome na WABA: `aviso_treinamentos` (Utilidade / pt_BR).

Variáveis: `curso`, `funcionario`, `x` (data de vencimento), `razao`, `cnpj`, `endereco`

Avisos 30, 15, 7, 1 e 0 dias antes — só após anexar o certificado do funcionário.

## Modelo posto — RAQ fora das especificações


Nome na WABA: `aviso_raq_fora` (Utilidade / Portuguese (BR)), params **nomeados**.

Cabeçalho (texto): `Teu Posto:`

Corpo:

```
A metrologia acusou uma medida do combustível {{combustivel}} fora das especificações!

Dados completos:
Aspecto: {{aspecto}}
Cor: {{cor}}
ME Observada: {{meobservada}}
Temperatura: {{temperatura}}
ME Convertida 20°C: {{meconvertida}}
Teor: {{teor}}
Data da verificação: {{data}}
Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Verifique os dados do seu combustível.
```

Variáveis do modelo aprovado (11): `combustivel`, `aspecto`, `cor`, `meobservada`, `temperatura`, `meconvertida`, `teor`, `data`, `razao`, `cnpj`, `endereco`

Botão URL estático: **Acesse Teu Posto** → `https://www.appteuposto.com.br`

O envio lê as variáveis reais do modelo na WABA e manda só o que o template espera (isso corrige diferença de quantidade de params). RAQ/metrologia fora saem na hora do lançamento.

## Modelo posto — Metrologia reprovada

Nome na WABA: `aviso_metrologia_fora` (Utilidade / Portuguese (BR)), params **nomeados**.

Variáveis do modelo aprovado (13): `combustivel`, `aspecto`, `cor`, `meobservada`, `temperatura`, `meconvertida`, `vazamento`, `mangueiras`, `lacres`, `data`, `razao`, `cnpj`, `endereco`

Valores enviados no bico:

- **Lacres (`lacres`):** `OK` ou `FALTANDO`
- **Vazamento (`vazamento`):** `POSSUI` ou `NAO POSSUI`
- **Mangueira (`mangueiras`):** `OK` ou `DANIFICADA`
- **Display (`display`):** `OK` ou `QUEIMADO`

`combustivel` vai como `DIESEL S10 ADITIVADO - BICO 01`. Aspecto/cor/ME/temperatura vêm do último RAQ daquele combustível; se não houver, vai `-`.

Botão URL estático: **Acesse Teu Posto** → `https://www.appteuposto.com.br`

Enviado ao **salvar** a verificação metrológica com resultado **REPROVADO** (um aviso por bico reprovado). Rascunho não dispara.
