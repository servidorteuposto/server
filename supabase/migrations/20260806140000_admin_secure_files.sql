-- Cofre de arquivos do admin (TXT/PDF com senha)

CREATE TABLE IF NOT EXISTS public.admin_secure_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'text/plain')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  storage_path text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS admin_secure_files_created_at_idx
  ON public.admin_secure_files (created_at DESC);

ALTER TABLE public.admin_secure_files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_secure_files FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_secure_files FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_secure_files TO service_role;

COMMENT ON TABLE public.admin_secure_files IS
  'Arquivos TXT/PDF do admin com senha. Acesso somente via Edge Function (service_role).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-secure-files',
  'admin-secure-files',
  false,
  10485760,
  ARRAY['application/pdf', 'text/plain']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Sem policies para anon/authenticated: só service_role via edge
