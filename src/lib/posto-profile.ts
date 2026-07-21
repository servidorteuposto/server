import {
  POSTO_ASSETS_STORAGE_BUCKET,
  POSTO_PHOTO_MAX_BYTES,
  buildEnderecoCompleto,
  isImageFile,
  stripCep,
} from '../config/posto-settings'
import { supabase } from './supabase'

export type PostoSettingsProfile = {
  id: string
  nome: string
  cnpj: string
  telefone: string | null
  email: string | null
  endereco: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  foto_storage_path: string | null
  latitude: number | null
  longitude: number | null
  public_slug: string
  aviso_whatsapp_1: string | null
  aviso_whatsapp_2: string | null
}

export type UpdatePostoSettingsInput = {
  postoId: string
  nome: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  latitude: number | null
  longitude: number | null
  avisoWhatsapp1: string
  avisoWhatsapp2: string
  photoFile?: File | null
  existingPhotoPath?: string | null
  removePhoto?: boolean
}

const PROFILE_SELECT =
  'id, nome, cnpj, telefone, email, endereco, cep, logradouro, numero, complemento, bairro, cidade, uf, foto_storage_path, latitude, longitude, public_slug, aviso_whatsapp_1, aviso_whatsapp_2'

export async function getMyPostoSettings(): Promise<PostoSettingsProfile> {
  const { data, error } = await supabase.from('postos').select(PROFILE_SELECT).maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error('posto_not_found')

  return data as PostoSettingsProfile
}

function extensionFromImage(file: File) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.name.includes('.')) {
    const ext = file.name.split('.').pop()!.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext
  }
  return 'jpg'
}

async function removePhoto(path: string | null | undefined) {
  if (!path) return
  const { error } = await supabase.storage.from(POSTO_ASSETS_STORAGE_BUCKET).remove([path])
  if (error) throw error
}

export async function getPostoPhotoUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(POSTO_ASSETS_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (error) throw error
  return data.signedUrl
}

export async function updatePostoSettings(input: UpdatePostoSettingsInput) {
  const cep = stripCep(input.cep)
  const uf = input.uf.trim().toUpperCase()
  const endereco = buildEnderecoCompleto({
    logradouro: input.logradouro,
    numero: input.numero,
    complemento: input.complemento,
    bairro: input.bairro,
    cidade: input.cidade,
    uf,
    cep,
  })

  let fotoPath = input.existingPhotoPath ?? null

  if (input.removePhoto && fotoPath) {
    await removePhoto(fotoPath)
    fotoPath = null
  }

  if (input.photoFile) {
    if (!isImageFile(input.photoFile)) {
      throw new Error('invalid_photo_type')
    }
    if (input.photoFile.size > POSTO_PHOTO_MAX_BYTES) {
      throw new Error('photo_too_large')
    }

    const ext = extensionFromImage(input.photoFile)
    const nextPath = `${input.postoId}/profile/photo.${ext}`

    if (fotoPath && fotoPath !== nextPath) {
      await removePhoto(fotoPath)
    }

    const { error: uploadError } = await supabase.storage
      .from(POSTO_ASSETS_STORAGE_BUCKET)
      .upload(nextPath, input.photoFile, {
        upsert: true,
        contentType: input.photoFile.type || `image/${ext}`,
      })

    if (uploadError) throw uploadError
    fotoPath = nextPath
  }

  const { data, error } = await supabase
    .from('postos')
    .update({
      nome: input.nome.trim(),
      cep: cep || null,
      logradouro: input.logradouro.trim() || null,
      numero: input.numero.trim() || null,
      complemento: input.complemento.trim() || null,
      bairro: input.bairro.trim() || null,
      cidade: input.cidade.trim() || null,
      uf: uf || null,
      endereco: endereco || null,
      latitude: input.latitude,
      longitude: input.longitude,
      foto_storage_path: fotoPath,
      aviso_whatsapp_1: input.avisoWhatsapp1.trim() || null,
      aviso_whatsapp_2: input.avisoWhatsapp2.trim() || null,
    })
    .eq('id', input.postoId)
    .select(PROFILE_SELECT)
    .single()

  if (error) throw error
  return data as PostoSettingsProfile
}
