import {
  getEquipmentTemplate,
  MANDATORY_EQUIPMENTS_STORAGE_BUCKET,
  type EquipmentComplianceStatus,
  type EquipmentPhotoMeta,
  type MandatoryEquipmentKey,
} from '../config/mandatory-equipments'
import { prepareImageUpload } from './image-webp'
import { getSignedObjectUrl, removeObjects, uploadObject } from './object-storage'
import { getMyPostoId } from './regulatory-documents'
import { supabase } from './supabase'

export type MandatoryEquipment = {
  id: string
  posto_id: string
  equipment_key: MandatoryEquipmentKey
  serial_number: string | null
  brand: string | null
  equipment_photo_path: string | null
  equipment_photo_name: string | null
  equipment_photo_latitude: number | null
  equipment_photo_longitude: number | null
  equipment_photo_captured_at: string | null
  extra_photos: EquipmentPhotoMeta[]
  certificate_path: string | null
  certificate_name: string | null
  certificate_mime: string | null
  serial_photo_path: string | null
  serial_photo_name: string | null
  serial_photo_latitude: number | null
  serial_photo_longitude: number | null
  serial_photo_captured_at: string | null
  created_at: string
  updated_at: string
}

export type LivePhotoCapture = {
  file: File
  latitude: number
  longitude: number
  capturedAt: string
}

export type SaveMandatoryEquipmentInput = {
  postoId: string
  equipmentKey: MandatoryEquipmentKey
  existing?: MandatoryEquipment | null
  serialNumber?: string
  brand?: string
  equipmentPhoto?: LivePhotoCapture | null
  keepExistingEquipmentPhoto?: boolean
  bucketPhotos?: Array<LivePhotoCapture | null>
  keepExistingBucketPhotos?: boolean[]
  certificateFile?: File | null
  keepExistingCertificate?: boolean
  serialPhoto?: LivePhotoCapture | null
  keepExistingSerialPhoto?: boolean
}

export { getMyPostoId }

function fileExt(file: File, fallback: string) {
  const fromName = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : ''
  if (fromName && /^[a-z0-9]+$/i.test(fromName)) {
    if (fromName === 'jpeg') return 'jpg'
    return fromName
  }
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.includes('png')) return 'png'
  if (file.type.includes('webp')) return 'webp'
  return fallback
}

function collectExistingPaths(row: MandatoryEquipment | null | undefined) {
  if (!row) return [] as string[]
  const paths = [
    row.equipment_photo_path,
    row.certificate_path,
    row.serial_photo_path,
    ...row.extra_photos.map((photo) => photo.path),
  ]
  return paths.filter((path): path is string => Boolean(path))
}

async function removeStoragePaths(paths: string[]) {
  await removeObjects(MANDATORY_EQUIPMENTS_STORAGE_BUCKET, paths)
}

async function uploadFile(path: string, file: File, contentType?: string) {
  await uploadObject(
    MANDATORY_EQUIPMENTS_STORAGE_BUCKET,
    path,
    file,
    contentType || file.type || undefined,
  )
}

export function evaluateEquipmentCompliance(
  equipment: MandatoryEquipment | null,
  key: MandatoryEquipmentKey,
): EquipmentComplianceStatus {
  const template = getEquipmentTemplate(key)
  if (!template || !equipment) return 'pendente'

  if (template.kind === 'standard') {
    const ok =
      Boolean(equipment.serial_number?.trim()) &&
      Boolean(equipment.equipment_photo_path) &&
      equipment.equipment_photo_latitude != null &&
      equipment.equipment_photo_longitude != null &&
      Boolean(equipment.equipment_photo_captured_at) &&
      Boolean(equipment.certificate_path)
    return ok ? 'de_acordo' : 'nao_apto'
  }

  if (template.kind === 'bucket') {
    const photos = equipment.extra_photos ?? []
    const ok =
      Boolean(equipment.serial_number?.trim()) &&
      Boolean(equipment.brand?.trim()) &&
      photos.length >= 3 &&
      photos.every((photo) => Boolean(photo.path))
    return ok ? 'de_acordo' : 'nao_apto'
  }

  const ok =
    Boolean(equipment.serial_photo_path) &&
    equipment.serial_photo_latitude != null &&
    equipment.serial_photo_longitude != null &&
    Boolean(equipment.serial_photo_captured_at) &&
    Boolean(equipment.certificate_path)
  return ok ? 'de_acordo' : 'nao_apto'
}

