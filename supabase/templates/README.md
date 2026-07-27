# Templates de e-mail (Supabase Auth)

## Recuperação de senha

1. Abra o [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **Email Templates**.
2. Selecione **Reset password** (Recuperação de senha).
3. **Subject:**
   ```
   Recuperação de senha — Teu Posto
   ```
4. Cole o conteúdo de `recovery.html` no corpo da mensagem.
5. Salve.

### Logo no e-mail

O template usa:

```
https://www.appteuposto.com.br/imagens/logo_teuposto.png
```

Confirme que `public/imagens/logo_teuposto.png` está publicado na Vercel.

### Variáveis Supabase

- `{{ .ConfirmationURL }}` — link de redefinição (obrigatório no botão)
- `{{ .Email }}` — e-mail do destinatário

Não remova `{{ .ConfirmationURL }}` ou o link deixa de funcionar.
