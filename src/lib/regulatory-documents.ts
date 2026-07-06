import {
  REGULATORY_STORAGE_BUCKET,
  type RegulatoryTemplateKey,
} from '../config/regulatory-documents'
import { supabase } from './supabase'

export type RegulatoryDocument = {
  id: string
  posto_id: string
  template_key: RegulatoryTemplateKey | null
  title: string
  is_custom: boolean
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

export type SaveRegulatoryDocumentInput = {
  postoId: string
  title: string
  templateKey?: RegulatoryTemplateKey
  isCustom: boolean
  issuedAt: string
  expiresAt: string | null
  file: File
  existingId?: string
  existingStoragePath?: string
  existingPreviewPath?: string | null
}

export async function getMyPostoId(): Promise<string> {
  const { data, error } = await supabase.from('postos').select('id').maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error('posto_not_found')

  return data.id
}

export async function listRegulatoryDocuments(postoId: string) {
  const { data, error } = await supabase
    .from('regulatory_documents')
    .select('*')
    .eq('posto_id', postoId)
    .order('is_custom', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as RegulatoryDocument[]
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

  const { error } = await supabase.storage.from(REGULATORY_STORAGE_BUCKET).remove(uniquePaths)
  if (error) throw error
}

export function getDocumentPreviewPath(document: RegulatoryDocument) {
  return document.preview_storage_path ?? document.storage_path
}

export function getDocumentOriginalPath(document: RegulatoryDocument) {
  return document.storage_path
}

export async function saveRegulatoryDocument(input: SaveRegulatoryDocumentInput) {
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
    .from(REGULATORY_STORAGE_BUCKET)
    .upload(originalPath, prepared.originalFile, {
      upsert: true,
      contentType: 'application/pdf',
    })

  if (originalUploadError) throw originalUploadError

  if (shouldStoreSeparatePreview) {
    const { error: previewUploadError } = await supabase.storage
      .from(REGULATORY_STORAGE_BUCKET)
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
    template_key: input.templateKey ?? null,
    title: input.title.trim(),
    is_custom: input.isCustom,
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
      .from('regulatory_documents')
      .update(row)
      .eq('id', input.existingId)
      .select('*')
      .single()

    if (error) {
      await removeStorageObjects([originalPath, previewPath])
      throw error
    }

    return data as RegulatoryDocument
  }

  const { data, error } = await supabase.from('regulatory_documents').insert(row).select('*').single()

  if (error) {
    await removeStorageObjects([originalPath, previewPath])
    throw error
  }

  return data as RegulatoryDocument
}

export async function deleteCustomRegulatoryDocument(document: RegulatoryDocument) {
  if (!document.is_custom) {
    throw new Error('cannot_delete_template_document')
  }

  await removeStorageObjects([document.storage_path, document.preview_storage_path])

  const { error } = await supabase.from('regulatory_documents').delete().eq('id', document.id)
  if (error) throw error
}

export async function getRegulatoryDocumentUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from(REGULATORY_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('signed_url_failed')

  return data.signedUrl
}

export async function downloadRegulatoryDocument(document: RegulatoryDocument) {
  const url = await getRegulatoryDocumentUrl(getDocumentOriginalPath(document))
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('download_failed')
  }

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
