-- Contatos de aviso (WhatsApp) do posto — integração ZAPI depois

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS aviso_whatsapp_1 text,
  ADD COLUMN IF NOT EXISTS aviso_whatsapp_2 text;

ALTER TABLE public.postos
  DROP CONSTRAINT IF EXISTS postos_aviso_whatsapp_1_format_check;

ALTER TABLE public.postos
  ADD CONSTRAINT postos_aviso_whatsapp_1_format_check
  CHECK (
    aviso_whatsapp_1 IS NULL
    OR length(regexp_replace(aviso_whatsapp_1, '\D', '', 'g')) BETWEEN 10 AND 13
  );

ALTER TABLE public.postos
  DROP CONSTRAINT IF EXISTS postos_aviso_whatsapp_2_format_check;

ALTER TABLE public.postos
  ADD CONSTRAINT postos_aviso_whatsapp_2_format_check
  CHECK (
    aviso_whatsapp_2 IS NULL
    OR length(regexp_replace(aviso_whatsapp_2, '\D', '', 'g')) BETWEEN 10 AND 13
  );
