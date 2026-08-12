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
```

## Modelos admin (criar na WABA do número real)

- `aviso_admin_db`
- `aviso_admin_r2`
- `aviso_admin_resend`
- `aviso_admin_dominio`

Textos e variáveis: ver plano / `whatsapp-templates.ts`.
