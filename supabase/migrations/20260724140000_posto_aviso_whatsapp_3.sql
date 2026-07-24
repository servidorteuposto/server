-- Terceiro WhatsApp para contatos de aviso

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS aviso_whatsapp_3 text;

ALTER TABLE public.postos
  DROP CONSTRAINT IF EXISTS postos_aviso_whatsapp_3_format_check;

ALTER TABLE public.postos
  ADD CONSTRAINT postos_aviso_whatsapp_3_format_check
  CHECK (
    aviso_whatsapp_3 IS NULL
    OR length(regexp_replace(aviso_whatsapp_3, '\D', '', 'g')) BETWEEN 10 AND 13
  );
