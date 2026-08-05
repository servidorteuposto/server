const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_CNPJ_DIGITS = '99999999000199'
const ADMIN_EMAIL = 'servidorteuposto@gmail.com'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function isAdminAccount(user: {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}) {
  return String(user.email ?? '')
    .trim()
    .toLowerCase() === ADMIN_EMAIL
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Método não permitido.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ ok: false, message: 'Configuração do servidor incompleta.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const accessToken = authHeader.slice('Bearer '.length).trim()
    if (!accessToken || accessToken === anonKey) {
      return jsonResponse({ ok: false, message: 'Não autenticado.' }, 401)
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1')

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(accessToken)

    if (userError || !user || !isAdminAccount(user)) {
      return jsonResponse({ ok: false, message: 'Acesso restrito ao administrador.' }, 403)
    }

    const body = await req.json()
    const action = body?.action

    if (action === 'list_accounts') {
      const { data, error } = await admin
        .from('postos')
        .select(
          'id, nome, cnpj, email, telefone, subscription_status, subscription_ends_at, user_id, created_at',
        )
        .order('created_at', { ascending: false })

      if (error) {
        return jsonResponse({ ok: false, message: error.message }, 500)
      }

      const accounts = (data ?? []).filter((row) => {
        const cnpj = onlyDigits(row.cnpj ?? '')
        const email = String(row.email ?? '').trim().toLowerCase()
        return cnpj !== ADMIN_CNPJ_DIGITS && email !== ADMIN_EMAIL
      })

      return jsonResponse({ ok: true, accounts })
    }

    if (action === 'unlock_access') {
      const postoId = body?.posto_id
      if (!postoId || typeof postoId !== 'string') {
        return jsonResponse({ ok: false, message: 'Informe o posto.' }, 400)
      }

      const { data: posto, error: postoError } = await admin
        .from('postos')
        .select('id, cnpj, email, subscription_status')
        .eq('id', postoId)
        .maybeSingle()

      if (postoError || !posto) {
        return jsonResponse({ ok: false, message: 'Posto não encontrado.' }, 404)
      }

      if (
        onlyDigits(posto.cnpj ?? '') === ADMIN_CNPJ_DIGITS ||
        String(posto.email ?? '').trim().toLowerCase() === ADMIN_EMAIL
      ) {
        return jsonResponse({ ok: false, message: 'Conta administrativa não pode ser alterada.' }, 400)
      }

      const { data: updated, error: updateError } = await admin
        .from('postos')
        .update({
          subscription_status: 'active',
          subscription_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', postoId)
        .select(
          'id, nome, cnpj, email, telefone, subscription_status, subscription_ends_at, user_id, created_at',
        )
        .single()

      if (updateError || !updated) {
        return jsonResponse({ ok: false, message: updateError?.message ?? 'Falha ao liberar acesso.' }, 500)
      }

      return jsonResponse({
        ok: true,
        message: 'Acesso liberado com sucesso.',
        account: updated,
      })
    }

    if (action === 'impersonate') {
      const postoId = body?.posto_id
      if (!postoId || typeof postoId !== 'string') {
        return jsonResponse({ ok: false, message: 'Informe o posto.' }, 400)
      }

      const { data: posto, error: postoError } = await admin
        .from('postos')
        .select('id, nome, cnpj, email, user_id, subscription_status')
        .eq('id', postoId)
        .maybeSingle()

      if (postoError || !posto) {
        return jsonResponse({ ok: false, message: 'Posto não encontrado.' }, 404)
      }

      if (
        onlyDigits(posto.cnpj ?? '') === ADMIN_CNPJ_DIGITS ||
        String(posto.email ?? '').trim().toLowerCase() === ADMIN_EMAIL
      ) {
        return jsonResponse({ ok: false, message: 'Não é possível entrar na conta administrativa.' }, 400)
      }

      const email = String(posto.email ?? '').trim().toLowerCase()
      if (!email || !posto.user_id) {
        return jsonResponse({ ok: false, message: 'Esta conta ainda não possui usuário de login.' }, 400)
      }

      const linkResult = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })

      if (linkResult.error || !linkResult.data) {
        return jsonResponse(
          { ok: false, message: linkResult.error?.message ?? 'Não foi possível gerar o acesso.' },
          500,
        )
      }

      const hashedToken =
        linkResult.data.properties?.hashed_token ??
        (linkResult.data as { hashed_token?: string }).hashed_token

      if (!hashedToken) {
        return jsonResponse({ ok: false, message: 'Token de acesso indisponível.' }, 500)
      }

      return jsonResponse({
        ok: true,
        token_hash: hashedToken,
        posto: {
          id: posto.id,
          nome: posto.nome,
          cnpj: posto.cnpj,
          email,
        },
      })
    }

    if (action === 'delete_account') {
      const postoId = body?.posto_id
      if (!postoId || typeof postoId !== 'string') {
        return jsonResponse({ ok: false, message: 'Informe o posto.' }, 400)
      }

      const { data: posto, error: postoError } = await admin
        .from('postos')
        .select('id, nome, cnpj, email, user_id')
        .eq('id', postoId)
        .maybeSingle()

      if (postoError || !posto) {
        return jsonResponse({ ok: false, message: 'Posto não encontrado.' }, 404)
      }

      if (
        onlyDigits(posto.cnpj ?? '') === ADMIN_CNPJ_DIGITS ||
        String(posto.email ?? '').trim().toLowerCase() === ADMIN_EMAIL
      ) {
        return jsonResponse({ ok: false, message: 'Conta administrativa não pode ser excluída.' }, 400)
      }

      const userId = typeof posto.user_id === 'string' ? posto.user_id : null

      // Apaga o posto (cascade nos dados operacionais). Depois remove o login no Auth.
      const { error: deletePostoError } = await admin.from('postos').delete().eq('id', postoId)
      if (deletePostoError) {
        return jsonResponse(
          { ok: false, message: deletePostoError.message || 'Não foi possível excluir o posto.' },
          500,
        )
      }

      if (userId) {
        const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
        if (deleteUserError) {
          return jsonResponse(
            {
              ok: false,
              message:
                deleteUserError.message ||
                'Posto removido, mas falhou ao excluir o login. Tente novamente.',
            },
            500,
          )
        }
      }

      return jsonResponse({
        ok: true,
        message: `Conta de ${posto.nome} excluída com sucesso.`,
        posto_id: postoId,
      })
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('admin-ops error', error)
    return jsonResponse({ ok: false, message: 'Erro interno do painel admin.' }, 500)
  }
})
