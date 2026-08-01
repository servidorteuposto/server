# Templates de e-mail

## Desativar verificação de e-mail (obrigatório)

O cadastro já cria a conta **confirmada** (`email_confirm: true`). Para o Supabase não mandar e-mail de verificação:

1. **Authentication → Providers → Email**
2. Desative **Confirm email**
3. Salve

## Recuperação de senha (Supabase Auth)

1. **Authentication → Email Templates → Reset password**
2. **Subject:** `Recuperação de senha — Teu Posto`
3. Cole o conteúdo de `recovery.html`
4. Salve

Variáveis: `{{ .ConfirmationURL }}`, `{{ .Email }}`

## Boas-vindas e avisos (Resend)

Enviados pelas Edge Functions (`secure-auth`, `send-security-alert`, `diesel-drainage-reminders`).
Referência visual: `welcome.html`.

Secrets / env das functions:

| Secret | Exemplo | Uso |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_...` | obrigatório |
| `AUTH_EMAIL_FROM` | `Teu Posto <noreply@appteuposto.com.br>` | remetente (boas-vindas) |
| `SECURITY_EMAIL_FROM` | `Teu Posto Segurança <noreply@appteuposto.com.br>` | alertas |
| `DRAINAGE_EMAIL_FROM` | `Teu Posto Avisos <noreply@appteuposto.com.br>` | drenagem |
| `SUPPORT_EMAIL_REPLY_TO` | `Teu Posto Suporte <suporte@appteuposto.com.br>` | Reply-To (padrão) |
| `APP_PUBLIC_URL` | `https://www.appteuposto.com.br` | links e logo |

Remetente padrão: `noreply@appteuposto.com.br`  
Resposta padrão: `suporte@appteuposto.com.br`

O helper de envio fica em `supabase/functions/<nome>/resend.ts` (Reply-To para suporte).

Após alterar as functions:

```bash
npm run supabase:deploy-functions
```

### Logo

```
https://www.appteuposto.com.br/imagens/logo_teuposto.png
```

## Domínio e caixa `suporte@appteuposto.com.br`

### 1) Resend (envio)

1. Em [resend.com/domains](https://resend.com/domains), adicione `appteuposto.com.br`
2. Crie os registros DNS (SPF / DKIM / opcional DMARC) que o Resend indicar
3. Aguarde status **Verified**
4. Confirme que o from usa `@appteuposto.com.br` (já é o padrão no código)

### 2) Cloudflare Email Routing (receber e cair no Gmail)

O Resend **só envia**. Para a pessoa responder e a mensagem chegar no Gmail de vocês:

1. No Cloudflare do domínio `appteuposto.com.br` → **Email** → **Email Routing** → ative
2. Adicione destino: o Gmail da equipe (ex.: `servidorteuposto@gmail.com`) e confirme o e-mail
3. Crie regra:
   - **Custom address:** `suporte@appteuposto.com.br`
   - **Action:** Forward to → Gmail da equipe
4. Publique os registros MX / TXT que o Cloudflare pedir (se ainda não existirem)

Pronto: e-mails saem como `@appteuposto.com.br` e respostas para `suporte@` caem no Gmail.
