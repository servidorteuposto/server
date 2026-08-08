/**
 * Migra objetos do Supabase Storage → Cloudflare R2 (Node).
 *
 * Uso:
 *   node scripts/migrate-supabase-storage-to-r2.mjs
 *   node scripts/migrate-supabase-storage-to-r2.mjs --cleanup
 */

import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
]

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* optional */
  }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta variável de ambiente: ${name}`)
  return value
}

async function listAllPaths(supabase, bucket, prefix = '') {
  const paths = []
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
      const isFolder = entry.id === null || (entry.metadata == null && !entry.name.includes('.'))
      if (isFolder && entry.name && !entry.metadata?.size) {
        paths.push(...(await listAllPaths(supabase, bucket, full)))
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
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  loadEnvFile(resolve(root, '.env.r2'))

  const cleanup = process.argv.includes('--cleanup')
  const supabaseUrl = required('SUPABASE_URL')
  const serviceRole = required('SUPABASE_SERVICE_ROLE_KEY')
  const accountId = required('R2_ACCOUNT_ID')
  const accessKeyId = required('R2_ACCESS_KEY_ID')
  const secretAccessKey = required('R2_SECRET_ACCESS_KEY')
  const r2Bucket = required('R2_BUCKET')
  const endpoint =
    process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`

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
    let paths = []
    try {
      paths = await listAllPaths(supabase, bucket)
    } catch (error) {
      console.error('  falha ao listar:', error)
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
    console.log('Dica: rode com --cleanup para apagar do Supabase após validar o app.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
