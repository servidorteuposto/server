# WhatsApp Meta Cloud API — secrets

Substituem a Z-API. Configure no Supabase (Edge Functions secrets):

```bash
npx supabase secrets set META_WHATSAPP_TOKEN="SEU_TOKEN_PERMANENTE" META_WHATSAPP_PHONE_NUMBER_ID="1291300347394180" --project-ref jilzklxnejztpphbryti

# Opcional:
# npx supabase secrets set META_GRAPH_API_VERSION="v21.0" --project-ref jilzklxnejztpphbryti

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
```

## Modelos admin (criar na WABA do número real)

- `aviso_admin_db`
- `aviso_admin_r2`
- `aviso_admin_resend`
- `aviso_admin_dominio`

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
Data da verificação: {{data}}
Razão Social: {{razao}}
CNPJ: {{cnpj}}
Endereço: {{endereco}}

Verifique os dados do seu combustível.
```

Variáveis: `combustivel`, `aspecto`, `cor`, `meobservada`, `temperatura`, `meconvertida`, `data`, `razao`, `cnpj`, `endereco`

Botão URL estático: **Acesse Teu Posto** → `https://www.appteuposto.com.br`

Enviado ao lançar análise do RAQ com status **Fora das Especificações** (um aviso por combustível inapto).
