import { supabase } from './supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type PresignResponse = {
  ok: boolean
  url?: string
  message?: string
  contentType?: string
}

async function invokeR2Json<T extends PresignResponse>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('r2-storage', { body })
  if (error) throw error
  const payload = data as T
  if (!payload?.ok) {
    throw new Error(payload?.message || 'r2_storage_failed')
  }
  return payload
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token || supabaseAnonKey}`,
    'Content-Type': 'application/json',
  }
}

/** Download via Edge Function (proxy) — o browser não precisa falar com o host do R2. */
async function downloadViaProxy(
  bucket: string,
  path: string,
  options?: { publicSlug?: string },
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/r2-storage`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      action: 'download',
      bucket,
      path,
      publicSlug: options?.publicSlug,
    }),
  })

  if (!response.ok) {
    let message = `r2_download_failed:${response.status}`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) message = payload.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  const buffer = await response.arrayBuffer()
  return {
    bytes: new Uint8Array(buffer),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  }
}

export async function uploadObject(
  bucket: string,
  path: string,
  file: Blob,
  contentType?: string,
) {
  const type = contentType || file.type || 'application/octet-stream'
  const { url } = await invokeR2Json({
    action: 'presign-upload',
    bucket,
    path,
    contentType: type,
    expiresIn: 60 * 30,
  })

  if (!url) throw new Error('presign_upload_failed')

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body: file,
  })

  if (!response.ok) {
    throw new Error(`r2_upload_failed:${response.status}`)
  }
}

export async function getSignedObjectBytes(
  bucket: string,
  path: string,
  _expiresIn = 3600,
  options?: { publicSlug?: string },
) {
  return downloadViaProxy(bucket, path, options)
}

export async function getSignedObjectUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
  options?: { publicSlug?: string },
) {
  const { bytes, contentType } = await getSignedObjectBytes(bucket, path, expiresIn, options)
  const lower = path.toLowerCase()
  const type =
    contentType && contentType !== 'application/octet-stream'
      ? contentType
      : lower.endsWith('.pdf')
        ? 'application/pdf'
        : contentType || 'application/octet-stream'
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy], { type })
  return URL.createObjectURL(blob)
}

export async function removeObjects(bucket: string, paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((item): item is string => Boolean(item)))]
  if (!unique.length) return

  await invokeR2Json({
    action: 'delete',
    bucket,
    paths: unique,
  })
}
