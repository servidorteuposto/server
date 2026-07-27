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

## Boas-vindas (Resend via secure-auth)

Enviado automaticamente ao concluir o cadastro pela Edge Function `secure-auth`.
Referência visual: `welcome.html`.

Secrets / env da function:

- `RESEND_API_KEY` — obrigatório
- `AUTH_EMAIL_FROM` — ex.: `Teu Posto <noreply@appteuposto.com.br>` (fallback: `SECURITY_EMAIL_FROM`)
- `APP_PUBLIC_URL` — opcional, padrão `https://www.appteuposto.com.br`

Após alterar a function:

```bash
npm run supabase:deploy-auth
```

### Logo

```
https://www.appteuposto.com.br/imagens/logo_teuposto.png
```
