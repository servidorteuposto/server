import {
  WORK_SAFETY_EMPLOYEE_STORAGE_BUCKET,
  stripCpf,
  type IdentityDocumentKind,
  type TrainingType,
} from '../config/work-safety'
import { supabase } from './supabase'

export type WorkSafetyEmployee = {
  id: string
  posto_id: string
  full_name: string
  cpf: string
  phone: string | null
  epi_description: string
  created_at: string
  updated_at: string
}

export type WorkSafetyEmployeeTraining = {
  id: string
  posto_id: string
  employee_id: string
  training_type: TrainingType
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

export type WorkSafetyEmployeeAso = {
  id: string
  posto_id: string
  employee_id: string
  title: string
  issued_at: string
  storage_path: string
  preview_storage_path: string | null
  file_name: string
  file_size: number
  preview_file_size: number | null
  created_at: string
  updated_at: string
}

export type WorkSafetyEmployeeIdentity = {
  id: string
  posto_id: string
  employee_id: string
  document_kind: IdentityDocumentKind
  storage_path: string
  preview_storage_path: string | null
  file_name: string
  file_size: number
  preview_file_size: number | null
  created_at: string
  updated_at: string
}

export type WorkSafetyEmployeeWithTrainings = WorkSafetyEmployee & {
  nr20: WorkSafetyEmployeeTraining | null
  nr35: WorkSafetyEmployeeTraining | null
}

type StoredPdf = {
  storage_path: string
  preview_storage_path: string | null
  file_name: string
  file_size: number
  preview_file_size: number | null
}

function buildEmployeeFilePath(
  postoId: string,
  employeeId: string,
  category: string,
  recordId: string,
  kind: 'original' | 'preview',
) {
  return `${postoId}/${employeeId}/${category}/${recordId}/${kind}.pdf`
}

async function removeStorageObjects(paths: Array<string | null | undefined>) {
  const uniquePaths = [...new Set(paths.filter(Boolean))] as string[]
  if (!uniquePaths.length) return

  const { error } = await supabase.storage.from(WORK_SAFETY_EMPLOYEE_STORAGE_BUCKET).remove(uniquePaths)
  if (error) throw error
}

async function uploadEmployeePdf(
  postoId: string,
  employeeId: string,
  category: string,
  recordId: string,
  file: File,
  existing?: { storage_path: string; preview_storage_path: string | null },
): Promise<StoredPdf> {
  const { preparePdfUpload } = await import('./pdf-compress')
  const originalPath = buildEmployeeFilePath(postoId, employeeId, category, recordId, 'original')
  const prepared = await preparePdfUpload(file)

  const shouldStoreSeparatePreview =
    prepared.compressed && prepared.previewSize < prepared.originalSize
  const previewPath = shouldStoreSeparatePreview
    ? buildEmployeeFilePath(postoId, employeeId, category, recordId, 'preview')
    : originalPath

  const pathsToRemove = new Set<string>()
  if (existing?.storage_path) pathsToRemove.add(existing.storage_path)
  if (
    existing?.preview_storage_path &&
    existing.preview_storage_path !== existing.storage_path
  ) {
    pathsToRemove.add(existing.preview_storage_path)
  }
  pathsToRemove.delete(originalPath)
  pathsToRemove.delete(previewPath)
  await removeStorageObjects([...pathsToRemove])

  const { error: originalUploadError } = await supabase.storage
    .from(WORK_SAFETY_EMPLOYEE_STORAGE_BUCKET)
    .upload(originalPath, prepared.originalFile, {
      upsert: true,
      contentType: 'application/pdf',
    })

  if (originalUploadError) throw originalUploadError

  if (shouldStoreSeparatePreview) {
    const { error: previewUploadError } = await supabase.storage
      .from(WORK_SAFETY_EMPLOYEE_STORAGE_BUCKET)
      .upload(previewPath, prepared.previewFile, {
        upsert: true,
        contentType: 'application/pdf',
      })

    if (previewUploadError) {
      await removeStorageObjects([originalPath])
      throw previewUploadError
    }
  }

  return {
    storage_path: originalPath,
    preview_storage_path: previewPath,
    file_name: file.name,
    file_size: prepared.originalSize,
    preview_file_size: shouldStoreSeparatePreview ? prepared.previewSize : prepared.originalSize,
  }
}

export function getEmployeeFilePreviewPath(doc: {
  preview_storage_path: string | null
  storage_path: string
}) {
  return doc.preview_storage_path ?? doc.storage_path
}

export async function listEmployeesWithTrainings(postoId: string) {
  const { data: employees, error: employeesError } = await supabase
    .from('work_safety_employees')
    .select('*')
    .eq('posto_id', postoId)
    .order('full_name', { ascending: true })

  if (employeesError) throw employeesError

  const { data: trainings, error: trainingsError } = await supabase
    .from('work_safety_employee_trainings')
    .select('*')
    .eq('posto_id', postoId)

  if (trainingsError) throw trainingsError

  const trainingRows = (trainings ?? []) as WorkSafetyEmployeeTraining[]

  return ((employees ?? []) as WorkSafetyEmployee[]).map((employee) => ({
    ...employee,
    nr20: trainingRows.find(
      (row) => row.employee_id === employee.id && row.training_type === 'nr20',
    ) ?? null,
    nr35: trainingRows.find(
      (row) => row.employee_id === employee.id && row.training_type === 'nr35',
    ) ?? null,
  })) as WorkSafetyEmployeeWithTrainings[]
}

export async function createEmployee(input: {
  postoId: string
  fullName: string
  cpf: string
  phone: string
}) {
  const { data, error } = await supabase
    .from('work_safety_employees')
    .insert({
      posto_id: input.postoId,
      full_name: input.fullName.trim(),
      cpf: stripCpf(input.cpf),
      phone: input.phone.trim() || null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as WorkSafetyEmployee
}

export async function updateEmployee(
  employeeId: string,
  input: { fullName: string; cpf: string; phone: string; epiDescription?: string },
) {
  const payload: Record<string, string | null> = {
    full_name: input.fullName.trim(),
    cpf: stripCpf(input.cpf),
    phone: input.phone.trim() || null,
  }

  if (input.epiDescription !== undefined) {
    payload.epi_description = input.epiDescription.trim()
  }

  const { data, error } = await supabase
    .from('work_safety_employees')
    .update(payload)
    .eq('id', employeeId)
    .select('*')
    .single()

  if (error) throw error
  return data as WorkSafetyEmployee
}

export async function deleteEmployee(employee: WorkSafetyEmployeeWithTrainings) {
  const { data: asos } = await supabase
    .from('work_safety_employee_asos')
    .select('storage_path, preview_storage_path')
    .eq('employee_id', employee.id)

  const { data: identity } = await supabase
    .from('work_safety_employee_identity')
    .select('storage_path, preview_storage_path')
    .eq('employee_id', employee.id)
    .maybeSingle()

  const paths: string[] = []
  for (const training of [employee.nr20, employee.nr35]) {
    if (training) {
      paths.push(training.storage_path)
      if (training.preview_storage_path) paths.push(training.preview_storage_path)
    }
  }

  for (const aso of asos ?? []) {
    paths.push(aso.storage_path)
    if (aso.preview_storage_path) paths.push(aso.preview_storage_path)
  }

  if (identity) {
    paths.push(identity.storage_path)
    if (identity.preview_storage_path) paths.push(identity.preview_storage_path)
  }

  await removeStorageObjects(paths)

  const { error } = await supabase.from('work_safety_employees').delete().eq('id', employee.id)
  if (error) throw error
}

export async function saveEmployeeTraining(input: {
  postoId: string
  employeeId: string
  trainingType: TrainingType
  issuedAt: string
  expiresAt: string | null
  file: File
  existing?: WorkSafetyEmployeeTraining | null
}) {
  const recordId = input.existing?.id ?? crypto.randomUUID()
  const stored = await uploadEmployeePdf(
    input.postoId,
    input.employeeId,
    input.trainingType,
    recordId,
    input.file,
    input.existing ?? undefined,
  )

  const row = {
    id: recordId,
    posto_id: input.postoId,
    employee_id: input.employeeId,
    training_type: input.trainingType,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt || null,
    ...stored,
  }

  if (input.existing) {
    const { data, error } = await supabase
      .from('work_safety_employee_trainings')
      .update(row)
      .eq('id', input.existing.id)
      .select('*')
      .single()

    if (error) throw error
    return data as WorkSafetyEmployeeTraining
  }

  const { data, error } = await supabase
    .from('work_safety_employee_trainings')
    .insert(row)
    .select('*')
    .single()

  if (error) throw error
  return data as WorkSafetyEmployeeTraining
}

export async function listEmployeeAsos(employeeId: string) {
  const { data, error } = await supabase
    .from('work_safety_employee_asos')
    .select('*')
    .eq('employee_id', employeeId)
    .order('issued_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as WorkSafetyEmployeeAso[]
}

export async function saveEmployeeAso(input: {
  postoId: string
  employeeId: string
  title: string
  issuedAt: string
  file: File
  existingId?: string
  existing?: WorkSafetyEmployeeAso | null
}) {
  const recordId = input.existingId ?? crypto.randomUUID()
  const stored = await uploadEmployeePdf(
    input.postoId,
    input.employeeId,
    'aso',
    recordId,
    input.file,
    input.existing ?? undefined,
  )

  const row = {
    id: recordId,
    posto_id: input.postoId,
    employee_id: input.employeeId,
    title: input.title.trim(),
    issued_at: input.issuedAt,
    ...stored,
  }

  if (input.existing) {
    const { data, error } = await supabase
      .from('work_safety_employee_asos')
      .update(row)
      .eq('id', input.existing.id)
      .select('*')
      .single()

    if (error) throw error
    return data as WorkSafetyEmployeeAso
  }

  const { data, error } = await supabase
    .from('work_safety_employee_asos')
    .insert(row)
    .select('*')
    .single()

  if (error) throw error
  return data as WorkSafetyEmployeeAso
}

export async function deleteEmployeeAso(aso: WorkSafetyEmployeeAso) {
  await removeStorageObjects([aso.storage_path, aso.preview_storage_path])

  const { error } = await supabase.from('work_safety_employee_asos').delete().eq('id', aso.id)
  if (error) throw error
}

export async function getEmployeeIdentity(employeeId: string) {
  const { data, error } = await supabase
    .from('work_safety_employee_identity')
    .select('*')
    .eq('employee_id', employeeId)
    .maybeSingle()

  if (error) throw error
  return (data as WorkSafetyEmployeeIdentity | null) ?? null
}

export async function saveEmployeeIdentity(input: {
  postoId: string
  employeeId: string
  documentKind: IdentityDocumentKind
  file: File
  existing?: WorkSafetyEmployeeIdentity | null
}) {
  const recordId = input.existing?.id ?? crypto.randomUUID()
  const stored = await uploadEmployeePdf(
    input.postoId,
    input.employeeId,
    'identity',
    recordId,
    input.file,
    input.existing ?? undefined,
  )

  const row = {
    id: recordId,
    posto_id: input.postoId,
    employee_id: input.employeeId,
    document_kind: input.documentKind,
    ...stored,
  }

  if (input.existing) {
    const { data, error } = await supabase
      .from('work_safety_employee_identity')
      .update(row)
      .eq('id', input.existing.id)
      .select('*')
      .single()

    if (error) throw error
    return data as WorkSafetyEmployeeIdentity
  }

  const { data, error } = await supabase
    .from('work_safety_employee_identity')
    .insert(row)
    .select('*')
    .single()

  if (error) throw error
  return data as WorkSafetyEmployeeIdentity
}

export async function getEmployeeFileUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from(WORK_SAFETY_EMPLOYEE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('signed_url_failed')

  return data.signedUrl
}

export async function downloadEmployeeFile(fileName: string, storagePath: string) {
  const url = await getEmployeeFileUrl(storagePath)
  const response = await fetch(url)

  if (!response.ok) throw new Error('download_failed')

  const blob = await response.blob()
  const blobUrl = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = blobUrl
  anchor.download = fileName
  anchor.rel = 'noopener'
  window.document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(blobUrl)
}
