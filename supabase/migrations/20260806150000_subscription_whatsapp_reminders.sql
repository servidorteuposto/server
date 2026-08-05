-- Avisos WhatsApp de renovação de plano (7 e 2 dias antes do fim da assinatura)

ALTER TABLE public.whatsapp_reminder_sends
  DROP CONSTRAINT IF EXISTS whatsapp_reminder_sends_category_check;

ALTER TABLE public.whatsapp_reminder_sends
  ADD CONSTRAINT whatsapp_reminder_sends_category_check
  CHECK (category IN (
    'regulatory_doc',
    'work_safety_doc',
    'metrology',
    'drainage',
    'raq',
    'subscription'
  ));
