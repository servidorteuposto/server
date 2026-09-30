import {
  MANDATORY_PLATES_STORAGE_BUCKET,
  getStandardPlateTemplate,
} from '../config/mandatory-plates'
import { prepareImageUpload } from './image-webp'
import { getSignedObjectUrl, removeObjects, uploadObject } from './object-storage'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type MandatoryPlate = {
  id: string
  posto_id: string
  plate_key: string
  title: string
  is_standard: boolean
  sort_order: number
  photo_path: string | null
  photo_name: string | null
  photo_latitude: number | null
  photo_longitude: number | null
  photo_captured_at: string | null
  created_at: string
  updated_at: string
}

export type LivePhotoCapture = {
  file: File
  latitude: number
  longitude: number
  capturedAt: string
}

export type SaveMandatoryPlateInput = {
  postoId: string
  plateKey: string
  title: string
  isStandard: boolean
  sortOrder: number
  existing?: MandatoryPlate | null
  photo: LivePhotoCapture
}

export { getMyPostoId }

export async function listMandatoryPlates(postoId: string) {
  const { data, error } = await supabase
    .from('mandatory_plates')
    .select('*')
    .eq('posto_id', postoId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as MandatoryPlate[]
}

export async function getMandatoryPlateFileUrl(path: string) {
  return getSignedObjectUrl(MANDATORY_PLATES_STORAGE_BUCKET, path, 60 * 60)
}

export async function createCustomMandatoryPlate(input: {
  postoId: string
  plateKey: string
  title: string
  sortOrder: number
}) {
  const title = input.title.trim()
  const { data, error } = await supabase
    .from('mandatory_plates')
    .insert({
      posto_id: input.postoId,
      plate_key: input.plateKey,
      title,
      is_standard: false,
      sort_order: input.sortOrder,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as MandatoryPlate
}

export async function saveMandatoryPlate(input: SaveMandatoryPlateInput) {
  const plateId = input.existing?.id ?? crypto.randomUUID()
  const title =
    getStandardPlateTemplate(input.plateKey)?.title ?? input.title.trim()
  const prepared = await prepareImageUpload(input.photo.file, input.photo.file.name || 'placa.jpg')
  const photoPath = `${input.postoId}/${plateId}/photo.${prepared.extension}`
  const previousPath = input.existing?.photo_path ?? null
  const uploadedPaths: string[] = []

  try {
    await uploadObject(
      MANDATORY_PLATES_STORAGE_BUCKET,
      photoPath,
      prepared.file,
      prepared.contentType,
    )
    uploadedPaths.push(photoPath)

    const payload = {
      id: plateId,
      posto_id: input.postoId,
      plate_key: input.plateKey,
      title,
      is_standard: input.isStandard,
      sort_order: input.sortOrder,
      photo_path: photoPath,
      photo_name: prepared.file.name,
      photo_latitude: input.photo.latitude,
      photo_longitude: input.photo.longitude,
      photo_captured_at: input.photo.capturedAt,
    }

    const query = input.existing
      ? supabase.from('mandatory_plates').update(payload).eq('id', plateId)
      : supabase.from('mandatory_plates').insert(payload)

    const { data, error } = await query.select('*').single()
    if (error) throw error

    if (previousPath && previousPath !== photoPath) {
      await removeObjects(MANDATORY_PLATES_STORAGE_BUCKET, [previousPath])
    }

    return data as MandatoryPlate
  } catch (error) {
    await removeObjects(MANDATORY_PLATES_STORAGE_BUCKET, uploadedPaths)
    throw error
  }
}

export async function deleteMandatoryPlate(plate: MandatoryPlate) {
  if (plate.is_standard) {
    throw new Error('standard_plate_cannot_delete')
  }

  const { error } = await supabase.from('mandatory_plates').delete().eq('id', plate.id)
  if (error) throw error

  if (plate.photo_path) {
    await removeObjects(MANDATORY_PLATES_STORAGE_BUCKET, [plate.photo_path])
  }
}
