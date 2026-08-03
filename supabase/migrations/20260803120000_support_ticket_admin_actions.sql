-- Status e resposta admin nos chamados de suporte

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aberta',
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_status_check'
      AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_status_check
      CHECK (status IN ('aberta', 'em_andamento', 'respondida'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_admin_reply_len'
      AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_admin_reply_len
      CHECK (admin_reply IS NULL OR char_length(trim(admin_reply)) BETWEEN 1 AND 5000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
  ON public.support_tickets (status, created_at DESC);

GRANT UPDATE, DELETE ON public.support_tickets TO authenticated;

DROP POLICY IF EXISTS support_tickets_update_admin ON public.support_tickets;
CREATE POLICY support_tickets_update_admin
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS support_tickets_delete_admin ON public.support_tickets;
CREATE POLICY support_tickets_delete_admin
  ON public.support_tickets
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
