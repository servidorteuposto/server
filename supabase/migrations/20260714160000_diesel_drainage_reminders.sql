-- Controle de avisos semanais de drenagem (1 dia antes e no dia do vencimento)

CREATE TABLE public.diesel_drainage_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES public.diesel_tanks(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('day_before', 'due_day')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  email_sent boolean NOT NULL DEFAULT false,
  whatsapp_sent boolean NOT NULL DEFAULT false,
  CONSTRAINT diesel_drainage_reminders_unique UNIQUE (tank_id, due_date, kind)
);

CREATE INDEX diesel_drainage_reminders_posto_idx
  ON public.diesel_drainage_reminders (posto_id, sent_at DESC);

ALTER TABLE public.diesel_drainage_reminders ENABLE ROW LEVEL SECURITY;

-- Somente service role / edge function grava; o posto pode consultar o que já foi enviado
CREATE POLICY "diesel_drainage_reminders_select_own"
  ON public.diesel_drainage_reminders FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );
