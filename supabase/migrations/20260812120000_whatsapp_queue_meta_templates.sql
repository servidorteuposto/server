-- Templates Meta Cloud API na fila de lembretes WhatsApp
ALTER TABLE public.whatsapp_reminder_queue
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS template_params jsonb NOT NULL DEFAULT '[]'::jsonb;
