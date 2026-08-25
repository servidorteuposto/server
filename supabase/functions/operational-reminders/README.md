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
| Documentos regulatórios | `aviso_doc_prazo` / `aviso_doc_vencido` | só depois de cadastrar o documento; 30, 15, 7, 1 e 0 dias |
| Laudos (Seg. do Trabalho) | `aviso_laudos_de_engenharia_e_saude_ocupacional` | só depois de cadastrar o laudo; 30, 15, 7, 1 e 0 dias antes |
| Cursos NR-20/NR-35 | `aviso_treinamentos` | só depois de anexar o certificado; 30, 15, 7, 1 e 0 dias antes |
| Assinatura vencida | `aviso_assinatura_vencida` | quando o admin pausa o acesso ou o plano expira |
| Metrologia | `aviso_metrologia` | só depois da primeira verificação; 15 dias depois do último lançamento |
| RAQ fora das especificações | `aviso_raq_fora` | no lançamento inapto (envia na hora; se a Meta falhar, fica na fila) |
| Metrologia reprovada | `aviso_metrologia_fora` | no lançamento reprovado (envia na hora; se a Meta falhar, fica na fila) |
| Drenagem diesel | `aviso_drenagem_diesel` | só depois da primeira drenagem; 7 dias depois do último lançamento |
| RAQ | `aviso_raq1` | só depois do primeiro RAQ; 7 dias após o último lançamento (a contagem reinicia se lançar de novo) |

Só postos com `subscription_status = active` e pelo menos um WhatsApp cadastrado.

## Secrets

| Secret | Uso |
| --- | --- |
| `META_WHATSAPP_TOKEN` | Token permanente Cloud API |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Phone number ID |
| `META_GRAPH_API_VERSION` | Opcional (`v21.0`) |
| `OPERATIONAL_CRON_SECRET` | Header `x-operational-cron-secret` |

## Horário

Envios periódicos só das **08:00 às 18:00** em `America/Sao_Paulo`, qualquer dia da semana. Avisos imediatos (RAQ/metrologia fora) saem na hora do lançamento; se falharem, a fila também é processada fora do horário comercial.

## Cron

Das 08:05 às 17:05 em Brasília (`5 11-20 * * *` em UTC).

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
