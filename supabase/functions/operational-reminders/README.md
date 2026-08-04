# Lembretes operacionais (WhatsApp / Z-API)

Edge Function diária que envia avisos WhatsApp para os números `aviso_whatsapp_1..4` (ou `telefone` do posto).

## O que envia

| Tipo | Regra | Frequência do aviso |
| --- | --- | --- |
| Documentos regulatórios | `expires_at` | 30, 15, 7, 1 dia antes e no dia (expirado) |
| Laudos (PGR/LTCAT/PCMSO) | `expires_at` | Idem |
| Metrologia | última `verified_at` + 15 dias | 1x no dia do vencimento (renova se fizer antes) |
| Drenagem diesel | última `drained_at` + 7 dias (por tanque) | 1x no dia do vencimento |
| RAQ | calendário | a cada 2 dias, independente de lançamentos |

Só postos com `subscription_status = active` e pelo menos um WhatsApp cadastrado.

Anti-duplicata: tabela `whatsapp_reminder_sends`.

## Secrets

| Secret | Uso |
| --- | --- |
| `WHATSAPP_WEBHOOK_URL` | Endpoint Z-API send-text |
| `WHATSAPP_API_KEY` | Client-Token / Bearer |
| `OPERATIONAL_CRON_SECRET` | Header `x-operational-cron-secret` (ou reutiliza `DRAINAGE_CRON_SECRET`) |

## Cron (diário, manhã SP)

```http
POST https://jilzklxnejztpphbryti.supabase.co/functions/v1/operational-reminders
x-operational-cron-secret: SEU_SECRETO
```

Sugestão: 08:00 America/Sao_Paulo via cron do Supabase / Cloudflare / GitHub Actions.

## Deploy

```bash
npm run supabase:deploy-operational-reminders
```
