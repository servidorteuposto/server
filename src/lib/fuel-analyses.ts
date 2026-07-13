import {
  FUEL_ANALYSES_STORAGE_BUCKET,
  type FuelProductKey,
} from '../config/fuel-analyses'
import { cnpjDigits } from './cnpj'
import { stripCpf } from '../config/work-safety'
import { supabase } from './supabase'

export type PostoProfile = {
  id: string
  nome: string
  cnpj: string
  endereco: string | null
}

export type FuelAnalysisRaqItem = {
  id: string
  report_id: string
  product_key: FuelProductKey
  volume_received_liters: number | null
  collection_date: string | null
  transporter_name: string | null
  transporter_cnpj: string | null
  invoice_number: string | null
  invoice_storage_path: string | null
  invoice_file_name: string | null
  truck_plate: string | null
  driver_name: string | null
  distributor_name: string | null
  distributor_cnpj: string | null
}

export type FuelAnalysisItem = {
  id: string
  report_id: string
  product_key: FuelProductKey
  aspecto: string | null
  cor: string | null
  temperatura_observada: string | null
  massa_especifica_observada: string | null
  massa_especifica_convertida: string | null
  teor_alcool_gasolina: string | null
  photo_storage_path: string | null
  photo_file_name: string | null
  photo_latitude: number | null
  photo_longitude: number | null
  photo_captured_at: string | null
}

export type FuelAnalysisReport = {
  id: string
  posto_id: string
  razao_social: string
  cnpj: string
  endereco: string
  author_full_name: string
  author_cpf: string
  signature_storage_path: string
  submitted_at: string
  created_at: string
  updated_at: string
  raq_items: FuelAnalysisRaqItem[]
  analysis_items: FuelAnalysisItem[]
}

export type RaqItemInput = {
  productKey: FuelProductKey
  volumeReceivedLiters: string
  collectionDate: string
  transporterName: string
  transporterCnpj: string
  invoiceNumber: string
  invoiceFile: File | null
  truckPlate: string
  driverName: string
  distributorName: string
  distributorCnpj: string
}

export type AnalysisItemInput = {
  productKey: FuelProductKey
  aspecto: string
  cor: string
  temperaturaObservada: string
  massaEspecificaObservada: string
  massaEspecificaConvertida: string
  teorAlcoolGasolina: string
  photoFile: File | null
  photoLatitude: number | null
  photoLongitude: number | null
  photoCapturedAt: string | null
}

export type SaveFuelAnalysisReportInput = {
  postoId: string
  razaoSocial: string
  cnpj: string
  endereco: string
  authorFullName: string
  authorCpf: string
  signatureBlob: Blob
  submittedAt: string
  raqItems: RaqItemInput[]
  analysisItems: AnalysisItemInput[]
}

function extensionFromFile(file: File | Blob, fallback: string) {
  if (file instanceof File && file.name.includes('.')) {
    return file.name.split('.').pop()!.toLowerCase()
  }
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'image/jpeg') return 'jpg'
  return fallback
}

async function uploadFile(path: string, file: Blob, contentType: string) {
  const { error } = await supabase.storage.from(FUEL_ANALYSES_STORAGE_BUCKET).upload(path, file, {
    upsert: true,
    contentType,
  })
  if (error) throw error
}

async function removeStorageObjects(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))]
  if (!unique.length) return
  const { error } = await supabase.storage.from(FUEL_ANALYSES_STORAGE_BUCKET).remove(unique)
  if (error) throw error
}

export async function getMyPostoProfile(): Promise<PostoProfile> {
  const { data, error } = await supabase
    .from('postos')
    .select('id, nome, cnpj, endereco')
    .maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error('posto_not_found')

  return data as PostoProfile
}

export async function updatePostoEndereco(postoId: string, endereco: string) {
  const { error } = await supabase.from('postos').update({ endereco }).eq('id', postoId)
  if (error) throw error
}

export async function getFuelProductSettings(postoId: string): Promise<FuelProductKey[]> {
  const { data, error } = await supabase
    .from('fuel_product_settings')
    .select('products')
    .eq('posto_id', postoId)
    .maybeSingle()

  if (error) throw error
  return (data?.products ?? []) as FuelProductKey[]
}

export async function saveFuelProductSettings(postoId: string, products: FuelProductKey[]) {
  const { error } = await supabase.from('fuel_product_settings').upsert(
    {
      posto_id: postoId,
      products,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'posto_id' },
  )
  if (error) throw error
}

export async function listFuelAnalysisReports(postoId: string): Promise<FuelAnalysisReport[]> {
  const { data: reports, error } = await supabase
    .from('fuel_analysis_reports')
    .select('*')
    .eq('posto_id', postoId)
    .order('submitted_at', { ascending: false })

  if (error) throw error
  if (!reports?.length) return []

  const reportIds = reports.map((row) => row.id)

  const [{ data: raqItems, error: raqError }, { data: analysisItems, error: analysisError }] =
    await Promise.all([
      supabase.from('fuel_analysis_raq_items').select('*').in('report_id', reportIds),
      supabase.from('fuel_analysis_items').select('*').in('report_id', reportIds),
    ])

  if (raqError) throw raqError
  if (analysisError) throw analysisError

  return reports.map((report) => ({
    ...(report as Omit<FuelAnalysisReport, 'raq_items' | 'analysis_items'>),
    raq_items: ((raqItems ?? []) as FuelAnalysisRaqItem[]).filter(
      (item) => item.report_id === report.id,
    ),
    analysis_items: ((analysisItems ?? []) as FuelAnalysisItem[]).filter(
      (item) => item.report_id === report.id,
    ),
  }))
}

