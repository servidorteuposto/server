import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  deleteR2Object,
  getR2Object,
  isLogicalBucket,
  objectKey,
  presignR2Url,
  type LogicalBucket,
} from '../_shared/r2.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  action?: string
  bucket?: string
  path?: string
  paths?: string[]
  contentType?: string
  expiresIn?: number
  publicSlug?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanPath(path: string) {
  return path.replace(/^\/+/, '').replace(/\\/g, '/')
}

function firstSegment(path: string) {
  return cleanPath(path).split('/')[0] ?? ''
}

async function getUserClient(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function resolveUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return null
  const userClient = await getUserClient(req)
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

async function getUserPostoId(userId: string) {
  const admin = getAdminClient()
  const { data } = await admin.from('postos').select('id').eq('user_id', userId).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

function isAdminUser(user: { email?: string | null; app_metadata?: Record<string, unknown> }) {
  const role = user.app_metadata?.role
  if (role === 'admin') return true
  const email = (user.email ?? '').toLowerCase()
  return email === 'admin@teuposto.com.br' || email === (Deno.env.get('ADMIN_EMAIL') ?? '').toLowerCase()
}

async function canAccessPostoPath(userId: string, path: string) {
  const postoId = await getUserPostoId(userId)
  if (!postoId) return false
  return firstSegment(path) === postoId
}

async function canPublicFuelDownload(path: string, publicSlug?: string) {
  const clean = cleanPath(path)
  const admin = getAdminClient()

  if (publicSlug) {
    const { data: posto } = await admin
      .from('postos')
      .select('id')
      .eq('public_slug', publicSlug)
      .maybeSingle()
    if (!posto?.id || firstSegment(clean) !== posto.id) return false
  } else {
    const postoId = firstSegment(clean)
    const { data: posto } = await admin
      .from('postos')
      .select('id, public_slug')
      .eq('id', postoId)
      .maybeSingle()
    if (!posto?.public_slug) return false
  }

  const postoId = firstSegment(clean)

  const { data: report } = await admin
    .from('fuel_analysis_reports')
    .select('id')
    .eq('posto_id', postoId)
    .eq('signature_storage_path', clean)
    .limit(1)
    .maybeSingle()
  if (report) return true

  const { data: analysisHit } = await admin
    .from('fuel_analysis_items')
    .select('id, report_id')
    .eq('photo_storage_path', clean)
    .limit(1)
    .maybeSingle()
  if (analysisHit) return true

  const { data: raqHit } = await admin
    .from('fuel_analysis_raq_items')
    .select('id')
    .eq('invoice_storage_path', clean)
    .limit(1)
    .maybeSingle()

  return Boolean(raqHit)
}

async function authorize(
  action: string,
  bucket: LogicalBucket,
  path: string,
  user: Awaited<ReturnType<typeof resolveUser>>,
  publicSlug?: string,
) {
  const isDownload = action === 'presign-download' || action === 'download'

  if (bucket === 'admin-secure-files') {
    return Boolean(user && isAdminUser(user))
  }

  if (bucket === 'support-attachments') {
    if (action === 'presign-upload') return true
    return Boolean(user && isAdminUser(user))
  }

  if (!user) {
    if (isDownload && bucket === 'fuel-analyses') {
      return canPublicFuelDownload(path, publicSlug)
    }
    return false
  }

  if (isAdminUser(user)) return true
  return canAccessPostoPath(user.id, path)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Body
    const action = body.action?.trim()
    const bucket = body.bucket?.trim() ?? ''
    const expiresIn = Number(body.expiresIn) > 0 ? Number(body.expiresIn) : 3600

    if (!action) return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
    if (!isLogicalBucket(bucket)) {
      return jsonResponse({ ok: false, message: 'Bucket inválido.' }, 400)
    }

    const user = await resolveUser(req)

    if (action === 'presign-upload') {
      const path = typeof body.path === 'string' ? cleanPath(body.path) : ''
      const contentType =
        typeof body.contentType === 'string' && body.contentType.trim()
          ? body.contentType.trim()
          : 'application/octet-stream'
      if (!path) return jsonResponse({ ok: false, message: 'Path inválido.' }, 400)

      const allowed = await authorize(action, bucket, path, user, body.publicSlug)
      if (!allowed) return jsonResponse({ ok: false, message: 'Não autorizado.' }, 403)

      const key = objectKey(bucket, path)
      const url = await presignR2Url('PUT', key, expiresIn, contentType)
      return jsonResponse({ ok: true, url, key, bucket, path, contentType })
    }

    if (action === 'presign-download') {
      const path = typeof body.path === 'string' ? cleanPath(body.path) : ''
      if (!path) return jsonResponse({ ok: false, message: 'Path inválido.' }, 400)

      const allowed = await authorize(action, bucket, path, user, body.publicSlug)
      if (!allowed) return jsonResponse({ ok: false, message: 'Não autorizado.' }, 403)

      const key = objectKey(bucket, path)
      const url = await presignR2Url('GET', key, expiresIn)
      return jsonResponse({ ok: true, url, key, bucket, path })
    }

    // Proxy binário: o browser só fala com a Edge Function (já liberada no CSP).
    if (action === 'download') {
      const path = typeof body.path === 'string' ? cleanPath(body.path) : ''
      if (!path) return jsonResponse({ ok: false, message: 'Path inválido.' }, 400)

      const allowed = await authorize(action, bucket, path, user, body.publicSlug)
      if (!allowed) return jsonResponse({ ok: false, message: 'Não autorizado.' }, 403)

      const key = objectKey(bucket, path)
      const { bytes, contentType } = await getR2Object(key)
      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=60',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    if (action === 'delete') {
      const paths = Array.isArray(body.paths)
        ? body.paths.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        : typeof body.path === 'string' && body.path.trim()
          ? [body.path]
          : []
      const cleaned = [...new Set(paths.map(cleanPath).filter(Boolean))]
      if (!cleaned.length) return jsonResponse({ ok: false, message: 'Nenhum path para remover.' }, 400)

      for (const path of cleaned) {
        const allowed = await authorize(action, bucket, path, user, body.publicSlug)
        if (!allowed) return jsonResponse({ ok: false, message: 'Não autorizado.' }, 403)
      }

      for (const path of cleaned) {
        await deleteR2Object(objectKey(bucket, path))
      }
      return jsonResponse({ ok: true, deleted: cleaned.length })
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    if (message === 'r2_not_configured') {
      return jsonResponse({ ok: false, message: 'R2 não configurado nas secrets.' }, 503)
    }
    if (message.startsWith('r2_get_failed:404')) {
      return jsonResponse({ ok: false, message: 'Arquivo não encontrado no storage.' }, 404)
    }
    console.error('r2-storage error', error)
    return jsonResponse({ ok: false, message: 'Erro interno do storage.' }, 500)
  }
})
