import {
  hitsVolumetryTechWarn,
  VOLUMETRY_TOLERANCE_MAX,
  VOLUMETRY_TOLERANCE_MIN,
  NOZZLE_METROLOGY_STORAGE_BUCKET,
  type MetrologyItemStatus,
  type MetrologyStatus,
  type NozzleFuelKey,
} from '../config/nozzle-metrology'
import { prepareImageUpload } from './image-webp'
import { getSignedObjectUrl, removeObjects, uploadObject } from './object-storage'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type NozzleMetrologyItem = {
  id: string
  verification_id: string
  posto_id: string
  nozzle_number: number
  fuel_product_key: NozzleFuelKey
  fuel_other_label: string | null
  volumetry_min: number | null
  volumetry_max: number | null
  flow_min_liters: number | null
  flow_max_liters: number | null
  seals_ok: boolean | null
  leakage: boolean | null
  hose_ok: boolean | null
  display_burned: boolean | null
  nozzle_ok: boolean | null
  item_status: MetrologyItemStatus
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
  photo_storage_path: string | null
  photo_file_name: string | null
  photo_latitude: number | null
  photo_longitude: number | null
  photo_captured_at: string | null
  pump_photo_storage_path: string | null
  pump_photo_file_name: string | null
  pump_photo_latitude: number | null
  pump_photo_longitude: number | null
  pump_photo_captured_at: string | null
  created_at: string
  items?: NozzleMetrologyItem[]
}

export type SaveNozzleMetrologyItemInput = {
  nozzleNumber: number
  fuelProductKey: NozzleFuelKey
  fuelOtherLabel: string | null
  volumetryMin: number | null
  volumetryMax: number | null
  flowMinLiters: number | null
  flowMaxLiters: number | null
  sealsOk: boolean | null
  leakage: boolean | null
  hoseOk: boolean | null
  displayBurned: boolean | null
  nozzleOk: boolean | null
  itemStatus: MetrologyItemStatus
}

export type SaveNozzleMetrologyInput = {
  postoId: string
  verifiedAt: string
  employeeFullName: string
  overallStatus: MetrologyStatus
  signatureBlob: Blob
  photoFile?: File | null
  photoLatitude?: number | null
  photoLongitude?: number | null
  photoCapturedAt?: string | null
  pumpPhotoFile?: File | null
  pumpPhotoLatitude?: number | null
  pumpPhotoLongitude?: number | null
  pumpPhotoCapturedAt?: string | null
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
    photo_storage_path: row.photo_storage_path ?? null,
    photo_file_name: row.photo_file_name ?? null,
    photo_latitude: row.photo_latitude ?? null,
    photo_longitude: row.photo_longitude ?? null,
    photo_captured_at: row.photo_captured_at ?? null,
    pump_photo_storage_path: row.pump_photo_storage_path ?? null,
    pump_photo_file_name: row.pump_photo_file_name ?? null,
    pump_photo_latitude: row.pump_photo_latitude ?? null,
    pump_photo_longitude: row.pump_photo_longitude ?? null,
    pump_photo_captured_at: row.pump_photo_captured_at ?? null,
    items: [...(row.items ?? [])].sort((a, b) => a.nozzle_number - b.nozzle_number),
  }))
}

export async function getNozzleMetrologySignatureUrl(path: string) {
  return getSignedObjectUrl(NOZZLE_METROLOGY_STORAGE_BUCKET, path, 60 * 60)
}

export async function getNozzleMetrologyPhotoUrl(path: string) {
  return getSignedObjectUrl(NOZZLE_METROLOGY_STORAGE_BUCKET, path, 60 * 60)
}

