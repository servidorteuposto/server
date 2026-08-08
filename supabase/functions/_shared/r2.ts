import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

export const LOGICAL_BUCKETS = [
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

export type LogicalBucket = (typeof LOGICAL_BUCKETS)[number]

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
}

export function isLogicalBucket(value: string): value is LogicalBucket {
  return (LOGICAL_BUCKETS as readonly string[]).includes(value)
}

export function getR2Config(): R2Config {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')?.trim() ?? ''
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')?.trim() ?? ''
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')?.trim() ?? ''
  const bucket = Deno.env.get('R2_BUCKET')?.trim() ?? ''
  const endpoint =
    Deno.env.get('R2_ENDPOINT')?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    throw new Error('r2_not_configured')
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint }
}

export function isR2Configured() {
  try {
    getR2Config()
    return true
  } catch {
    return false
  }
}

export function objectKey(logicalBucket: string, path: string) {
  const clean = path.replace(/^\/+/, '').replace(/\\/g, '/')
  if (!clean || clean.includes('..')) {
    throw new Error('invalid_path')
  }
  return `${logicalBucket}/${clean}`
}

function createAwsClient(cfg: R2Config) {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

export async function presignR2Url(
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  expiresInSeconds: number,
  contentType?: string,
) {
  const cfg = getR2Config()
  const client = createAwsClient(cfg)
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`)
  url.searchParams.set('X-Amz-Expires', String(Math.max(60, Math.min(expiresInSeconds, 3600 * 24))))

  const headers: HeadersInit = {}
  if (method === 'PUT' && contentType) {
    headers['Content-Type'] = contentType
  }

  const signed = await client.sign(new Request(url.toString(), { method, headers }), {
    aws: { signQuery: true },
  })
  return signed.url
}

export async function getR2Object(key: string) {
  const cfg = getR2Config()
  const client = createAwsClient(cfg)
  const url = `${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  const response = await client.fetch(url, { method: 'GET' })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`r2_get_failed:${response.status}:${text.slice(0, 200)}`)
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const bytes = new Uint8Array(await response.arrayBuffer())
  return { bytes, contentType }
}

export async function putR2Object(key: string, body: BodyInit, contentType: string) {
  const cfg = getR2Config()
  const client = createAwsClient(cfg)
  const url = `${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  const response = await client.fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`r2_put_failed:${response.status}:${text.slice(0, 200)}`)
  }
}

export async function deleteR2Object(key: string) {
  const cfg = getR2Config()
  const client = createAwsClient(cfg)
  const url = `${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  const response = await client.fetch(url, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '')
    throw new Error(`r2_delete_failed:${response.status}:${text.slice(0, 200)}`)
  }
}

export async function listR2UsageByPrefix() {
  const cfg = getR2Config()
  const client = createAwsClient(cfg)
  const buckets: Array<{ bucket: string; bytes: number; objects: number }> = LOGICAL_BUCKETS.map(
    (bucket) => ({ bucket, bytes: 0, objects: 0 }),
  )
  const byBucket = new Map(buckets.map((row) => [row.bucket, row]))

  let continuation: string | undefined
  do {
    const url = new URL(`${cfg.endpoint}/${cfg.bucket}`)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('max-keys', '1000')
    if (continuation) url.searchParams.set('continuation-token', continuation)

    const response = await client.fetch(url.toString(), { method: 'GET' })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`r2_list_failed:${response.status}:${text.slice(0, 200)}`)
    }

    const xml = await response.text()
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) =>
      match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    )
    const sizes = [...xml.matchAll(/<Size>([^<]+)<\/Size>/g)].map((match) => Number(match[1]) || 0)

    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      const slash = key.indexOf('/')
      const logical = slash >= 0 ? key.slice(0, slash) : key
      const row = byBucket.get(logical)
      if (!row) continue
      row.objects += 1
      row.bytes += sizes[i] ?? 0
    }

    const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml)
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
    continuation = truncated && next ? next.replace(/&amp;/g, '&') : undefined
  } while (continuation)

  const totalBytes = buckets.reduce((sum, row) => sum + row.bytes, 0)
  return {
    storage_bytes: totalBytes,
    buckets: buckets.filter((row) => row.objects > 0 || row.bytes > 0),
  }
}
