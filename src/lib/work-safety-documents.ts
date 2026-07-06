import {
  WORK_SAFETY_STORAGE_BUCKET,
  type WorkSafetyTemplateKey,
} from '../config/work-safety'
import { supabase } from './supabase'

export type WorkSafetyDocument = {
  id: string
  posto_id: string
  template_key: WorkSafetyTemplateKey | null
  title: string
  issued_at: string
  expires_at: string | null
  storage_path: string
  preview_storage_path: string | null
  file_name: string
  file_size: number
  preview_file_size: number | null
  created_at: string
  updated_at: string
}

export type SaveWorkSafetyDocumentInput = {
  postoId: string
  title: string
  templateKey: WorkSafetyTemplateKey
  issuedAt: string
  expiresAt: string | null
  file: File
  existingId?: string
  existingStoragePath?: string
  existingPreviewPath?: string | null
}

export { getMyPostoId } from './regulatory-documents'

export async function listWorkSafetyDocuments(postoId: string) {
  const { data, error } = await supabase
    .from('work_safety_documents')
    .select('*')
    .eq('posto_id', postoId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as WorkSafetyDocument[]
}

function buildOriginalPath(postoId: string, documentId: string) {
  return `${postoId}/${documentId}/original.pdf`
}

function buildPreviewPath(postoId: string, documentId: string) {
  return `${postoId}/${documentId}/preview.pdf`
}

async function removeStorageObjects(paths: Array<string | null | undefined>) {
  const uniquePaths = [...new Set(paths.filter(Boolean))] as string[]
  if (!uniquePaths.length) return

  const { error } = await supabase.storage.from(WORK_SAFETY_STORAGE_BUCKET).remove(uniquePaths)
  if (error) throw error
}

export function getWorkSafetyDocumentPreviewPath(document: WorkSafetyDocument) {
  return document.preview_storage_path ?? document.storage_path
}

export function getWorkSafetyDocumentOriginalPath(document: WorkSafetyDocument) {
  return document.storage_path
}

export async function saveWorkSafetyDocument(input: SaveWorkSafetyDocumentInput) {
  const { preparePdfUpload } = await import('./pdf-compress')
  const documentId = input.existingId ?? crypto.randomUUID()
  const originalPath = buildOriginalPath(input.postoId, documentId)
  const prepared = await preparePdfUpload(input.file)

  const shouldStoreSeparatePreview =
    prepared.compressed && prepared.previewSize < prepared.originalSize
  const previewPath = shouldStoreSeparatePreview
    ? buildPreviewPath(input.postoId, documentId)
    : originalPath

  const pathsToRemove = new Set<string>()
  if (input.existingStoragePath) pathsToRemove.add(input.existingStoragePath)
  if (input.existingPreviewPath && input.existingPreviewPath !== input.existingStoragePath) {
    pathsToRemove.add(input.existingPreviewPath)
  }
  pathsToRemove.delete(originalPath)
  pathsToRemove.delete(previewPath)
  await removeStorageObjects([...pathsToRemove])

  const { error: originalUploadError } = await supabase.storage
    .from(WORK_SAFETY_STORAGE_BUCKET)
    .upload(originalPath, prepared.originalFile, {
      upsert: true,
      contentType: 'application/pdf',
    })

  if (originalUploadError) throw originalUploadError

  if (shouldStoreSeparatePreview) {
    const { error: previewUploadError } = await supabase.storage
      .from(WORK_SAFETY_STORAGE_BUCKET)
      .upload(previewPath, prepared.previewFile, {
        upsert: true,
        contentType: 'application/pdf',
      })

    if (previewUploadError) {
      await removeStorageObjects([originalPath])
      throw previewUploadError
    }
  }

  const row = {
    id: documentId,
    posto_id: input.postoId,
    template_key: input.templateKey,
    title: input.title.trim(),
    issued_at: input.issuedAt,
    expires_at: input.expiresAt || null,
    storage_path: originalPath,
    preview_storage_path: previewPath,
    file_name: input.file.name,
    file_size: prepared.originalSize,
    preview_file_size: shouldStoreSeparatePreview ? prepared.previewSize : prepared.originalSize,
  }

  if (input.existingId) {
    const { data, error } = await supabase
      .from('work_safety_documents')
      .update(row)
      .eq('id', input.existingId)
      .select('*')
      .single()

    if (error) {
      await removeStorageObjects([originalPath, previewPath])
      throw error
    }

    return data as WorkSafetyDocument
  }

  const { data, error } = await supabase
    .from('work_safety_documents')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    await removeStorageObjects([originalPath, previewPath])
    throw error
  }

  return data as WorkSafetyDocument
}

export async function getWorkSafetyDocumentUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from(WORK_SAFETY_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('signed_url_failed')

  return data.signedUrl
}

export async function downloadWorkSafetyDocument(document: WorkSafetyDocument) {
  const url = await getWorkSafetyDocumentUrl(getWorkSafetyDocumentOriginalPath(document))
  const response = await fetch(url)

  if (!response.ok) throw new Error('download_failed')

  const blob = await response.blob()
  const blobUrl = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = blobUrl
  anchor.download = document.file_name
  anchor.rel = 'noopener'
  window.document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(blobUrl)
}
