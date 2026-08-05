import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  alertAlreadySentToday,
  collectAdminAlertPhones,
  daysUntilDate,
  domainAlertMessage,
  extractVercelBandwidthBytes,
  fetchVercelUsage,
  isNearLimit,
  normalizeQuotas,
  resourceAlertMessage,
  saoPauloTodayKey,
  sendWhatsApp,
} from '../_shared/admin-management.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('ADMIN_MGMT_CRON_SECRET')
    const provided = req.headers.get('x-admin-mgmt-cron-secret')
    if (cronSecret && provided !== cronSecret) {
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

    const { data: settingsRow, error: settingsError } = await admin
      .from('admin_management_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (settingsError) throw settingsError

    const settings = {
      alert_whatsapp_1: settingsRow?.alert_whatsapp_1 ?? null,
      alert_whatsapp_2: settingsRow?.alert_whatsapp_2 ?? null,
      domain_expires_on: settingsRow?.domain_expires_on ?? null,
      quotas: normalizeQuotas(settingsRow?.quotas),
      last_alerts:
        settingsRow?.last_alerts && typeof settingsRow.last_alerts === 'object'
          ? (settingsRow.last_alerts as Record<string, string>)
          : {},
    }

    const phones = collectAdminAlertPhones(settings)
    const sent: string[] = []
    const skipped: string[] = []
    const today = saoPauloTodayKey()
    const lastAlerts = { ...settings.last_alerts }

    const { data: metrics, error: metricsError } = await admin.rpc('admin_management_metrics')
    if (metricsError) throw metricsError

    const dbBytes = Number(metrics?.db_bytes ?? 0)
    const storageBytes = Number(metrics?.storage_bytes ?? 0)

    async function maybeSend(key: string, shouldSend: boolean, message: string) {
      if (!shouldSend) {
        skipped.push(`${key}:ok`)
        return
      }
      if (alertAlreadySentToday(lastAlerts, key)) {
        skipped.push(`${key}:already_sent`)
        return
      }
      if (!phones.length) {
        skipped.push(`${key}:no_phones`)
        return
      }
      const results = await Promise.all(phones.map((p) => sendWhatsApp(p, message)))
      if (results.some(Boolean)) {
        lastAlerts[key] = today
        sent.push(key)
      } else {
        skipped.push(`${key}:send_failed`)
      }
    }

    await maybeSend(
      'supabase_db',
      isNearLimit(dbBytes, settings.quotas.db_bytes),
      resourceAlertMessage('supabase_db', dbBytes, settings.quotas.db_bytes, `${today}:cron:db`),
    )
    await maybeSend(
      'supabase_storage',
      isNearLimit(storageBytes, settings.quotas.storage_bytes),
      resourceAlertMessage(
        'supabase_storage',
        storageBytes,
        settings.quotas.storage_bytes,
        `${today}:cron:storage`,
      ),
    )

    const vercel = await fetchVercelUsage()
    const bandwidth = extractVercelBandwidthBytes(vercel.configured ? vercel.usage : null)
    if (bandwidth != null) {
      await maybeSend(
        'vercel_bandwidth',
        isNearLimit(bandwidth, settings.quotas.vercel_bandwidth_bytes),
        resourceAlertMessage(
          'vercel_bandwidth',
          bandwidth,
          settings.quotas.vercel_bandwidth_bytes,
          `${today}:cron:vercel`,
        ),
      )
    } else {
      skipped.push('vercel_bandwidth:no_data')
    }

    const daysLeft = daysUntilDate(settings.domain_expires_on)
    if (daysLeft != null && settings.domain_expires_on) {
      if (daysLeft === 7) {
        await maybeSend(
          'domain_7d',
          true,
          domainAlertMessage(daysLeft, settings.domain_expires_on, `${today}:cron:d7`),
        )
      } else if (daysLeft <= 2 && daysLeft >= 0) {
        await maybeSend(
          'domain_2d',
          true,
          domainAlertMessage(daysLeft, settings.domain_expires_on, `${today}:cron:d2`),
        )
      } else {
        skipped.push(`domain:days_${daysLeft}`)
      }
    } else {
      skipped.push('domain:not_set')
    }

    if (sent.length) {
      await admin
        .from('admin_management_settings')
        .update({ last_alerts: lastAlerts, updated_at: new Date().toISOString() })
        .eq('id', 1)
    }

    return jsonResponse({
      ok: true,
      today,
      sent,
      skipped,
      phones: phones.length,
      db_bytes: dbBytes,
      storage_bytes: storageBytes,
      vercel_bandwidth_bytes: bandwidth,
      domain_days_left: daysLeft,
    })
  } catch (error) {
    console.error('admin-management-alerts error', error)
    return jsonResponse({ ok: false, message: 'Erro ao processar alertas de gerenciamento.' }, 500)
  }
})
