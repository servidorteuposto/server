-- Fila de reenvio WhatsApp: avisos que falharam (ex.: Z-API desconectada)
-- permanecem até o envio bem-sucedido.

CREATE TABLE IF NOT EXISTS public.whatsapp_reminder_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos (id) ON DELETE CASCADE,
  category text NOT NULL,
  reference_id text NOT NULL,
  milestone text NOT NULL,
  message text NOT NULL,
  phones text[] NOT NULL DEFAULT '{}',
  due_on date NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_reminder_queue_unique
    UNIQUE (posto_id, category, reference_id, milestone)
);

CREATE INDEX IF NOT EXISTS whatsapp_reminder_queue_due_idx
  ON public.whatsapp_reminder_queue (due_on ASC, created_at ASC);

ALTER TABLE public.whatsapp_reminder_queue ENABLE ROW LEVEL SECURITY;
-- Sem policies para anon/authenticated: acesso só via service_role.
