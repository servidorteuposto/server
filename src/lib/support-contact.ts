import { isImageFile } from '../config/posto-settings'
import { supabase } from './supabase'

export const SUPPORT_ATTACHMENTS_BUCKET = 'support-attachments'
export const SUPPORT_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const SUPPORT_MAX_PHOTOS = 3

export type SupportAudience = 'sem_cadastro' | 'com_cadastro'
export type SupportCategory = 'duvida' | 'sugestao' | 'reclamacao'
export type SupportTicketStatus = 'aberta' | 'em_andamento' | 'respondida'

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  duvida: 'Dúvida',
  sugestao: 'Sugestão',
  reclamacao: 'Reclamação',
}

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  respondida: 'Respondida',
}

export type SupportTicket = {
  id: string
  audience: SupportAudience
  category: SupportCategory
  status: SupportTicketStatus
  name: string
  email: string
  phone: string
  message: string
  user_id: string | null
  posto_id: string | null
  attachment_paths: string[]
  admin_reply: string | null
  replied_at: string | null
  replied_by: string | null
  created_at: string
  updated_at: string
}

export type SubmitSupportTicketInput = {
  audience: SupportAudience
  category: SupportCategory
  name: string
  email: string
  phone: string
  message: string
  postoId?: string | null
  photos: File[]
  website?: string
}

export type SubmitSupportTicketResult = {
  ok: boolean
  message: string
}

function extensionForFile(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export function validateSupportPhotos(files: File[]) {
  if (files.length > SUPPORT_MAX_PHOTOS) {
    return `Envie no máximo ${SUPPORT_MAX_PHOTOS} prints.`
  }

  for (const file of files) {
    if (!isImageFile(file)) {
      return 'Os anexos devem ser imagens JPG, PNG ou WebP.'
    }
    if (file.size > SUPPORT_PHOTO_MAX_BYTES) {
      return 'Cada print deve ter no máximo 5 MB.'
    }
  }

  return null
}

async function uploadSupportPhotos(ticketId: string, photos: File[]) {
  const paths: string[] = []

  for (let index = 0; index < photos.length; index += 1) {
    const file = photos[index]
    const path = `${ticketId}/${index + 1}.${extensionForFile(file)}`
    const { error } = await supabase.storage.from(SUPPORT_ATTACHMENTS_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || 'image/jpeg',
    })

    if (error) {
      throw new Error(error.message || 'Falha ao enviar anexo.')
    }

    paths.push(path)
  }

  return paths
}

export async function submitSupportTicket(
  input: SubmitSupportTicketInput,
): Promise<SubmitSupportTicketResult> {
  if (input.website?.trim()) {
    return { ok: true, message: 'Mensagem enviada com sucesso.' }
  }

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const phone = input.phone.trim()
  const message = input.message.trim()

  if (!name) return { ok: false, message: 'Informe seu nome.' }
  if (!email || !email.includes('@')) return { ok: false, message: 'Informe um e-mail válido.' }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return { ok: false, message: 'Informe um telefone válido.' }
  }
  if (!input.category) return { ok: false, message: 'Selecione o tipo da solicitação.' }
  if (message.length < 10) {
    return { ok: false, message: 'Descreva sua solicitação com pelo menos 10 caracteres.' }
  }

  const photoError = validateSupportPhotos(input.photos)
  if (photoError) return { ok: false, message: photoError }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (input.audience === 'com_cadastro' && !user) {
    return { ok: false, message: 'Faça login novamente para enviar o chamado.' }
  }

  if (input.audience === 'sem_cadastro' && user) {
    // Visitante na tela de login não deve carregar sessão; se houver, ainda registra como sem cadastro.
  }

  const ticketId = crypto.randomUUID()

  try {
    const attachmentPaths = await uploadSupportPhotos(ticketId, input.photos)

    const { error } = await supabase.from('support_tickets').insert({
      id: ticketId,
      audience: input.audience,
      category: input.category,
      name,
      email,
      phone,
      message,
      user_id: input.audience === 'com_cadastro' ? user?.id ?? null : null,
      posto_id: input.audience === 'com_cadastro' ? input.postoId ?? null : null,
      attachment_paths: attachmentPaths,
    })

    if (error) {
      if (attachmentPaths.length > 0) {
        await supabase.storage.from(SUPPORT_ATTACHMENTS_BUCKET).remove(attachmentPaths)
      }
      return {
        ok: false,
        message: error.message || 'Não foi possível registrar sua solicitação.',
      }
    }

    return {
      ok: true,
      message: 'Solicitação enviada com sucesso. Nossa equipe vai analisar em breve.',
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar sua solicitação. Tente novamente.',
    }
  }
}

