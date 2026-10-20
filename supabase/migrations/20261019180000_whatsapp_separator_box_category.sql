-- Categoria WhatsApp: lembrete de inspeção da caixa separadora (15 dias)

ALTER TABLE public.whatsapp_reminder_sends
  DROP CONSTRAINT IF EXISTS whatsapp_reminder_sends_category_check;

ALTER TABLE public.whatsapp_reminder_sends
  ADD CONSTRAINT whatsapp_reminder_sends_category_check
  CHECK (category IN (
    'regulatory_doc',
    'work_safety_doc',
    'work_safety_training',
    'metrology',
    'metrology_failed',
    'metrology_tecnico_warning',
    'drainage',
    'separator_box',
    'raq',
    'raq_out_of_spec',
    'subscription'
  ));
