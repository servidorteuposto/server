-- Segurança do Trabalho: laudos do posto + funcionários (NR20/NR35, ASO, EPI, identidade)

CREATE TABLE public.work_safety_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  template_key text,
  title text NOT NULL,
  issued_at date NOT NULL,
  expires_at date,
  storage_path text NOT NULL,
  preview_storage_path text,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  preview_file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_safety_documents_expires_check
    CHECK (expires_at IS NULL OR expires_at >= issued_at)
);

CREATE UNIQUE INDEX work_safety_documents_posto_template_idx
  ON public.work_safety_documents (posto_id, template_key)
  WHERE template_key IS NOT NULL;

CREATE INDEX work_safety_documents_posto_id_idx
  ON public.work_safety_documents (posto_id);

ALTER TABLE public.work_safety_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_safety_documents_select_own"
  ON public.work_safety_documents FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_documents_insert_own"
  ON public.work_safety_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_documents_update_own"
  ON public.work_safety_documents FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_documents_delete_own"
  ON public.work_safety_documents FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_work_safety_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_safety_documents_updated_at
  BEFORE UPDATE ON public.work_safety_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_work_safety_documents_updated_at();

-- Funcionários
CREATE TABLE public.work_safety_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cpf text NOT NULL,
  phone text,
  epi_description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_safety_employees_cpf_format CHECK (cpf ~ '^\d{11}$')
);

CREATE UNIQUE INDEX work_safety_employees_posto_cpf_idx
  ON public.work_safety_employees (posto_id, cpf);

CREATE INDEX work_safety_employees_posto_id_idx
  ON public.work_safety_employees (posto_id);

ALTER TABLE public.work_safety_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_safety_employees_select_own"
  ON public.work_safety_employees FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employees_insert_own"
  ON public.work_safety_employees FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employees_update_own"
  ON public.work_safety_employees FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employees_delete_own"
  ON public.work_safety_employees FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_work_safety_employees_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_safety_employees_updated_at
  BEFORE UPDATE ON public.work_safety_employees
  FOR EACH ROW
  EXECUTE FUNCTION public.set_work_safety_employees_updated_at();

-- Treinamentos NR20 / NR35 por funcionário
CREATE TABLE public.work_safety_employee_trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.work_safety_employees(id) ON DELETE CASCADE,
  training_type text NOT NULL,
  issued_at date NOT NULL,
  expires_at date,
  storage_path text NOT NULL,
  preview_storage_path text,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  preview_file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_safety_employee_trainings_type_check
    CHECK (training_type IN ('nr20', 'nr35')),
  CONSTRAINT work_safety_employee_trainings_expires_check
    CHECK (expires_at IS NULL OR expires_at >= issued_at)
);

CREATE UNIQUE INDEX work_safety_employee_trainings_employee_type_idx
  ON public.work_safety_employee_trainings (employee_id, training_type);

CREATE INDEX work_safety_employee_trainings_posto_id_idx
  ON public.work_safety_employee_trainings (posto_id);

ALTER TABLE public.work_safety_employee_trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_safety_employee_trainings_select_own"
  ON public.work_safety_employee_trainings FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_trainings_insert_own"
  ON public.work_safety_employee_trainings FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_trainings_update_own"
  ON public.work_safety_employee_trainings FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_trainings_delete_own"
  ON public.work_safety_employee_trainings FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_work_safety_employee_trainings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_safety_employee_trainings_updated_at
  BEFORE UPDATE ON public.work_safety_employee_trainings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_work_safety_employee_trainings_updated_at();

-- ASOs (vários por funcionário)
CREATE TABLE public.work_safety_employee_asos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.work_safety_employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  issued_at date NOT NULL,
  storage_path text NOT NULL,
  preview_storage_path text,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  preview_file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_safety_employee_asos_employee_idx
  ON public.work_safety_employee_asos (employee_id, issued_at DESC);

ALTER TABLE public.work_safety_employee_asos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_safety_employee_asos_select_own"
  ON public.work_safety_employee_asos FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_asos_insert_own"
  ON public.work_safety_employee_asos FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_asos_update_own"
  ON public.work_safety_employee_asos FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_asos_delete_own"
  ON public.work_safety_employee_asos FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_work_safety_employee_asos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_safety_employee_asos_updated_at
  BEFORE UPDATE ON public.work_safety_employee_asos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_work_safety_employee_asos_updated_at();

-- Documento de identidade (CNH ou Identidade)
CREATE TABLE public.work_safety_employee_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.work_safety_employees(id) ON DELETE CASCADE,
  document_kind text NOT NULL,
  storage_path text NOT NULL,
  preview_storage_path text,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  preview_file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_safety_employee_identity_kind_check
    CHECK (document_kind IN ('cnh', 'identidade'))
);

CREATE UNIQUE INDEX work_safety_employee_identity_employee_idx
  ON public.work_safety_employee_identity (employee_id);

ALTER TABLE public.work_safety_employee_identity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_safety_employee_identity_select_own"
  ON public.work_safety_employee_identity FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_identity_insert_own"
  ON public.work_safety_employee_identity FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_identity_update_own"
  ON public.work_safety_employee_identity FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "work_safety_employee_identity_delete_own"
  ON public.work_safety_employee_identity FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_work_safety_employee_identity_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_safety_employee_identity_updated_at
  BEFORE UPDATE ON public.work_safety_employee_identity
  FOR EACH ROW
  EXECUTE FUNCTION public.set_work_safety_employee_identity_updated_at();

-- Buckets privados — somente PDF
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'work-safety-documents',
    'work-safety-documents',
    false,
    10485760,
    ARRAY['application/pdf']
  ),
  (
    'work-safety-employee-files',
    'work-safety-employee-files',
    false,
    10485760,
    ARRAY['application/pdf']
  )
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies — work-safety-documents
CREATE POLICY "work_safety_docs_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'work-safety-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "work_safety_docs_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'work-safety-documents'
    AND (storage.extension(name)) = 'pdf'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "work_safety_docs_storage_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'work-safety-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'work-safety-documents'
    AND (storage.extension(name)) = 'pdf'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "work_safety_docs_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'work-safety-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

-- Storage policies — work-safety-employee-files
CREATE POLICY "work_safety_emp_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'work-safety-employee-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "work_safety_emp_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'work-safety-employee-files'
    AND (storage.extension(name)) = 'pdf'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "work_safety_emp_storage_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'work-safety-employee-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'work-safety-employee-files'
    AND (storage.extension(name)) = 'pdf'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "work_safety_emp_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'work-safety-employee-files'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
