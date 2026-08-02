# Mercado Pago — Teu Posto

Assinatura **R$ 99,00 / 30 dias** via Mercado Pago.

## Webhook (cole no painel do MP)

```
https://jilzklxnejztpphbryti.supabase.co/functions/v1/mercadopago-webhook
```

Eventos recomendados: **Payments** e **Subscriptions / Preapproval**.

Se configurar `MP_WEBHOOK_SECRET` nas secrets da function, use a URL com query:

```
https://jilzklxnejztpphbryti.supabase.co/functions/v1/mercadopago-webhook?secret=SEU_SECRETO
```

(ou envie o mesmo valor no header `x-webhook-secret`)

## Secrets (Supabase → Edge Functions → Secrets)

| Secret | Descrição |
| --- | --- |
| `MP_ACCESS_TOKEN` | Access Token do Mercado Pago (teste ou produção) |
| `MP_WEBHOOK_SECRET` | Opcional — segredo compartilhado do webhook |
| `APP_PUBLIC_URL` | Opcional — padrão `https://www.appteuposto.com.br` |

## Fluxo

| Método | Liberação |
| --- | --- |
| PIX | Automática quando o pagamento é `approved` (webhook) |
| Boleto | Quando compensado (`approved`, em geral próximo dia útil) |
| Cartão único | No `approved` do Checkout Pro |
| Cartão recorrente | Na autorização do Preapproval e nas cobranças seguintes (+30 dias) |

A ativação **não** é feita pelo front — só pelo webhook/`activate_or_extend_subscription`.

## Deploy das functions

```bash
npx supabase functions deploy mercadopago-checkout --project-ref jilzklxnejztpphbryti --no-verify-jwt --use-api
npx supabase functions deploy mercadopago-webhook --project-ref jilzklxnejztpphbryti --no-verify-jwt --use-api
```

## Avisos no app

- **1 dia antes** do vencimento: banner amarelo
- **No dia** do vencimento: banner vermelho
- Assinatura **recorrente** também recebe os avisos (cobrança automática + lembrete)
