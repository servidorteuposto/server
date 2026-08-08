import { supabase } from './supabase'

type PresignResponse = {
  ok: boolean
  url?: string
  message?: string
  contentType?: string
}

async function invokeR2<T extends PresignResponse>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('r2-storage', { body })
  if (error) throw error
  const payload = data as T
  if (!payload?.ok) {
    throw new Error(payload?.message || 'r2_storage_failed')
  }
  return payload
}

export async function uploadObject(
  bucket: string,
  path: string,
  file: Blob,
  contentType?: string,
) {
  const type = contentType || file.type || 'application/octet-stream'
  const { url } = await invokeR2({
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

export async function getSignedObjectUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
  options?: { publicSlug?: string },
) {
  const { url } = await invokeR2({
    action: 'presign-download',
    bucket,
    path,
    expiresIn,
    publicSlug: options?.publicSlug,
  })
  if (!url) throw new Error('presign_download_failed')
  return url
}

export async function removeObjects(bucket: string, paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((item): item is string => Boolean(item)))]
  if (!unique.length) return

  await invokeR2({
    action: 'delete',
    bucket,
    paths: unique,
  })
}
