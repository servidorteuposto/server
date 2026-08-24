import { supabase } from './supabase'

export const POSTO_FORM_DRAFT_KINDS = {
  fuelRaq: 'fuel_raq',
  nozzleMetrology: 'nozzle_metrology',
  dieselDrainage: 'diesel_drainage',
} as const

export type PostoFormDraftKind = (typeof POSTO_FORM_DRAFT_KINDS)[keyof typeof POSTO_FORM_DRAFT_KINDS]

export type DraftWithSavedAt = {
  savedAt?: string
}

export function pickNewerDraft<T extends DraftWithSavedAt>(local: T | null, remote: T | null): T | null {
  if (!local) return remote
  if (!remote) return local
  return (local.savedAt || '') >= (remote.savedAt || '') ? local : remote
}

export function readLocalFormDraft<T>(storageKey: string): T | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeLocalFormDraft(storageKey: string, draft: unknown) {
  window.localStorage.setItem(storageKey, JSON.stringify(draft))
}

export function clearLocalFormDraft(storageKey: string) {
  window.localStorage.removeItem(storageKey)
}

export async function getPostoFormDraft<T>(postoId: string, kind: PostoFormDraftKind): Promise<T | null> {
  const { data, error } = await supabase
    .from('posto_form_drafts')
    .select('payload')
    .eq('posto_id', postoId)
    .eq('kind', kind)
    .maybeSingle()

  if (error) throw error
  if (!data?.payload || typeof data.payload !== 'object') return null
  return data.payload as T
}

export async function savePostoFormDraft(
  postoId: string,
  kind: PostoFormDraftKind,
  payload: unknown,
) {
  const { error } = await supabase.from('posto_form_drafts').upsert(
    {
      posto_id: postoId,
      kind,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'posto_id,kind' },
  )
  if (error) throw error
}

export async function deletePostoFormDraft(postoId: string, kind: PostoFormDraftKind) {
  const { error } = await supabase
    .from('posto_form_drafts')
    .delete()
    .eq('posto_id', postoId)
    .eq('kind', kind)
  if (error) throw error
}

export async function resolvePostoFormDraft<T extends DraftWithSavedAt>(
  postoId: string,
  kind: PostoFormDraftKind,
  storageKey: string,
  isValid: (value: unknown) => value is T,
): Promise<T | null> {
  const localRaw = readLocalFormDraft<unknown>(storageKey)
  const local = isValid(localRaw) ? localRaw : null

  let remote: T | null = null
  try {
    const loaded = await getPostoFormDraft<unknown>(postoId, kind)
    remote = isValid(loaded) ? loaded : null
  } catch {
    remote = null
  }

  const chosen = pickNewerDraft(local, remote)
  if (!chosen) {
    clearLocalFormDraft(storageKey)
    return null
  }

  writeLocalFormDraft(storageKey, chosen)

  const shouldUpload = !remote || (local && (local.savedAt || '') > (remote.savedAt || ''))
  if (shouldUpload) {
    try {
      await savePostoFormDraft(postoId, kind, chosen)
    } catch {
      /* cache local permanece */
    }
  }

  return chosen
}
