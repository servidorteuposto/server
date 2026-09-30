import { RESIDUE_COLLECTION_STORAGE_BUCKET } from '../config/residue-collection'
import { prepareImageUpload } from './image-webp'
import { getSignedObjectUrl, removeObjects, uploadObject } from './object-storage'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type ResidueCollection = {
  id: string
  posto_id: string
  collected_at: string
  notes: string | null
  operator_full_name: string | null
  signature_storage_path: string | null
  photo_path: string
  photo_name: string | null
  photo_latitude: number
  photo_longitude: number
  photo_captured_at: string
  created_at: string
}

export type LivePhotoCapture = {
  file: File
  latitude: number
  longitude: number
  capturedAt: string
}

export type SaveResidueCollectionInput = {
  postoId: string
  collectedAt: string
  notes: string
  operatorFullName: string
  signatureBlob: Blob
  photo: LivePhotoCapture
}

export { getMyPostoId }

export async function listResidueCollections(postoId: string) {
  const { data, error } = await supabase
    .from('residue_collections')
    .select('*')
    .eq('posto_id', postoId)
    .order('collected_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ResidueCollection[]
}

export async function getResidueCollectionPhotoUrl(path: string) {
  return getSignedObjectUrl(RESIDUE_COLLECTION_STORAGE_BUCKET, path, 60 * 60)
}

export async function getResidueCollectionSignatureUrl(path: string) {
  return getSignedObjectUrl(RESIDUE_COLLECTION_STORAGE_BUCKET, path, 60 * 60)
}

export async function saveResidueCollection(input: SaveResidueCollectionInput) {
  const collectionId = crypto.randomUUID()
  const signaturePrepared = await prepareImageUpload(input.signatureBlob, 'signature.png')
  const photoPrepared = await prepareImageUpload(input.photo.file, input.photo.file.name || 'residuos.jpg')
  const signaturePath = `${input.postoId}/${collectionId}/signature.${signaturePrepared.extension}`
  const photoPath = `${input.postoId}/${collectionId}/photo.${photoPrepared.extension}`
  const uploadedPaths: string[] = []

  try {
    await uploadObject(
      RESIDUE_COLLECTION_STORAGE_BUCKET,
      signaturePath,
      signaturePrepared.file,
      signaturePrepared.contentType,
    )
    uploadedPaths.push(signaturePath)

    await uploadObject(
      RESIDUE_COLLECTION_STORAGE_BUCKET,
      photoPath,
      photoPrepared.file,
      photoPrepared.contentType,
    )
    uploadedPaths.push(photoPath)

    const notes = input.notes.trim() || null

    const { data, error } = await supabase
      .from('residue_collections')
      .insert({
        id: collectionId,
        posto_id: input.postoId,
        collected_at: input.collectedAt,
        notes,
        operator_full_name: input.operatorFullName.trim(),
        signature_storage_path: signaturePath,
        photo_path: photoPath,
        photo_name: photoPrepared.file.name,
        photo_latitude: input.photo.latitude,
        photo_longitude: input.photo.longitude,
        photo_captured_at: input.photo.capturedAt,
      })
      .select('*')
      .single()

    if (error) throw error
    return data as ResidueCollection
  } catch (error) {
    await removeObjects(RESIDUE_COLLECTION_STORAGE_BUCKET, uploadedPaths)
    throw error
  }
}
