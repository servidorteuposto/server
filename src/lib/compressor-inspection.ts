import { COMPRESSOR_INSPECTION_STORAGE_BUCKET } from '../config/compressor-inspection'
import { prepareImageUpload } from './image-webp'
import { getSignedObjectUrl, removeObjects, uploadObject } from './object-storage'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type CompressorInspection = {
  id: string
  posto_id: string
  inspected_at: string
  brand: string
  model: string
  serial_number: string
  capacity_liters: number
  manometer_ok: boolean | null
  safety_valve_ok: boolean | null
  oil_changed: boolean | null
  compressor_drained: boolean | null
  photo1_storage_path: string
  photo1_file_name: string | null
  photo1_latitude: number
  photo1_longitude: number
  photo1_captured_at: string
  photo2_storage_path: string
  photo2_file_name: string | null
  photo2_latitude: number
  photo2_longitude: number
  photo2_captured_at: string
  created_at: string
}

export type LivePhotoCapture = {
  file: File
  latitude: number
  longitude: number
  capturedAt: string
}

export type SaveCompressorInspectionInput = {
  postoId: string
  inspectedAt: string
  brand: string
  model: string
  serialNumber: string
  capacityLiters: number
  manometerOk: boolean
  safetyValveOk: boolean
  oilChanged: boolean
  compressorDrained: boolean
  photo1: LivePhotoCapture
  photo2: LivePhotoCapture
}

export { getMyPostoId }

export async function listCompressorInspections(postoId: string) {
  const { data, error } = await supabase
    .from('compressor_inspections')
    .select('*')
    .eq('posto_id', postoId)
    .order('inspected_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as CompressorInspection[]
}

export async function getCompressorInspectionPhotoUrl(path: string) {
  return getSignedObjectUrl(COMPRESSOR_INSPECTION_STORAGE_BUCKET, path, 60 * 60)
}

export async function saveCompressorInspection(input: SaveCompressorInspectionInput) {
  const inspectionId = crypto.randomUUID()
  const photo1Prepared = await prepareImageUpload(input.photo1.file, input.photo1.file.name || 'photo1.jpg')
  const photo2Prepared = await prepareImageUpload(input.photo2.file, input.photo2.file.name || 'photo2.jpg')
  const photo1Path = `${input.postoId}/${inspectionId}/photo1.${photo1Prepared.extension}`
  const photo2Path = `${input.postoId}/${inspectionId}/photo2.${photo2Prepared.extension}`
  const uploadedPaths: string[] = []

  try {
    await uploadObject(
      COMPRESSOR_INSPECTION_STORAGE_BUCKET,
      photo1Path,
      photo1Prepared.file,
      photo1Prepared.contentType,
    )
    uploadedPaths.push(photo1Path)

    await uploadObject(
      COMPRESSOR_INSPECTION_STORAGE_BUCKET,
      photo2Path,
      photo2Prepared.file,
      photo2Prepared.contentType,
    )
    uploadedPaths.push(photo2Path)

    const { data, error } = await supabase
      .from('compressor_inspections')
      .insert({
        id: inspectionId,
        posto_id: input.postoId,
        inspected_at: input.inspectedAt,
        brand: input.brand.trim(),
        model: input.model.trim(),
        serial_number: input.serialNumber.trim(),
        capacity_liters: input.capacityLiters,
        manometer_ok: input.manometerOk,
        safety_valve_ok: input.safetyValveOk,
        oil_changed: input.oilChanged,
        compressor_drained: input.compressorDrained,
        photo1_storage_path: photo1Path,
        photo1_file_name: photo1Prepared.file.name,
        photo1_latitude: input.photo1.latitude,
        photo1_longitude: input.photo1.longitude,
        photo1_captured_at: input.photo1.capturedAt,
        photo2_storage_path: photo2Path,
        photo2_file_name: photo2Prepared.file.name,
        photo2_latitude: input.photo2.latitude,
        photo2_longitude: input.photo2.longitude,
        photo2_captured_at: input.photo2.capturedAt,
      })
      .select('*')
      .single()

    if (error) throw error
    return data as CompressorInspection
  } catch (error) {
    await removeObjects(COMPRESSOR_INSPECTION_STORAGE_BUCKET, uploadedPaths)
    throw error
  }
}
