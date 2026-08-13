import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { processManagementAlerts, saoPauloTodayKey } from '../_shared/admin-management.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-mgmt-cron-secret',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function triggerOperationalRemindersFlush() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const secret =
    Deno.env.get('OPERATIONAL_CRON_SECRET') ?? Deno.env.get('DRAINAGE_CRON_SECRET')
  if (!supabaseUrl || !secret) return

  // Não aguarda o flush completo (pode estourar o wall-clock desta function).
  // O workflow operational-reminders já roda sozinho a cada hora.
  void fetch(`${supabaseUrl}/functions/v1/operational-reminders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-operational-cron-secret': secret,
    },
    body: '{}',
  }).catch((error) => console.error('triggerOperationalRemindersFlush', error))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('ADMIN_MGMT_CRON_SECRET')
    const provided = req.headers.get('x-admin-mgmt-cron-secret')
    if (!cronSecret || provided !== cronSecret) {
      return jsonResponse({ ok: false, message: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, message: 'Missing Supabase credentials' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const result = await processManagementAlerts(admin)
    // Descarrega também a fila de lembretes dos postos (Meta templates).
    await triggerOperationalRemindersFlush()

    return jsonResponse({
      ok: true,
      today: saoPauloTodayKey(),
      ...result,
    })
  } catch (error) {
    console.error('admin-management-alerts error', error)
    return jsonResponse({ ok: false, message: 'Erro ao processar alertas de gerenciamento.' }, 500)
  }
})
