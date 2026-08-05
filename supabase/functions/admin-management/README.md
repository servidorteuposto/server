# Gerenciamento (admin)

Painel em tempo real: Supabase (DB/storage/fluxo do dia), Vercel/acessos, domínio e cards de postos.
Alertas WhatsApp via Z-API quando resta ≤10% da cota ou domínio em 7 / ≤2 dias.

## Migration

Aplicar:

```bash
npx supabase db push
# ou rode no SQL Editor:
# supabase/migrations/20260806120000_admin_management.sql
```

## Edge Functions

```bash
npx supabase functions deploy admin-management
npx supabase functions deploy admin-management-alerts --no-verify-jwt
```

## Secrets

Já usados: `WHATSAPP_WEBHOOK_URL`, `WHATSAPP_API_KEY`

Novos:

| Secret | Obrigatório | Uso |
|---|---|---|
| `ADMIN_MGMT_CRON_SECRET` | Sim (cron) | Header `x-admin-mgmt-cron-secret` |
| `VERCEL_TOKEN` | Não | API de usage/projeto |
| `VERCEL_PROJECT_ID` | Não | Projeto Vercel |
| `VERCEL_TEAM_ID` | Não | Team (se aplicável) |

No menu **Gerenciamento**, cadastre os 2 WhatsApps de alerta, a data de expiração do domínio e as cotas (GB) conforme o plano real.

## Cron sugerido (a cada 6h)

```bash
curl -X POST "https://jilzklxnejztpphbryti.supabase.co/functions/v1/admin-management-alerts" \
  -H "x-admin-mgmt-cron-secret: SEU_SECRET"
```

Também dá para clicar em **Verificar alertas agora** no painel (ação admin autenticada).
