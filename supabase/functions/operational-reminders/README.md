# Lembretes operacionais (WhatsApp / Meta Cloud API)

Edge Function que envia avisos WhatsApp (templates) para os números `aviso_whatsapp_1..5` (ou `telefone` do posto).

## Fila

1. No horário do marco, o aviso entra em `whatsapp_reminder_queue` com `template_name` + `template_params`.
2. Só sai da fila e vai para `whatsapp_reminder_sends` **depois** do envio com sucesso via Graph API.
3. Se Meta não estiver configurada ou o envio falhar, os itens ficam pendentes até o próximo cron.

## O que envia

| Tipo | Template | Frequência |
| --- | --- | --- |
| Renovação de plano | `aviso_assinatura_7d` / `aviso_assinatura_2d` | 7 e 2 dias antes |
| Documentos / laudos | `aviso_doc_prazo` / `aviso_doc_vencido` | 30, 15, 7, 1, 0 |
| Metrologia | `aviso_metrologia` | no dia do vencimento (15 dias) |
| RAQ fora das especificações | `aviso_raq_fora` | no lançamento inapto (envio imediato; reenvio pela fila se falhar) |
| Drenagem diesel | `aviso_drenagem_diesel` | no dia do vencimento (7 dias) |
| RAQ | `aviso_raq1` | a cada 4 dias |

Só postos com `subscription_status = active` e pelo menos um WhatsApp cadastrado.

## Secrets

| Secret | Uso |
| --- | --- |
| `META_WHATSAPP_TOKEN` | Token permanente Cloud API |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Phone number ID |
| `META_GRAPH_API_VERSION` | Opcional (`v21.0`) |
| `OPERATIONAL_CRON_SECRET` | Header `x-operational-cron-secret` |

## Cron

Sugestão: a cada **1–2 horas**.

```http
POST https://jilzklxnejztpphbryti.supabase.co/functions/v1/operational-reminders
x-operational-cron-secret: SEU_SECRETO
```

## Migration

- `supabase/migrations/20260806160000_whatsapp_reminder_queue.sql`
- `supabase/migrations/20260812120000_whatsapp_queue_meta_templates.sql`

## Deploy

```bash
npm run supabase:deploy-operational-reminders
```
