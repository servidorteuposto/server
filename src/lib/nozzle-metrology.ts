import {
  NOZZLE_METROLOGY_STORAGE_BUCKET,
  type MetrologyStatus,
  type NozzleFuelKey,
} from '../config/nozzle-metrology'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type NozzleMetrologyItem = {
  id: string
  verification_id: string
  posto_id: string
  nozzle_number: number
  fuel_product_key: NozzleFuelKey
  fuel_other_label: string | null
  volumetry_min: number
  volumetry_max: number
  flow_min_liters: number
  flow_max_liters: number
  seals_ok: boolean
  leakage: boolean
  item_status: MetrologyStatus
  created_at: string
}

export type NozzleMetrologyVerification = {
  id: string
  posto_id: string
  verified_at: string
  employee_full_name: string
  nozzle_count: number
  overall_status: MetrologyStatus
  signature_storage_path: string
  photo_storage_path: string
  photo_file_name: string | null
  photo_latitude: number
  photo_longitude: number
  photo_captured_at: string
  created_at: string
  items?: NozzleMetrologyItem[]
}

export type SaveNozzleMetrologyItemInput = {
  nozzleNumber: number
  fuelProductKey: NozzleFuelKey
  fuelOtherLabel: string | null
  volumetryMin: number
  volumetryMax: number
  flowMinLiters: number
  flowMaxLiters: number
  sealsOk: boolean
  leakage: boolean
  itemStatus: MetrologyStatus
}

export type SaveNozzleMetrologyInput = {
  postoId: string
  verifiedAt: string
  employeeFullName: string
  overallStatus: MetrologyStatus
  signatureBlob: Blob
  photoFile: File
  photoLatitude: number
  photoLongitude: number
  photoCapturedAt: string
  items: SaveNozzleMetrologyItemInput[]
}

export { getMyPostoId }

export async function listNozzleMetrologyVerifications(postoId: string) {
  const { data, error } = await supabase
    .from('nozzle_metrology_verifications')
    .select('*, items:nozzle_metrology_items(*)')
    .eq('posto_id', postoId)
    .order('verified_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as NozzleMetrologyVerification[]).map((row) => ({
    ...row,
    items: [...(row.items ?? [])].sort((a, b) => a.nozzle_number - b.nozzle_number),
  }))
}

export async function getNozzleMetrologySignatureUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(NOZZLE_METROLOGY_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error) throw error
  return data.signedUrl
}

export async function getNozzleMetrologyPhotoUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(NOZZLE_METROLOGY_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error) throw error
  return data.signedUrl
}

export async function saveNozzleMetrologyVerification(input: SaveNozzleMetrologyInput) {
  if (input.items.length < 1) {
    throw new Error('no_items')
  }

  const verificationId = crypto.randomUUID()
  const signaturePath = `${input.postoId}/${verificationId}/signature.png`
  const photoExt = input.photoFile.name.includes('.')
    ? input.photoFile.name.split('.').pop()!.toLowerCase()
    : 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(photoExt)
    ? photoExt === 'jpeg'
      ? 'jpg'
      : photoExt
    : 'jpg'
  const photoPath = `${input.postoId}/${verificationId}/photo.${safeExt}`
  const uploadedPaths = [signaturePath]

  try {
    const { error: signatureUploadError } = await supabase.storage
      .from(NOZZLE_METROLOGY_STORAGE_BUCKET)
      .upload(signaturePath, input.signatureBlob, {
        upsert: true,
        contentType: input.signatureBlob.type || 'image/png',
      })

    if (signatureUploadError) throw signatureUploadError

    const { error: photoUploadError } = await supabase.storage
      .from(NOZZLE_METROLOGY_STORAGE_BUCKET)
      .upload(photoPath, input.photoFile, {
        upsert: true,
        contentType: input.photoFile.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
      })

    if (photoUploadError) throw photoUploadError
    uploadedPaths.push(photoPath)

    const { error: headerError } = await supabase.from('nozzle_metrology_verifications').insert({
      id: verificationId,
      posto_id: input.postoId,
      verified_at: input.verifiedAt,
      employee_full_name: input.employeeFullName.trim(),
      nozzle_count: input.items.length,
      overall_status: input.overallStatus,
      signature_storage_path: signaturePath,
      photo_storage_path: photoPath,
      photo_file_name: input.photoFile.name || `photo.${safeExt}`,
      photo_latitude: input.photoLatitude,
      photo_longitude: input.photoLongitude,
      photo_captured_at: input.photoCapturedAt,
    })

    if (headerError) throw headerError

    const { error: itemsError } = await supabase.from('nozzle_metrology_items').insert(
      input.items.map((item) => ({
        verification_id: verificationId,
        posto_id: input.postoId,
        nozzle_number: item.nozzleNumber,
        fuel_product_key: item.fuelProductKey,
        fuel_other_label:
          item.fuelProductKey === 'outro' ? item.fuelOtherLabel?.trim() || null : null,
        volumetry_min: item.volumetryMin,
        volumetry_max: item.volumetryMax,
        flow_min_liters: item.flowMinLiters,
        flow_max_liters: item.flowMaxLiters,
        seals_ok: item.sealsOk,
        leakage: item.leakage,
        item_status: item.itemStatus,
      })),
    )

    if (itemsError) throw itemsError

    const rows = await listNozzleMetrologyVerifications(input.postoId)
    const saved = rows.find((row) => row.id === verificationId)
    if (!saved) throw new Error('verification_not_found')
    return saved
  } catch (error) {
    await supabase.storage.from(NOZZLE_METROLOGY_STORAGE_BUCKET).remove(uploadedPaths)
    await supabase.from('nozzle_metrology_verifications').delete().eq('id', verificationId)
    throw error
  }
}
