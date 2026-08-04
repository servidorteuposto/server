-- Controle de envios WhatsApp (anti-duplicata) para documentos, metrologia, drenagem e RAQ

CREATE TABLE IF NOT EXISTS public.whatsapp_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos (id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN (
      'regulatory_doc',
      'work_safety_doc',
      'metrology',
      'drainage',
      'raq'
    )),
  reference_id text NOT NULL,
  milestone text NOT NULL,
  sent_on date NOT NULL DEFAULT (timezone('America/Sao_Paulo', now()))::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_reminder_sends_unique
    UNIQUE (posto_id, category, reference_id, milestone)
);

CREATE INDEX IF NOT EXISTS whatsapp_reminder_sends_posto_cat_idx
  ON public.whatsapp_reminder_sends (posto_id, category, sent_on DESC);

ALTER TABLE public.whatsapp_reminder_sends ENABLE ROW LEVEL SECURITY;
-- Sem policies para anon/authenticated: acesso só via service_role nas Edge Functions.
