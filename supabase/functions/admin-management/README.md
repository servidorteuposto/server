# Gerenciamento (admin)

Painel em tempo real: Supabase (DB/storage/fluxo do dia), **Resend** (cota e últimos e-mails), domínio, Z-API e cards de postos.

Alertas (WhatsApp + e-mail `servidorteuposto@gmail.com`) quando:
- resta ≤10% da cota (DB, storage, Resend);
- domínio em 7 / ≤2 dias ou expirado;
- Z-API desconectada (**só e-mail**, pois o WhatsApp está offline);
- **vencimento da Z-API** (puxado automático do endpoint `/me`, campo `due`) em 7 / ≤2 dias ou expirado.

No login do admin, se houver alerta ativo, aparece um banner pedindo para abrir o Gerenciamento.
Dedupe: 1 envio por motivo por dia (SP), via `last_alerts`.

## Migration

Aplicar no SQL Editor (se ainda não rodou):

- `supabase/migrations/20260806120000_admin_management.sql`
- `supabase/migrations/20260806130000_fix_whatsapp_metrics.sql`
- `supabase/migrations/20260806160000_whatsapp_reminder_queue.sql` (fila de reenvio WhatsApp)

## Edge Functions

```bash
npx supabase functions deploy admin-management --project-ref jilzklxnejztpphbryti
npx supabase functions deploy admin-management-alerts --project-ref jilzklxnejztpphbryti --no-verify-jwt
```

## Secrets

| Secret | Obrigatório | Uso |
|---|---|---|
| `RESEND_API_KEY` | Sim | Métricas + e-mail de alerta ao admin |
| `WHATSAPP_WEBHOOK_URL` / `WHATSAPP_API_KEY` | Para alertas WA + vencimento Z-API | Z-API `/status` e `/me` |
| `ADMIN_MGMT_CRON_SECRET` | Sim (cron) | Header `x-admin-mgmt-cron-secret` |
| `OPERATIONAL_CRON_SECRET` | Para flush da fila | Disparo ao reconectar Z-API |

Cotas sugeridas no free: DB **0.5 GB**, Storage **1 GB**, Resend **100/dia** e **3000/mês**.

## Documentos seguros (cofre)

Migration adicional (SQL Editor):

`supabase/migrations/20260806140000_admin_secure_files.sql`

Cria a tabela `admin_secure_files` e o bucket privado `admin-secure-files`.
PDF/TXT com senha — ver/baixar só após desbloquear no Gerenciamento.

## Cron sugerido (a cada 6h)

```bash
curl -X POST "https://jilzklxnejztpphbryti.supabase.co/functions/v1/admin-management-alerts" \
  -H "x-admin-mgmt-cron-secret: SEU_SECRET"
```
