import { DIESEL_DRAINAGES_STORAGE_BUCKET } from '../config/diesel-drainages'
import { stripCpf } from '../config/work-safety'
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
  operator_cpf: string
  observations: string | null
  residues_confirmed: boolean
  signature_storage_path: string
  created_at: string
  tank?: DieselTank | null
}

export type SaveDieselDrainageInput = {
  postoId: string
  tankId: string
  drainedAt: string
  operatorFullName: string
  operatorCpf: string
  observations: string
  residuesConfirmed: boolean
  signatureBlob: Blob
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

export async function saveDieselDrainageReport(input: SaveDieselDrainageInput) {
  if (!input.residuesConfirmed) {
    throw new Error('residues_not_confirmed')
  }

  const reportId = crypto.randomUUID()
  const signaturePath = `${input.postoId}/${reportId}/signature.png`

  const { error: uploadError } = await supabase.storage
    .from(DIESEL_DRAINAGES_STORAGE_BUCKET)
    .upload(signaturePath, input.signatureBlob, {
      upsert: true,
      contentType: input.signatureBlob.type || 'image/png',
    })

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('diesel_drainage_reports')
    .insert({
      id: reportId,
      posto_id: input.postoId,
      tank_id: input.tankId,
      drained_at: input.drainedAt,
      operator_full_name: input.operatorFullName.trim(),
      operator_cpf: stripCpf(input.operatorCpf),
      observations: input.observations.trim() || null,
      residues_confirmed: true,
      signature_storage_path: signaturePath,
    })
    .select('*, tank:diesel_tanks(*)')
    .single()

  if (error) {
    await supabase.storage.from(DIESEL_DRAINAGES_STORAGE_BUCKET).remove([signaturePath])
    throw error
  }

  return data as DieselDrainageReport
}
