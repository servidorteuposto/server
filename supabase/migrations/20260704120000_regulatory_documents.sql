-- Documentos regulatórios do posto (PDF, um arquivo por setor)

CREATE TABLE public.regulatory_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  template_key text,
  title text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  issued_at date NOT NULL,
  expires_at date,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regulatory_documents_expires_after_issued CHECK (
    expires_at IS NULL OR expires_at >= issued_at
  )
);

CREATE UNIQUE INDEX regulatory_documents_posto_template_key_idx
  ON public.regulatory_documents (posto_id, template_key)
  WHERE template_key IS NOT NULL;

CREATE INDEX regulatory_documents_posto_id_idx
  ON public.regulatory_documents (posto_id);

ALTER TABLE public.regulatory_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_documents_select_own"
  ON public.regulatory_documents FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "regulatory_documents_insert_own"
  ON public.regulatory_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "regulatory_documents_update_own"
  ON public.regulatory_documents FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "regulatory_documents_delete_own"
  ON public.regulatory_documents FOR DELETE
  TO authenticated
  USING (
    is_custom = true
    AND posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_regulatory_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER regulatory_documents_updated_at
  BEFORE UPDATE ON public.regulatory_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_regulatory_documents_updated_at();

-- Bucket privado — somente PDF
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'regulatory-documents',
  'regulatory-documents',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "regulatory_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'regulatory-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "regulatory_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'regulatory-documents'
    AND (storage.extension(name)) = 'pdf'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "regulatory_storage_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'regulatory-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'regulatory-documents'
    AND (storage.extension(name)) = 'pdf'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "regulatory_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'regulatory-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
