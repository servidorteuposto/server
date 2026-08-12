# Gerenciamento (admin)

Painel em tempo real: Supabase (DB/storage/fluxo do dia), **Resend**, domínio, WhatsApp Meta Cloud API e cards de postos.

Alertas (WhatsApp template + e-mail `servidorteuposto@gmail.com`) quando:
- resta ≤10% da cota (DB, R2, Resend mensal) ou ≤10 e-mails no dia (Resend diário);
- domínio em 7 / ≤2 dias ou expirado.

Modelos admin (Utilidade / pt_BR): `aviso_admin_db`, `aviso_admin_r2`, `aviso_admin_resend`, `aviso_admin_dominio`.

No login do admin, se houver alerta ativo, aparece um banner pedindo para abrir o Gerenciamento.
Dedupe: 1 envio por motivo por dia (SP), via `last_alerts`.

## Migration

Aplicar no SQL Editor (se ainda não rodou):

- `supabase/migrations/20260806120000_admin_management.sql`
- `supabase/migrations/20260806130000_fix_whatsapp_metrics.sql`
- `supabase/migrations/20260806160000_whatsapp_reminder_queue.sql`
- `supabase/migrations/20260812120000_whatsapp_queue_meta_templates.sql`

## Edge Functions

```bash
npx supabase functions deploy admin-management --project-ref jilzklxnejztpphbryti
npx supabase functions deploy admin-management-alerts --project-ref jilzklxnejztpphbryti --no-verify-jwt
```

## Secrets

| Secret | Obrigatório | Uso |
|---|---|---|
| `RESEND_API_KEY` | Sim | Métricas + e-mail de alerta ao admin |
| `META_WHATSAPP_TOKEN` | Sim (WA) | Token permanente Cloud API |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Sim (WA) | ID do número de produção |
| `META_GRAPH_API_VERSION` | Não | Default `v21.0` |
| `ADMIN_MGMT_CRON_SECRET` | Sim (cron) | Header `x-admin-mgmt-cron-secret` |

Remova secrets antigos Z-API se ainda existirem: `WHATSAPP_WEBHOOK_URL`, `WHATSAPP_API_KEY`.

Cotas sugeridas no free: DB **0.5 GB**, Storage R2 **10 GB**, Resend **100/dia** e **3000/mês**.

## Documentos seguros (cofre)

Migration adicional (SQL Editor):

`supabase/migrations/20260806140000_admin_secure_files.sql`

## Cron sugerido (a cada 1h)

```bash
curl -X POST "https://jilzklxnejztpphbryti.supabase.co/functions/v1/admin-management-alerts" \
  -H "x-admin-mgmt-cron-secret: SEU_SECRET"
```
