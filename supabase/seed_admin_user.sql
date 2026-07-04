-- Execute no SQL Editor do Supabase (uma vez).
-- Antes de rodar, altere a senha na variável v_password abaixo.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'servidorteuposto@gmail.com';
  v_password text := 'TeuPosto#Admin2026';
  v_cnpj text := '99.999.999/0001-99';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
      jsonb_build_object(
        'nome_posto', 'Admin teu posto',
        'cnpj', v_cnpj,
        'telefone', '(00) 00000-0000'
      ),
      now(),
      now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      now(),
      now(),
      now()
    );
  ELSE
    UPDATE auth.users
    SET
      raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb,
      email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_user_id;
  END IF;

  UPDATE public.postos
  SET
    nome = 'Admin teu posto',
    cnpj = v_cnpj,
    telefone = '(00) 00000-0000',
    email = v_email,
    subscription_status = 'active',
    subscription_ends_at = now() + interval '10 years',
    updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.postos (user_id, nome, cnpj, telefone, email, subscription_status, subscription_ends_at)
    VALUES (
      v_user_id,
      'Admin teu posto',
      v_cnpj,
      '(00) 00000-0000',
      v_email,
      'active',
      now() + interval '10 years'
    );
  END IF;
END $$;