export async function saveNozzleMetrologyVerification(input: SaveNozzleMetrologyInput) {
  if (input.items.length < 1) {
    throw new Error('no_items')
  }

  const verificationId = crypto.randomUUID()
  const signaturePrepared = await prepareImageUpload(input.signatureBlob, 'signature.png')
  const hasPhoto =
    Boolean(input.photoFile) &&
    input.photoLatitude != null &&
    input.photoLongitude != null &&
    Boolean(input.photoCapturedAt)
  const photoPrepared = hasPhoto
    ? await prepareImageUpload(input.photoFile!, input.photoFile!.name || 'photo.jpg')
    : null
  const signaturePath = `${input.postoId}/${verificationId}/signature.${signaturePrepared.extension}`
  const photoPath = photoPrepared
    ? `${input.postoId}/${verificationId}/photo.${photoPrepared.extension}`
    : null
  const hasPumpPhoto =
    Boolean(input.pumpPhotoFile) &&
    input.pumpPhotoLatitude != null &&
    input.pumpPhotoLongitude != null &&
    Boolean(input.pumpPhotoCapturedAt)
  const pumpPrepared = hasPumpPhoto
    ? await prepareImageUpload(input.pumpPhotoFile!, input.pumpPhotoFile!.name || 'pump-photo.jpg')
    : null
  const pumpPhotoPath = pumpPrepared
    ? `${input.postoId}/${verificationId}/pump-photo.${pumpPrepared.extension}`
    : null
  const uploadedPaths = [signaturePath]
  let saved: NozzleMetrologyVerification | undefined

  try {
    await uploadObject(
      NOZZLE_METROLOGY_STORAGE_BUCKET,
      signaturePath,
      signaturePrepared.file,
      signaturePrepared.contentType,
    )

    if (photoPrepared && photoPath) {
      await uploadObject(
        NOZZLE_METROLOGY_STORAGE_BUCKET,
        photoPath,
        photoPrepared.file,
        photoPrepared.contentType,
      )
      uploadedPaths.push(photoPath)
    }

    if (pumpPrepared && pumpPhotoPath) {
      await uploadObject(
        NOZZLE_METROLOGY_STORAGE_BUCKET,
        pumpPhotoPath,
        pumpPrepared.file,
        pumpPrepared.contentType,
      )
      uploadedPaths.push(pumpPhotoPath)
    }

    const { error: headerError } = await supabase.from('nozzle_metrology_verifications').insert({
      id: verificationId,
      posto_id: input.postoId,
      verified_at: input.verifiedAt,
      employee_full_name: input.employeeFullName.trim(),
      nozzle_count: input.items.length,
      overall_status: input.overallStatus,
      signature_storage_path: signaturePath,
      photo_storage_path: photoPath,
      photo_file_name: photoPrepared?.file.name ?? null,
      photo_latitude: hasPhoto ? input.photoLatitude : null,
      photo_longitude: hasPhoto ? input.photoLongitude : null,
      photo_captured_at: hasPhoto ? input.photoCapturedAt : null,
      pump_photo_storage_path: pumpPhotoPath,
      pump_photo_file_name: pumpPrepared?.file.name ?? null,
      pump_photo_latitude: hasPumpPhoto ? input.pumpPhotoLatitude : null,
      pump_photo_longitude: hasPumpPhoto ? input.pumpPhotoLongitude : null,
      pump_photo_captured_at: hasPumpPhoto ? input.pumpPhotoCapturedAt : null,
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
        hose_ok: item.hoseOk,
        display_burned: item.displayBurned,
        nozzle_ok: item.nozzleOk,
        item_status: item.itemStatus,
      })),
    )

    if (itemsError) throw itemsError

    const rows = await listNozzleMetrologyVerifications(input.postoId)
    saved = rows.find((row) => row.id === verificationId)
    if (!saved) throw new Error('verification_not_found')
  } catch (error) {
    await removeObjects(NOZZLE_METROLOGY_STORAGE_BUCKET, uploadedPaths)
    await supabase.from('nozzle_metrology_verifications').delete().eq('id', verificationId)
    throw error
  }

  if (!saved) throw new Error('verification_not_found')
  if (shouldNotifyMetrologyAlert(input)) {
    await notifyMetrologyAlert(saved.id)
  }
  return saved
}

function isVolumetryOutOfTolerance(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return false
  return value < VOLUMETRY_TOLERANCE_MIN || value > VOLUMETRY_TOLERANCE_MAX
}

function shouldNotifyMetrologyAlert(input: SaveNozzleMetrologyInput) {
  return input.items.some((item) => {
    if (item.itemStatus === 'manutencao') return false
    if (isVolumetryOutOfTolerance(item.volumetryMin) || isVolumetryOutOfTolerance(item.volumetryMax)) {
      return true
    }
    return hitsVolumetryTechWarn(item.volumetryMin) || hitsVolumetryTechWarn(item.volumetryMax)
  })
}

async function notifyMetrologyAlert(verificationId: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const { data, error } = await supabase.functions.invoke('send-metrology-alert', {
      body: { verification_id: verificationId },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })
    if (error) {
      console.warn('notifyMetrologyAlert failed', error, data)
    }
  } catch (error) {
    console.warn('notifyMetrologyAlert failed', error)
  }
}
