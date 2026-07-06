-- Versão otimizada para visualização (original permanece para download)

ALTER TABLE public.regulatory_documents
  ADD COLUMN IF NOT EXISTS preview_storage_path text,
  ADD COLUMN IF NOT EXISTS preview_file_size bigint;

UPDATE public.regulatory_documents
SET preview_storage_path = storage_path
WHERE preview_storage_path IS NULL;
