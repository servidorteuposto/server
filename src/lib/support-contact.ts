import { isImageFile } from '../config/posto-settings'
import { supabase } from './supabase'

export const SUPPORT_ATTACHMENTS_BUCKET = 'support-attachments'
export const SUPPORT_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const SUPPORT_MAX_PHOTOS = 3

export type SupportAudience = 'sem_cadastro' | 'com_cadastro'
export type SupportCategory = 'duvida' | 'sugestao' | 'reclamacao'

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  duvida: 'Dúvida',
  sugestao: 'Sugestão',
  reclamacao: 'Reclamação',
}

export type SupportTicket = {
  id: string
  audience: SupportAudience
  category: SupportCategory
  name: string
  email: string
  phone: string
  message: string
  user_id: string | null
  posto_id: string | null
  attachment_paths: string[]
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
      'id, audience, category, name, email, phone, message, user_id, posto_id, attachment_paths, created_at, updated_at',
    )
    .eq('audience', audience)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'Não foi possível carregar os chamados.')
  }

  return (data ?? []) as SupportTicket[]
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