export async function listSupportTickets(audience: SupportAudience): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select(
      'id, audience, category, status, name, email, phone, message, user_id, posto_id, attachment_paths, admin_reply, replied_at, replied_by, created_at, updated_at',
    )
    .eq('audience', audience)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'Não foi possível carregar os chamados.')
  }

  return (data ?? []).map((row) => ({
    ...(row as SupportTicket),
    status: (row.status as SupportTicketStatus | null) ?? 'aberta',
    admin_reply: (row.admin_reply as string | null) ?? null,
    replied_at: (row.replied_at as string | null) ?? null,
    replied_by: (row.replied_by as string | null) ?? null,
  }))
}

export async function getSupportAttachmentUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error || !data?.signedUrl) {
    return null
  }

  return data.signedUrl
}

async function parsePayload<T>(data: T | null, error: unknown): Promise<T | null> {
  if (data) return data
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (context instanceof Response) {
    try {
      return (await context.json()) as T
    } catch {
      return null
    }
  }
  return null
}

async function invokeSupportAdmin<T>(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  let accessToken = session?.access_token
  if (!accessToken) {
    const refreshed = await supabase.auth.refreshSession()
    accessToken = refreshed.data.session?.access_token
  }

  if (!accessToken) {
    return { payload: null as T | null, invokeFailed: true }
  }

  const { data, error } = await supabase.functions.invoke('support-admin', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const payload = await parsePayload<T>(data as T | null, error)
  return { payload, invokeFailed: !payload && Boolean(error) }
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('id', ticketId)
    .select(
      'id, audience, category, status, name, email, phone, message, user_id, posto_id, attachment_paths, admin_reply, replied_at, replied_by, created_at, updated_at',
    )
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message || 'Não foi possível atualizar o status.')
  }

  return {
    ...(data as SupportTicket),
    status: (data.status as SupportTicketStatus | null) ?? 'aberta',
    admin_reply: (data.admin_reply as string | null) ?? null,
    replied_at: (data.replied_at as string | null) ?? null,
    replied_by: (data.replied_by as string | null) ?? null,
  }
}

export async function deleteSupportTicket(ticketId: string): Promise<void> {
  const { data: existing, error: loadError } = await supabase
    .from('support_tickets')
    .select('id, attachment_paths')
    .eq('id', ticketId)
    .maybeSingle()

  if (loadError || !existing) {
    throw new Error(loadError?.message || 'Chamado não encontrado.')
  }

  const paths = Array.isArray(existing.attachment_paths)
    ? (existing.attachment_paths as string[])
    : []

  if (paths.length > 0) {
    await supabase.storage.from(SUPPORT_ATTACHMENTS_BUCKET).remove(paths)
  }

  const { error } = await supabase.from('support_tickets').delete().eq('id', ticketId)
  if (error) {
    throw new Error(error.message || 'Não foi possível excluir o chamado.')
  }
}

export async function replySupportTicket(
  ticketId: string,
  reply: string,
): Promise<SupportTicket> {
  const { payload, invokeFailed } = await invokeSupportAdmin<{
    ok: boolean
    message?: string
    ticket?: SupportTicket
  }>({ action: 'reply_ticket', ticket_id: ticketId, reply })

  if (invokeFailed || !payload?.ok || !payload.ticket) {
    throw new Error(payload?.message || 'Não foi possível enviar a resposta.')
  }

  return {
    ...payload.ticket,
    status: payload.ticket.status ?? 'respondida',
    admin_reply: payload.ticket.admin_reply ?? reply,
    replied_at: payload.ticket.replied_at ?? null,
    replied_by: payload.ticket.replied_by ?? null,
  }
}