export async function getFuelFileUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(FUEL_ANALYSES_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error) throw error
  return data.signedUrl
}

export async function saveFuelAnalysisReport(input: SaveFuelAnalysisReportInput) {
  const reportId = crypto.randomUUID()
  const uploadedPaths: string[] = []

  try {
    const signatureExt = extensionFromFile(input.signatureBlob, 'png')
    const signaturePath = `${input.postoId}/${reportId}/signature.${signatureExt}`
    await uploadFile(signaturePath, input.signatureBlob, input.signatureBlob.type || 'image/png')
    uploadedPaths.push(signaturePath)

    const raqRows = []
    for (const item of input.raqItems) {
      let invoicePath: string | null = null
      let invoiceFileName: string | null = null

      if (item.invoiceFile) {
        const ext = extensionFromFile(item.invoiceFile, 'pdf')
        invoicePath = `${input.postoId}/${reportId}/raq/${item.productKey}/invoice.${ext}`
        await uploadFile(
          invoicePath,
          item.invoiceFile,
          item.invoiceFile.type || 'application/pdf',
        )
        uploadedPaths.push(invoicePath)
        invoiceFileName = item.invoiceFile.name
      }

      raqRows.push({
        report_id: reportId,
        product_key: item.productKey,
        volume_received_liters: item.volumeReceivedLiters
          ? Number(item.volumeReceivedLiters.replace(',', '.'))
          : null,
        collection_date: item.collectionDate || null,
        transporter_name: item.transporterName.trim() || null,
        transporter_cnpj: cnpjDigits(item.transporterCnpj) || null,
        invoice_number: item.invoiceNumber.trim() || null,
        invoice_storage_path: invoicePath,
        invoice_file_name: invoiceFileName,
        truck_plate: item.truckPlate.trim().toUpperCase() || null,
        driver_name: item.driverName.trim() || null,
        distributor_name: item.distributorName.trim() || null,
        distributor_cnpj: cnpjDigits(item.distributorCnpj) || null,
      })
    }

    const analysisRows = []
    for (const item of input.analysisItems) {
      let photoPath: string | null = null
      let photoFileName: string | null = null

      if (item.photoFile) {
        const ext = extensionFromFile(item.photoFile, 'jpg')
        photoPath = `${input.postoId}/${reportId}/analysis/${item.productKey}/photo.${ext}`
        await uploadFile(photoPath, item.photoFile, item.photoFile.type || 'image/jpeg')
        uploadedPaths.push(photoPath)
        photoFileName = item.photoFile.name
      }

      analysisRows.push({
        report_id: reportId,
        product_key: item.productKey,
        aspecto: item.aspecto.trim() || null,
        cor: item.cor.trim() || null,
        temperatura_observada: item.temperaturaObservada.trim() || null,
        massa_especifica_observada: item.massaEspecificaObservada.trim() || null,
        massa_especifica_convertida: item.massaEspecificaConvertida.trim() || null,
        teor_alcool_gasolina: item.teorAlcoolGasolina.trim() || null,
        photo_storage_path: photoPath,
        photo_file_name: photoFileName,
        photo_latitude: item.photoLatitude,
        photo_longitude: item.photoLongitude,
        photo_captured_at: item.photoCapturedAt,
      })
    }

    const { error: reportError } = await supabase.from('fuel_analysis_reports').insert({
      id: reportId,
      posto_id: input.postoId,
      razao_social: input.razaoSocial.trim(),
      cnpj: cnpjDigits(input.cnpj),
      endereco: input.endereco.trim(),
      author_full_name: input.authorFullName.trim(),
      author_cpf: stripCpf(input.authorCpf),
      signature_storage_path: signaturePath,
      submitted_at: input.submittedAt,
    })

    if (reportError) throw reportError

    if (raqRows.length) {
      const { error } = await supabase.from('fuel_analysis_raq_items').insert(raqRows)
      if (error) throw error
    }

    if (analysisRows.length) {
      const { error } = await supabase.from('fuel_analysis_items').insert(analysisRows)
      if (error) throw error
    }

    return reportId
  } catch (error) {
    await removeStorageObjects(uploadedPaths)
    throw error
  }
}

export async function deleteFuelAnalysisReport(report: FuelAnalysisReport) {
  const paths = [
    report.signature_storage_path,
    ...report.raq_items.map((item) => item.invoice_storage_path),
    ...report.analysis_items.map((item) => item.photo_storage_path),
  ].filter(Boolean) as string[]

  const { error } = await supabase.from('fuel_analysis_reports').delete().eq('id', report.id)
  if (error) throw error

  await removeStorageObjects(paths)
}
