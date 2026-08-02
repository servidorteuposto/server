# Mercado Pago — Teu Posto

Assinatura **R$ 99,00 / 30 dias** via Mercado Pago.

## Webhook — por que é a URL do Supabase?

Neste projeto o backend de pagamento roda em **Edge Functions do Supabase**, não em rotas do Vercel/Next.
Por isso a URL correta é:

```
https://jilzklxnejztpphbryti.supabase.co/functions/v1/mercadopago-webhook
```

(Em outros apps, como um Next.js com `/api/mercadopago/webhook`, a URL seria do domínio do site. Aqui o domínio do app **não** processa o webhook.)

O checkout já envia `notification_url` em cada pagamento/preferência (tem prioridade sobre o painel).
Ainda assim, configure no painel do MP (**Sua integração → Webhooks**):

- URL de produção: a URL acima
- Eventos: **Payments**, **Plans and Subscriptions** (preapproval / authorized_payment), e se aparecer **Merchant Order**

Opcional com secret:

```
https://jilzklxnejztpphbryti.supabase.co/functions/v1/mercadopago-webhook?secret=SEU_SECRETO&source_news=webhooks
```

## Secrets (Supabase → Edge Functions → Secrets)

| Secret | Descrição |
| --- | --- |
| `MP_ACCESS_TOKEN` | Access Token do Mercado Pago (produção). **Nunca** no front. |
| `MP_WEBHOOK_SECRET` | Secret Signature da tela Webhooks do MP (valida `x-signature` HMAC). Opcional mas recomendado. |
| `APP_PUBLIC_URL` | Opcional — padrão `https://www.appteuposto.com.br` |

## Proteções

- Preço fixo no servidor (R$ 99); cliente não define valor.
- Liberação só com status `approved` consultado na API do MP (não confia no body do webhook).
- Ativação rejeitada se o valor for diferente de R$ 99.
- Checkout exige e-mail igual ao cadastro do CNPJ + limite de tentativas por janela.
- Cancelar/reembolso exigem login do titular (`mercadopago-billing` com JWT).
- Access Token só em secrets de Edge Function.


## Fluxo

| Método | Liberação |
| --- | --- |
| PIX | Automática quando o pagamento é `approved` |
| Boleto | Quando compensado (`approved`) |
| Cartão único | No `approved` do Checkout Pro |
| Cartão recorrente | Na autorização do Preapproval e nas cobranças seguintes (+30 dias) |

## Cancelamento e reembolso

Na tela **Configurações**:

- **Cancelar plano** — só para cartão recorrente: cancela o preapproval no MP, mantém os dias já pagos.
- **Solicitar reembolso** — até 7 dias após pagamento `approved`; abre chamado `[REEMBOLSO]` para a equipe e interrompe renovação.

Função autenticada: `mercadopago-billing` (`cancel_plan` / `request_refund`).

## Deploy

```bash
npm run supabase:deploy-mp-checkout
npm run supabase:deploy-mp-webhook
npm run supabase:deploy-mp-billing
```
