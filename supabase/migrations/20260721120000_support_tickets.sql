-- Chamados de suporte (sem e-mail) + anexos de prints

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('sem_cadastro', 'com_cadastro')),
  category text NOT NULL CHECK (category IN ('duvida', 'sugestao', 'reclamacao')),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  posto_id uuid REFERENCES public.postos (id) ON DELETE SET NULL,
  attachment_paths text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_name_len CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT support_tickets_email_len CHECK (char_length(trim(email)) BETWEEN 3 AND 254),
  CONSTRAINT support_tickets_phone_len CHECK (char_length(trim(phone)) BETWEEN 8 AND 40),
  CONSTRAINT support_tickets_message_len CHECK (char_length(trim(message)) BETWEEN 10 AND 5000),
  CONSTRAINT support_tickets_attachments_max CHECK (cardinality(attachment_paths) <= 3)
);

CREATE INDEX IF NOT EXISTS support_tickets_audience_category_created_idx
  ON public.support_tickets (audience, category, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_created_idx
  ON public.support_tickets (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_support_tickets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_set_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_tickets_updated_at();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.support_tickets TO anon, authenticated;
GRANT SELECT ON public.support_tickets TO authenticated;

-- Qualquer um (visitante ou logado) pode abrir chamado
DROP POLICY IF EXISTS support_tickets_insert_public ON public.support_tickets;
CREATE POLICY support_tickets_insert_public
  ON public.support_tickets
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    audience IN ('sem_cadastro', 'com_cadastro')
    AND category IN ('duvida', 'sugestao', 'reclamacao')
    AND cardinality(attachment_paths) <= 3
    AND (
      (audience = 'sem_cadastro' AND user_id IS NULL)
      OR (audience = 'com_cadastro' AND user_id = auth.uid())
    )
  );

-- Somente admin lê os chamados
DROP POLICY IF EXISTS support_tickets_select_admin ON public.support_tickets;
CREATE POLICY support_tickets_select_admin
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Bucket de prints (até 3 imagens por chamado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS support_attachments_storage_insert_public ON storage.objects;
CREATE POLICY support_attachments_storage_insert_public
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'support-attachments');

DROP POLICY IF EXISTS support_attachments_storage_select_admin ON storage.objects;
CREATE POLICY support_attachments_storage_select_admin
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS support_attachments_storage_delete_admin ON storage.objects;
CREATE POLICY support_attachments_storage_delete_admin
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
