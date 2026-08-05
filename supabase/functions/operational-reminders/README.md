# Lembretes operacionais (WhatsApp / Z-API)

Edge Function que envia avisos WhatsApp para os números `aviso_whatsapp_1..4` (ou `telefone` do posto).

## Fila e Z-API offline

1. No horário do marco, o aviso entra em `whatsapp_reminder_queue` (mesmo se a Z-API estiver desconectada).
2. Só sai da fila e vai para `whatsapp_reminder_sends` **depois** do envio com sucesso.
3. Se a Z-API estiver offline, os itens ficam pendentes e são reenviados assim que a conexão voltar (próximo cron ou flush ao detectar Z-API conectada no login/admin).

## O que envia

| Tipo | Regra | Frequência do aviso |
| --- | --- | --- |
| Renovação de plano | `subscription_ends_at` | 7 e 2 dias antes do vencimento (PIX/boleto e recorrente) |
| Documentos regulatórios | `expires_at` | 30, 15, 7, 1 dia antes e no dia (expirado) |
| Laudos (PGR/LTCAT/PCMSO) | `expires_at` | Idem |
| Metrologia | última `verified_at` + 15 dias | No dia do vencimento (reenvia se atrasou por Z-API offline) |
| Drenagem diesel | última `drained_at` + 7 dias (por tanque) | Idem |
| RAQ | calendário | a cada 2 dias (não agenda novo se já há RAQ pendente na fila) |

Só postos com `subscription_status = active` e pelo menos um WhatsApp cadastrado.

Anti-duplicata: `whatsapp_reminder_sends`. Fila: `whatsapp_reminder_queue`.

## Secrets

| Secret | Uso |
| --- | --- |
| `WHATSAPP_WEBHOOK_URL` | Endpoint Z-API send-text |
| `WHATSAPP_API_KEY` | Client-Token / Bearer |
| `OPERATIONAL_CRON_SECRET` | Header `x-operational-cron-secret` (ou reutiliza `DRAINAGE_CRON_SECRET`) |

## Cron

Sugestão: a cada **1–2 horas** (não só 1x/dia), para descarregar a fila logo após a Z-API reconectar.

```http
POST https://jilzklxnejztpphbryti.supabase.co/functions/v1/operational-reminders
x-operational-cron-secret: SEU_SECRETO
```

## Migration

`supabase/migrations/20260806160000_whatsapp_reminder_queue.sql` (SQL Editor se `db push` não aplicar).

## Deploy

```bash
npm run supabase:deploy-operational-reminders
```
