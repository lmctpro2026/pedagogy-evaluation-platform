-- =============================================================================
-- Admin Read Policies — run ONCE in Supabase SQL Editor
-- Allows admin emails to read ALL rows in sessions, users, and responses.
-- Existing user-own-record policies remain untouched (OR semantics in RLS).
-- =============================================================================

-- Admin can read ALL sessions (existing policy only allows own sessions)
CREATE POLICY "admins_read_all_sessions" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    auth.email() IN (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );

-- Admin can read ALL user records (existing policy only allows own record)
CREATE POLICY "admins_read_all_users" ON public.users
  FOR SELECT TO authenticated
  USING (
    auth.email() IN (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );

-- Admin can read ALL responses (existing policy only allows own session's responses)
CREATE POLICY "admins_read_all_responses" ON public.responses
  FOR SELECT TO authenticated
  USING (
    auth.email() IN (
      'mushfiqurr@students.federation.edu.au',
      'sally.firmin@federation.edu.au'
    )
  );