export async function listMandatoryEquipments(postoId: string) {
  const { data, error } = await supabase
    .from('mandatory_equipments')
    .select('*')
    .eq('posto_id', postoId)

  if (error) throw error

  return ((data ?? []) as MandatoryEquipment[]).map((row) => ({
    ...row,
    extra_photos: Array.isArray(row.extra_photos) ? row.extra_photos : [],
  }))
}

export async function getMandatoryEquipmentFileUrl(path: string) {
  return getSignedObjectUrl(MANDATORY_EQUIPMENTS_STORAGE_BUCKET, path, 60 * 60)
}

export async function saveMandatoryEquipment(input: SaveMandatoryEquipmentInput) {
  const template = getEquipmentTemplate(input.equipmentKey)
  if (!template) throw new Error('invalid_equipment')

  const equipmentId = input.existing?.id ?? crypto.randomUUID()
  const basePath = `${input.postoId}/${equipmentId}`
  const uploadedPaths: string[] = []
  const previousPaths = collectExistingPaths(input.existing)

  try {
    let equipmentPhotoPath = input.keepExistingEquipmentPhoto
      ? input.existing?.equipment_photo_path ?? null
      : null
    let equipmentPhotoName = input.keepExistingEquipmentPhoto
      ? input.existing?.equipment_photo_name ?? null
      : null
    let equipmentPhotoLat = input.keepExistingEquipmentPhoto
      ? input.existing?.equipment_photo_latitude ?? null
      : null
    let equipmentPhotoLng = input.keepExistingEquipmentPhoto
      ? input.existing?.equipment_photo_longitude ?? null
      : null
    let equipmentPhotoCapturedAt = input.keepExistingEquipmentPhoto
      ? input.existing?.equipment_photo_captured_at ?? null
      : null

    if (input.equipmentPhoto) {
      const prepared = await prepareImageUpload(
        input.equipmentPhoto.file,
        input.equipmentPhoto.file.name || 'equipment.jpg',
      )
      equipmentPhotoPath = `${basePath}/equipment.${prepared.extension}`
      await uploadFile(equipmentPhotoPath, prepared.file, prepared.contentType)
      uploadedPaths.push(equipmentPhotoPath)
      equipmentPhotoName = prepared.file.name
      equipmentPhotoLat = input.equipmentPhoto.latitude
      equipmentPhotoLng = input.equipmentPhoto.longitude
      equipmentPhotoCapturedAt = input.equipmentPhoto.capturedAt
    }

    let certificatePath = input.keepExistingCertificate
      ? input.existing?.certificate_path ?? null
      : null
    let certificateName = input.keepExistingCertificate
      ? input.existing?.certificate_name ?? null
      : null
    let certificateMime = input.keepExistingCertificate
      ? input.existing?.certificate_mime ?? null
      : null

    if (input.certificateFile) {
      const ext = fileExt(input.certificateFile, 'pdf')
      certificatePath = `${basePath}/certificate.${ext}`
      await uploadFile(certificatePath, input.certificateFile)
      uploadedPaths.push(certificatePath)
      certificateName = input.certificateFile.name
      certificateMime = input.certificateFile.type || null
    }

    let serialPhotoPath = input.keepExistingSerialPhoto
      ? input.existing?.serial_photo_path ?? null
      : null
    let serialPhotoName = input.keepExistingSerialPhoto
      ? input.existing?.serial_photo_name ?? null
      : null
    let serialPhotoLat = input.keepExistingSerialPhoto
      ? input.existing?.serial_photo_latitude ?? null
      : null
    let serialPhotoLng = input.keepExistingSerialPhoto
      ? input.existing?.serial_photo_longitude ?? null
      : null
    let serialPhotoCapturedAt = input.keepExistingSerialPhoto
      ? input.existing?.serial_photo_captured_at ?? null
      : null

    if (input.serialPhoto) {
      const prepared = await prepareImageUpload(
        input.serialPhoto.file,
        input.serialPhoto.file.name || 'serial.jpg',
      )
      serialPhotoPath = `${basePath}/serial.${prepared.extension}`
      await uploadFile(serialPhotoPath, prepared.file, prepared.contentType)
      uploadedPaths.push(serialPhotoPath)
      serialPhotoName = prepared.file.name
      serialPhotoLat = input.serialPhoto.latitude
      serialPhotoLng = input.serialPhoto.longitude
      serialPhotoCapturedAt = input.serialPhoto.capturedAt
    }

    const extraPhotos: EquipmentPhotoMeta[] = []
    if (template.kind === 'bucket') {
      const existingExtras = input.existing?.extra_photos ?? []
      for (let index = 0; index < 3; index += 1) {
        const keep = input.keepExistingBucketPhotos?.[index]
        const capture = input.bucketPhotos?.[index]
        if (capture) {
          const prepared = await prepareImageUpload(
            capture.file,
            capture.file.name || `bucket-${index + 1}.jpg`,
          )
          const path = `${basePath}/bucket-${index + 1}.${prepared.extension}`
          await uploadFile(path, prepared.file, prepared.contentType)
          uploadedPaths.push(path)
          extraPhotos.push({
            path,
            file_name: prepared.file.name,
            latitude: capture.latitude,
            longitude: capture.longitude,
            captured_at: capture.capturedAt,
          })
        } else if (keep && existingExtras[index]) {
          extraPhotos.push(existingExtras[index])
        }
      }
    }

    const payload = {
      id: equipmentId,
      posto_id: input.postoId,
      equipment_key: input.equipmentKey,
      serial_number: input.serialNumber?.trim() || null,
      brand: input.brand?.trim() || null,
      equipment_photo_path: equipmentPhotoPath,
      equipment_photo_name: equipmentPhotoName,
      equipment_photo_latitude: equipmentPhotoLat,
      equipment_photo_longitude: equipmentPhotoLng,
      equipment_photo_captured_at: equipmentPhotoCapturedAt,
      extra_photos: extraPhotos,
      certificate_path: certificatePath,
      certificate_name: certificateName,
      certificate_mime: certificateMime,
      serial_photo_path: serialPhotoPath,
      serial_photo_name: serialPhotoName,
      serial_photo_latitude: serialPhotoLat,
      serial_photo_longitude: serialPhotoLng,
      serial_photo_captured_at: serialPhotoCapturedAt,
    }

    const query = input.existing
      ? supabase.from('mandatory_equipments').update(payload).eq('id', equipmentId)
      : supabase.from('mandatory_equipments').insert(payload)

    const { data, error } = await query.select('*').single()
    if (error) throw error

    const keptPaths = new Set(collectExistingPaths(data as MandatoryEquipment))
    const toDelete = previousPaths.filter(
      (path) => !keptPaths.has(path) && !uploadedPaths.includes(path),
    )
    await removeStoragePaths(toDelete)

    return {
      ...(data as MandatoryEquipment),
      extra_photos: Array.isArray((data as MandatoryEquipment).extra_photos)
        ? (data as MandatoryEquipment).extra_photos
        : [],
    }
  } catch (error) {
    await removeStoragePaths(uploadedPaths)
    throw error
  }
}
