/**
 * Configura CORS no bucket R2 para o app (uploads PUT e fetch GET de PDFs/imagens).
 * Uso: node scripts/set-r2-cors.mjs
 * Requer .env.r2 com R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AwsClient } from 'aws4fetch'

function loadEnvR2() {
  const path = resolve(process.cwd(), '.env.r2')
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvR2()

const accountId = process.env.R2_ACCOUNT_ID?.trim()
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
const bucket = process.env.R2_BUCKET?.trim()
const endpoint =
  process.env.R2_ENDPOINT?.trim() ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')

if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint) {
  console.error('Faltam variáveis R2 em .env.r2')
  process.exit(1)
}

const corsXml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>https://www.appteuposto.com.br</AllowedOrigin>
    <AllowedOrigin>https://appteuposto.com.br</AllowedOrigin>
    <AllowedOrigin>http://localhost:5173</AllowedOrigin>
    <AllowedOrigin>http://127.0.0.1:5173</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Content-Type</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`

const client = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: 'auto',
})

const url = `${endpoint}/${bucket}?cors`
const response = await client.fetch(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/xml' },
  body: corsXml,
})

const text = await response.text().catch(() => '')
if (!response.ok) {
  console.error('Falha ao configurar CORS:', response.status, text.slice(0, 500))
  process.exit(1)
}

console.log('CORS do bucket R2 atualizado com sucesso.')
