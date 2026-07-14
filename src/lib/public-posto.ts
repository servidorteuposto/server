import { FUEL_ANALYSES_STORAGE_BUCKET, type FuelProductKey } from '../config/fuel-analyses'
import { supabase } from './supabase'
import type {
  FuelAnalysisItem,
  FuelAnalysisRaqItem,
  FuelAnalysisReport,
} from './fuel-analyses'

export type PublicPostoInfo = {
  id: string
  nome: string
  cnpj: string
  endereco: string | null
  public_slug: string
}

export type PublicPostoBoard = {
  posto: PublicPostoInfo
  report: Omit<FuelAnalysisReport, 'raq_items' | 'analysis_items'> | null
  raq_items: FuelAnalysisRaqItem[]
  analysis_items: FuelAnalysisItem[]
}

export async function getMyPostoPublicSlug(): Promise<string> {
  const { data, error } = await supabase.from('postos').select('public_slug').maybeSingle()
  if (error) throw error
  if (!data?.public_slug) throw new Error('public_slug_not_found')
  return data.public_slug as string
}

export async function fetchPublicPostoBoard(slug: string): Promise<PublicPostoBoard | null> {
  const { data, error } = await supabase.rpc('get_public_posto_board', { p_slug: slug })
  if (error) throw error
  if (!data) return null
  return data as PublicPostoBoard
}

export async function getPublicFuelFileUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(FUEL_ANALYSES_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 30)

  if (error) throw error
  return data.signedUrl
}

export function uniqueProductsFromBoard(board: PublicPostoBoard): FuelProductKey[] {
  const keys = new Set<FuelProductKey>()
  for (const item of board.raq_items) keys.add(item.product_key)
  for (const item of board.analysis_items) keys.add(item.product_key)
  return [...keys]
}
