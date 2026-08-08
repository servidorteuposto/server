import { deleteR2Object, objectKey } from '../_shared/r2.ts'
import { sendResendEmail, SUPPORT_EMAIL } from './resend.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = 'servidorteuposto@gmail.com'

const CATEGORY_LABELS: Record<string, string> = {
  duvida: 'Dúvida',
  sugestao: 'Sugestão',
  reclamacao: 'Reclamação',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isAdminAccount(user: {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}) {
  return String(user.email ?? '')
    .trim()
    .toLowerCase() === ADMIN_EMAIL
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReplyHtml(options: {
  name: string
  category: string
  originalMessage: string
  reply: string
}) {
  const categoryLabel = CATEGORY_LABELS[options.category] ?? options.category
  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <p>Olá, ${escapeHtml(options.name)},</p>
      <p>Recebemos sua solicitação de suporte (<strong>${escapeHtml(categoryLabel)}</strong>) e seguimos com a resposta abaixo:</p>
      <div style="margin: 16px 0; padding: 14px 16px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; white-space: pre-wrap;">${escapeHtml(options.reply)}</div>
      <p style="margin-top: 20px; font-size: 13px; color: #64748b;">Mensagem original:</p>
      <div style="padding: 12px 14px; border-radius: 8px; background: #fff; border: 1px dashed #cbd5e1; white-space: pre-wrap; color: #475569;">${escapeHtml(options.originalMessage)}</div>
      <p style="margin-top: 24px;">Atenciosamente,<br/>Equipe Teu Posto<br/><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    </div>
  `
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

    const adminUserId = user.id

    const body = await req.json()
    const action = body?.action

    if (action === 'update_status') {
      const ticketId = body?.ticket_id
      const status = body?.status
      if (!ticketId || typeof ticketId !== 'string') {
        return jsonResponse({ ok: false, message: 'Informe o chamado.' }, 400)
      }
      if (!['aberta', 'em_andamento', 'respondida'].includes(status)) {
        return jsonResponse({ ok: false, message: 'Status inválido.' }, 400)
      }

      const { data, error } = await admin
        .from('support_tickets')
        .update({ status })
        .eq('id', ticketId)
        .select(
          'id, audience, category, status, name, email, phone, message, user_id, posto_id, attachment_paths, admin_reply, replied_at, replied_by, created_at, updated_at',
        )
        .maybeSingle()

      if (error || !data) {
        return jsonResponse({ ok: false, message: error?.message || 'Chamado não encontrado.' }, 404)
      }

      return jsonResponse({ ok: true, ticket: data })
    }

    if (action === 'delete_ticket') {
      const ticketId = body?.ticket_id
      if (!ticketId || typeof ticketId !== 'string') {
        return jsonResponse({ ok: false, message: 'Informe o chamado.' }, 400)
      }

      const { data: existing, error: loadError } = await admin
        .from('support_tickets')
        .select('id, attachment_paths')
        .eq('id', ticketId)
        .maybeSingle()

      if (loadError || !existing) {
        return jsonResponse({ ok: false, message: 'Chamado não encontrado.' }, 404)
      }

      const paths = Array.isArray(existing.attachment_paths)
        ? (existing.attachment_paths as string[])
        : []

      if (paths.length > 0) {
        for (const path of paths) {
          try {
            await deleteR2Object(objectKey('support-attachments', path))
          } catch (error) {
            console.error('r2 delete support attachment failed', path, error)
          }
        }
      }

      const { error: deleteError } = await admin.from('support_tickets').delete().eq('id', ticketId)
      if (deleteError) {
        return jsonResponse({ ok: false, message: deleteError.message }, 500)
      }

      return jsonResponse({ ok: true })
    }

    if (action === 'reply_ticket') {
      const ticketId = body?.ticket_id
      const reply = String(body?.reply ?? '').trim()
      if (!ticketId || typeof ticketId !== 'string') {
        return jsonResponse({ ok: false, message: 'Informe o chamado.' }, 400)
      }
      if (reply.length < 5) {
        return jsonResponse({ ok: false, message: 'Escreva uma resposta com pelo menos 5 caracteres.' }, 400)
      }
      if (reply.length > 5000) {
        return jsonResponse({ ok: false, message: 'A resposta pode ter no máximo 5000 caracteres.' }, 400)
      }

      const { data: ticket, error: loadError } = await admin
        .from('support_tickets')
        .select('id, name, email, category, message')
        .eq('id', ticketId)
        .maybeSingle()

      if (loadError || !ticket) {
        return jsonResponse({ ok: false, message: 'Chamado não encontrado.' }, 404)
      }

      const categoryLabel = CATEGORY_LABELS[ticket.category] ?? ticket.category
      const emailResult = await sendResendEmail({
        to: ticket.email,
        subject: `Resposta do suporte Teu Posto — ${categoryLabel}`,
        html: buildReplyHtml({
          name: ticket.name,
          category: ticket.category,
          originalMessage: ticket.message,
          reply,
        }),
        // Mesmo padrão das outras functions: from noreply, reply-to suporte@
        from: Deno.env.get('AUTH_EMAIL_FROM') ?? `Teu Posto <noreply@appteuposto.com.br>`,
        replyTo: SUPPORT_EMAIL,
      })

      if (!emailResult.ok) {
        return jsonResponse(
          {
            ok: false,
            message:
              emailResult.error ||
              'Não foi possível enviar o e-mail. Verifique RESEND_API_KEY e o domínio no Resend.',
          },
          502,
        )
      }

      const { data: updated, error: updateError } = await admin
        .from('support_tickets')
        .update({
          admin_reply: reply,
          replied_at: new Date().toISOString(),
          replied_by: adminUserId,
          status: 'respondida',
        })
        .eq('id', ticketId)
        .select(
          'id, audience, category, status, name, email, phone, message, user_id, posto_id, attachment_paths, admin_reply, replied_at, replied_by, created_at, updated_at',
        )
        .maybeSingle()

      if (updateError || !updated) {
        return jsonResponse(
          {
            ok: false,
            message:
              updateError?.message ||
              'E-mail enviado, mas não foi possível atualizar o chamado. Atualize a página.',
          },
          500,
        )
      }

      return jsonResponse({ ok: true, ticket: updated, email_sent: true })
    }

    return jsonResponse({ ok: false, message: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('support-admin error', error)
    return jsonResponse(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Erro interno ao processar suporte.',
      },
      500,
    )
  }
})
