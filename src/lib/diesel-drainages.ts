import {
  DIESEL_DRAINAGES_STORAGE_BUCKET,
  DIESEL_TANK_TYPES,
} from '../config/diesel-drainages'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type DieselTank = {
  id: string
  posto_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type DieselDrainageReport = {
  id: string
  posto_id: string
  tank_id: string
  drained_at: string
  operator_full_name: string
  operator_cpf: string | null
  observations: string | null
  residues_confirmed: boolean
  water_present: boolean | null
  impurities_present: boolean | null
  drained_volume_liters: number | null
  measure_taken: string | null
  signature_storage_path: string
  photo_storage_path: string | null
  photo_file_name: string | null
  photo_latitude: number | null
  photo_longitude: number | null
  photo_captured_at: string | null
  created_at: string
  tank?: DieselTank | null
}

export type SaveDieselDrainageInput = {
  postoId: string
  tankId: string
  drainedAt: string
  operatorFullName: string
  observations: string
  residuesConfirmed: boolean
  waterPresent: boolean
  impuritiesPresent: boolean
  drainedVolumeLiters: number
  measureTaken: string
  signatureBlob: Blob
  photoFile: File
  photoLatitude: number
  photoLongitude: number
  photoCapturedAt: string
}

export { getMyPostoId }

export async function listDieselTanks(postoId: string) {
  const { data, error } = await supabase
    .from('diesel_tanks')
    .select('*')
    .eq('posto_id', postoId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as DieselTank[]
}

/** Garante os 4 tipos padrão de tanque diesel para o posto. */
export async function ensureStandardDieselTanks(postoId: string) {
  const existing = await listDieselTanks(postoId)
  const byName = new Map(existing.map((tank) => [tank.name.trim().toLowerCase(), tank]))

  const ensured: DieselTank[] = []

  for (const type of DIESEL_TANK_TYPES) {
    const found = byName.get(type.label.toLowerCase())
    if (found) {
      if (!found.is_active) {
        const reactivated = await updateDieselTank(found.id, {
          name: type.label,
          description: found.description ?? '',
          isActive: true,
        })
        ensured.push(reactivated)
      } else {
        ensured.push(found)
      }
      continue
    }

    const created = await createDieselTank({
      postoId,
      name: type.label,
      description: `Tanque de diesel ${type.label}`,
    })
    ensured.push(created)
  }

  return sortTanksByStandardOrder(ensured)
}

export function sortTanksByStandardOrder(tanks: DieselTank[]) {
  const order = new Map(DIESEL_TANK_TYPES.map((type, index) => [type.label.toLowerCase(), index]))
  return [...tanks].sort((a, b) => {
    const aOrder = order.get(a.name.trim().toLowerCase())
    const bOrder = order.get(b.name.trim().toLowerCase())
    if (aOrder != null && bOrder != null) return aOrder - bOrder
    if (aOrder != null) return -1
    if (bOrder != null) return 1
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

export async function createDieselTank(input: {
  postoId: string
  name: string
  description?: string
}) {
  const { data, error } = await supabase
    .from('diesel_tanks')
    .insert({
      posto_id: input.postoId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: true,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as DieselTank
}

export async function updateDieselTank(
  tankId: string,
  input: { name: string; description?: string; isActive: boolean },
) {
  const { data, error } = await supabase
    .from('diesel_tanks')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: input.isActive,
    })
    .eq('id', tankId)
    .select('*')
    .single()

  if (error) throw error
  return data as DieselTank
}

export async function deleteDieselTank(tankId: string) {
  const { error } = await supabase.from('diesel_tanks').delete().eq('id', tankId)
  if (error) throw error
}

export async function listDieselDrainageReports(postoId: string) {
  const { data, error } = await supabase
    .from('diesel_drainage_reports')
    .select('*, tank:diesel_tanks(*)')
    .eq('posto_id', postoId)
    .order('drained_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as DieselDrainageReport[]
}

export async function getDrainageSignatureUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(DIESEL_DRAINAGES_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error) throw error
  return data.signedUrl
}

export async function getDrainagePhotoUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(DIESEL_DRAINAGES_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error) throw error
  return data.signedUrl
}

export async function saveDieselDrainageReport(input: SaveDieselDrainageInput) {
  if (!input.residuesConfirmed) {
    throw new Error('residues_not_confirmed')
  }

  const reportId = crypto.randomUUID()
  const signaturePath = `${input.postoId}/${reportId}/signature.png`
  const photoExt = input.photoFile.name.includes('.')
    ? input.photoFile.name.split('.').pop()!.toLowerCase()
    : 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(photoExt)
    ? photoExt === 'jpeg'
      ? 'jpg'
      : photoExt
    : 'jpg'
  const photoPath = `${input.postoId}/${reportId}/photo.${safeExt}`
  const uploadedPaths = [signaturePath]

  try {
    const { error: signatureUploadError } = await supabase.storage
      .from(DIESEL_DRAINAGES_STORAGE_BUCKET)
      .upload(signaturePath, input.signatureBlob, {
        upsert: true,
        contentType: input.signatureBlob.type || 'image/png',
      })

    if (signatureUploadError) throw signatureUploadError

    const { error: photoUploadError } = await supabase.storage
      .from(DIESEL_DRAINAGES_STORAGE_BUCKET)
      .upload(photoPath, input.photoFile, {
        upsert: true,
        contentType: input.photoFile.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
      })

    if (photoUploadError) throw photoUploadError
    uploadedPaths.push(photoPath)

    const { data, error } = await supabase
      .from('diesel_drainage_reports')
      .insert({
        id: reportId,
        posto_id: input.postoId,
        tank_id: input.tankId,
        drained_at: input.drainedAt,
        operator_full_name: input.operatorFullName.trim(),
        operator_cpf: null,
        observations: input.observations.trim() || null,
        residues_confirmed: true,
        water_present: input.waterPresent,
        impurities_present: input.impuritiesPresent,
        drained_volume_liters: input.drainedVolumeLiters,
        measure_taken: input.measureTaken.trim(),
        signature_storage_path: signaturePath,
        photo_storage_path: photoPath,
        photo_file_name: input.photoFile.name || `photo.${safeExt}`,
        photo_latitude: input.photoLatitude,
        photo_longitude: input.photoLongitude,
        photo_captured_at: input.photoCapturedAt,
      })
      .select('*, tank:diesel_tanks(*)')
      .single()

    if (error) throw error
    return data as DieselDrainageReport
  } catch (error) {
    await supabase.storage.from(DIESEL_DRAINAGES_STORAGE_BUCKET).remove(uploadedPaths)
    throw error
  }
}
