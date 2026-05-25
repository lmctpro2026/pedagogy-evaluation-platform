-- =============================================================================
-- Admin DELETE policies + reset-test-data RPC
-- Run ONCE in Supabase SQL Editor (or via `supabase db query --linked --file`)
-- =============================================================================

-- ---- DELETE policies (admins only) -----------------------------------------
CREATE POLICY "admins_delete_sessions" ON public.sessions
  FOR DELETE TO authenticated
  USING (
    auth.email() IN (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );

CREATE POLICY "admins_delete_responses" ON public.responses
  FOR DELETE TO authenticated
  USING (
    auth.email() IN (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );

CREATE POLICY "admins_delete_users" ON public.users
  FOR DELETE TO authenticated
  USING (
    auth.email() IN (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );

-- ---- Reset-test-data RPC ---------------------------------------------------
-- Wipes every session, response, and non-admin user (both public.users and
-- auth.users). Admin accounts are preserved. Returns counts of what was deleted.
-- Runs as SECURITY DEFINER so it can touch auth.users, which is owned by the
-- supabase auth role.

CREATE OR REPLACE FUNCTION public.admin_reset_test_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ADMIN_EMAILS     text[] := ARRAY[
    'mushfiqurr@students.federation.edu.au',
    'sally.firmin@federation.edu.au'
  ];
  caller_email     text;
  deleted_sessions int := 0;
  deleted_users    int := 0;
  deleted_auth     int := 0;
BEGIN
  -- Authorisation: caller must be an admin
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email IS NULL OR NOT (caller_email = ANY(ADMIN_EMAILS)) THEN
    RAISE EXCEPTION 'Not authorised: admin access required';
  END IF;

  -- Sessions cascade to responses
  DELETE FROM public.sessions;
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  -- Non-admin profile rows
  DELETE FROM public.users WHERE email IS NULL OR NOT (email = ANY(ADMIN_EMAILS));
  GET DIAGNOSTICS deleted_users = ROW_COUNT;

  -- Non-admin auth accounts (no FK cascade, must delete explicitly)
  DELETE FROM auth.users WHERE NOT (email = ANY(ADMIN_EMAILS));
  GET DIAGNOSTICS deleted_auth = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_sessions',   deleted_sessions,
    'deleted_users',      deleted_users,
    'deleted_auth_users', deleted_auth
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reset_test_data() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_reset_test_data() TO authenticated;
