# r2-storage

Edge Function que gera URLs assinadas (PUT/GET/DELETE) para o Cloudflare R2.

## Secrets necessárias

```
R2_BUCKET
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ENDPOINT   # opcional: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Configure com:

```bash
npm run supabase:set-r2-secrets
```

(depois de preencher `.env.r2` a partir de `.env.r2.example`)

## Deploy

```bash
npm run supabase:deploy-r2-storage
```

## Migração Supabase → R2

```bash
# precisa SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no ambiente
npm run storage:migrate-r2

# após validar o app:
npm run storage:cleanup-supabase
# ou: deno run -A scripts/migrate-supabase-storage-to-r2.ts --cleanup
```
