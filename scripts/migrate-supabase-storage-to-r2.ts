/**
 * Migra todos os objetos do Supabase Storage para o Cloudflare R2.
 *
 * Requisitos (.env.r2 + vars Supabase):
 *   R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   deno run -A scripts/migrate-supabase-storage-to-r2.ts
 *   deno run -A scripts/migrate-supabase-storage-to-r2.ts --cleanup
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const LOGICAL_BUCKETS = [
  'regulatory-documents',
  'work-safety-documents',
  'work-safety-employee-files',
  'fuel-analyses',
  'diesel-drainages',
  'nozzle-metrology',
  'mandatory-equipments',
  'posto-assets',
  'support-attachments',
  'admin-secure-files',
] as const

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Falta variável de ambiente: ${name}`)
  return value
}

function loadDotEnvR2() {
  try {
    const text = Deno.readTextFileSync(new URL('../.env.r2', import.meta.url))
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!Deno.env.get(key)) Deno.env.set(key, value)
    }
  } catch {
    /* optional */
  }
}

async function listAllPaths(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  prefix = '',
): Promise<string[]> {
  const paths: string[] = []
  const pageSize = 100
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    if (!data?.length) break

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      // Pasta: id sem metadata.size / id terminando sem extensão comum — list recursivo
      const isFolder = entry.id === null || (entry.metadata == null && !entry.name.includes('.'))
      if (isFolder && entry.name && !entry.metadata?.size) {
        const nested = await listAllPaths(supabase, bucket, full)
        paths.push(...nested)
      } else if (entry.name) {
        paths.push(full)
      }
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  return paths
}

async function main() {
  loadDotEnvR2()
  const cleanup = Deno.args.includes('--cleanup')

  const supabaseUrl = requiredEnv('SUPABASE_URL')
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const accountId = requiredEnv('R2_ACCOUNT_ID')
  const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY')
  const r2Bucket = requiredEnv('R2_BUCKET')
  const endpoint =
    Deno.env.get('R2_ENDPOINT')?.trim() || `https://${accountId}.r2.cloudflarestorage.com`

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const r2 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  let ok = 0
  let failed = 0
  let bytes = 0

  for (const bucket of LOGICAL_BUCKETS) {
    console.log(`\n== Bucket ${bucket} ==`)
    let paths: string[] = []
    try {
      paths = await listAllPaths(supabase, bucket)
    } catch (error) {
      console.error(`  falha ao listar:`, error)
      continue
    }
    console.log(`  ${paths.length} objeto(s)`)

    for (const path of paths) {
      try {
        const { data, error } = await supabase.storage.from(bucket).download(path)
        if (error || !data) throw error ?? new Error('download_failed')

        const body = new Uint8Array(await data.arrayBuffer())
        const contentType = data.type || 'application/octet-stream'
        const key = `${bucket}/${path}`
        const url = `${endpoint}/${r2Bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
        const put = await r2.fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body,
        })
        if (!put.ok) {
          const text = await put.text().catch(() => '')
          throw new Error(`PUT ${put.status} ${text.slice(0, 120)}`)
        }

        ok += 1
        bytes += body.byteLength
        console.log(`  OK ${key} (${body.byteLength} bytes)`)

        if (cleanup) {
          const { error: removeError } = await supabase.storage.from(bucket).remove([path])
          if (removeError) {
            console.warn(`  aviso: não removeu do Supabase ${path}:`, removeError.message)
          } else {
            console.log(`  removido do Supabase ${path}`)
          }
        }
      } catch (error) {
        failed += 1
        console.error(`  FALHA ${bucket}/${path}`, error)
      }
    }
  }

  console.log('\n==== Relatório ====')
  console.log(`OK: ${ok}`)
  console.log(`Falhas: ${failed}`)
  console.log(`Bytes enviados: ${bytes}`)
  if (!cleanup) {
    console.log('Dica: rode de novo com --cleanup para apagar do Supabase após validar o app.')
  }
}

if (import.meta.main) {
  await main()
}
