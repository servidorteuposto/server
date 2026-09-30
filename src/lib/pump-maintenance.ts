import { PUMP_MAINTENANCE_STORAGE_BUCKET } from '../config/pump-maintenance'
import { prepareImageUpload } from './image-webp'
import { getSignedObjectUrl, removeObjects, uploadObject } from './object-storage'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type PumpMaintenance = {
  id: string
  posto_id: string
  maintained_at: string
  notes: string | null
  operator_full_name: string | null
  signature_storage_path: string | null
  maintenance_photo_path: string
  maintenance_photo_name: string | null
  maintenance_photo_latitude: number
  maintenance_photo_longitude: number
  maintenance_photo_captured_at: string
  residue_photo_path: string
  residue_photo_name: string | null
  residue_photo_latitude: number
  residue_photo_longitude: number
  residue_photo_captured_at: string
  created_at: string
}

export type LivePhotoCapture = {
  file: File
  latitude: number
  longitude: number
  capturedAt: string
}

export type SavePumpMaintenanceInput = {
  postoId: string
  maintainedAt: string
  notes: string
  operatorFullName: string
  signatureBlob: Blob
  maintenancePhoto: LivePhotoCapture
  residuePhoto: LivePhotoCapture
}

export { getMyPostoId }

export async function listPumpMaintenances(postoId: string) {
  const { data, error } = await supabase
    .from('pump_maintenances')
    .select('*')
    .eq('posto_id', postoId)
    .order('maintained_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as PumpMaintenance[]
}

export async function getPumpMaintenancePhotoUrl(path: string) {
  return getSignedObjectUrl(PUMP_MAINTENANCE_STORAGE_BUCKET, path, 60 * 60)
}

export async function getPumpMaintenanceSignatureUrl(path: string) {
  return getSignedObjectUrl(PUMP_MAINTENANCE_STORAGE_BUCKET, path, 60 * 60)
}

export async function savePumpMaintenance(input: SavePumpMaintenanceInput) {
  const maintenanceId = crypto.randomUUID()
  const signaturePrepared = await prepareImageUpload(input.signatureBlob, 'signature.png')
  const maintenancePrepared = await prepareImageUpload(
    input.maintenancePhoto.file,
    input.maintenancePhoto.file.name || 'manutencao.jpg',
  )
  const residuePrepared = await prepareImageUpload(
    input.residuePhoto.file,
    input.residuePhoto.file.name || 'residuos.jpg',
  )
  const signaturePath = `${input.postoId}/${maintenanceId}/signature.${signaturePrepared.extension}`
  const maintenancePath = `${input.postoId}/${maintenanceId}/manutencao.${maintenancePrepared.extension}`
  const residuePath = `${input.postoId}/${maintenanceId}/residuos.${residuePrepared.extension}`
  const uploadedPaths: string[] = []

  try {
    await uploadObject(
      PUMP_MAINTENANCE_STORAGE_BUCKET,
      signaturePath,
      signaturePrepared.file,
      signaturePrepared.contentType,
    )
    uploadedPaths.push(signaturePath)

    await uploadObject(
      PUMP_MAINTENANCE_STORAGE_BUCKET,
      maintenancePath,
      maintenancePrepared.file,
      maintenancePrepared.contentType,
    )
    uploadedPaths.push(maintenancePath)

    await uploadObject(
      PUMP_MAINTENANCE_STORAGE_BUCKET,
      residuePath,
      residuePrepared.file,
      residuePrepared.contentType,
    )
    uploadedPaths.push(residuePath)

    const notes = input.notes.trim() || null

    const { data, error } = await supabase
      .from('pump_maintenances')
      .insert({
        id: maintenanceId,
        posto_id: input.postoId,
        maintained_at: input.maintainedAt,
        notes,
        operator_full_name: input.operatorFullName.trim(),
        signature_storage_path: signaturePath,
        maintenance_photo_path: maintenancePath,
        maintenance_photo_name: maintenancePrepared.file.name,
        maintenance_photo_latitude: input.maintenancePhoto.latitude,
        maintenance_photo_longitude: input.maintenancePhoto.longitude,
        maintenance_photo_captured_at: input.maintenancePhoto.capturedAt,
        residue_photo_path: residuePath,
        residue_photo_name: residuePrepared.file.name,
        residue_photo_latitude: input.residuePhoto.latitude,
        residue_photo_longitude: input.residuePhoto.longitude,
        residue_photo_captured_at: input.residuePhoto.capturedAt,
      })
      .select('*')
      .single()

    if (error) throw error
    return data as PumpMaintenance
  } catch (error) {
    await removeObjects(PUMP_MAINTENANCE_STORAGE_BUCKET, uploadedPaths)
    throw error
  }
}
