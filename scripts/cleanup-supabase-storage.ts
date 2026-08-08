/**
 * Remove objetos dos buckets Supabase após migração validada para o R2.
 *
 * Uso:
 *   deno run -A scripts/cleanup-supabase-storage.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

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
  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let removed = 0
  for (const bucket of LOGICAL_BUCKETS) {
    console.log(`\n== ${bucket} ==`)
    const paths = await listAllPaths(supabase, bucket)
    console.log(`  ${paths.length} objeto(s)`)
    for (let i = 0; i < paths.length; i += 50) {
      const chunk = paths.slice(i, i + 50)
      const { error } = await supabase.storage.from(bucket).remove(chunk)
      if (error) {
        console.error('  falha ao remover chunk', error.message)
      } else {
        removed += chunk.length
        console.log(`  removidos ${chunk.length}`)
      }
    }
  }
  console.log(`\nTotal removido: ${removed}`)
}

if (import.meta.main) {
  await main()
}
