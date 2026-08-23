-- Pre-deployment review follow-ups for the Batch 1 security remediation (027).
-- Forward-only. Does not modify Storage. Does not touch historical/deprecated
-- migrations (see 019_fix_has_super_manager.sql for the one necessary
-- exception, explained inline there).

-- ============================================================
-- 0. RPC GRANTS -- 027's "REVOKE ... FROM PUBLIC" was insufficient
-- Verified against a real `supabase db reset` (not just a hand-built test
-- container): this Supabase project template grants EXECUTE on newly
-- created public-schema functions to `anon` directly (an explicit ACL
-- entry, not one inherited via PUBLIC), confirmed via \df+. 027's
-- "REVOKE ... FROM PUBLIC" therefore never removed anon's access --
-- `anon=X/postgres` remained in the function's ACL afterward, confirmed via
-- has_function_privilege(). The functions' own internal auth.uid() checks
-- still rejected anon calls in practice, but the grant-level objective from
-- 027 wasn't actually met. Revoking from anon explicitly (in addition to the
-- pre-existing PUBLIC/authenticated statements from 027) closes this.
-- ============================================================

REVOKE EXECUTE ON FUNCTION update_user_role(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION delete_user_completely(uuid) FROM anon;

-- ============================================================
-- 1. FILES -- newly discovered is_admin() bypass missed by 027
-- "view_files" has been untouched since 000/001 and still lets any
-- globally-flagged admin (which, pre-027, was every ordinary self-signup
-- user) read file metadata (filename/path/mime/size) for every
-- organization's submissions. This is the same class of bug 027 already
-- fixed on forms/folders/invitations/debug_logs; it was simply missed
-- because no migration had ever touched this table's SELECT policy.
-- Only the is_admin() bypass is removed -- the pre-existing
-- "s.organization_id IS NULL" fallback clause is left exactly as-is
-- (out of scope for this narrow pass).
-- ============================================================

DROP POLICY IF EXISTS "view_files" ON files;

CREATE POLICY "view_files" ON files FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.id = files.submission_id
    AND (
      s.organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
      OR s.organization_id IS NULL
    )
  )
);

-- ============================================================
-- 2. DEBUG_LOGS -- close direct client INSERT
-- Empirically confirmed against a live local Supabase REST API: with the
-- prior "allow_trigger_insert_debug_logs ... WITH CHECK (true)" policy
-- (role: public, i.e. anon + authenticated), an anonymous client could
-- directly POST arbitrary rows via the standard REST insert path (no
-- RETURNING needed) -- this was never limited to the trigger, contrary to
-- the batch 1 report. handle_new_user_signup() is SECURITY DEFINER, owned
-- by a role that bypasses RLS entirely, so it does not need this policy (or
-- any policy) to keep logging -- dropping it with no replacement is the
-- minimum change that closes client writes without touching trigger
-- behavior. No UPDATE/DELETE policy has ever existed on this table, so both
-- remain denied by default (verified empirically).
-- ============================================================

DROP POLICY IF EXISTS "allow_trigger_insert_debug_logs" ON debug_logs;

-- ============================================================
-- 3. INVITATIONS -- tighten INSERT to the role the app actually uses
-- The only invitation-creation code path in the app
-- (UserManagement.tsx: createInvitation) always writes role:'staff' --
-- there is no product workflow, for any actor, that creates a 'manager' or
-- 'super_manager' invitation. New members always join as staff and are
-- promoted afterwards via the separately-audited update_user_role RPC,
-- which already carries its own actor/target authorization check. 027's
-- policy allowed a super_manager to write any role, which was inferred, not
-- observed, and unnecessarily left open a path for an invitation-based
-- super_manager handoff (auto-demoting the current owner via
-- enforce_single_super_manager) that no UI ever offers. Tightened to the
-- minimum actually required: manager or super_manager of the org may create
-- a 'staff' invitation only.
-- ============================================================

DROP POLICY IF EXISTS "invitations_insert_scoped" ON invitations;

CREATE POLICY "invitations_insert_scoped" ON invitations
FOR INSERT
TO authenticated
WITH CHECK (
  has_manager(organization_id) AND role = 'staff'
);

-- ============================================================
-- 4. Stop logging the raw invite token
-- handle_new_user_signup() logged the plaintext invite token into
-- debug_logs on every signup attempt (invite_token_checked step). Since
-- debug_logs is no longer directly client-writable (see #2) this is lower
-- risk than previously assessed, but it is still an unnecessary sensitive
-- value in a diagnostic table. This changes only that one log line, from
-- the raw token to a boolean presence flag. No other behavior in the
-- function is changed from the version created in 027.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
  invite_token TEXT;
  invite_record RECORD;
  user_name TEXT;
BEGIN
  INSERT INTO public.debug_logs(step, details)
  VALUES ('trigger_start', jsonb_build_object('user_id', NEW.id)::text);

  user_name := COALESCE(
    TRIM(NEW.raw_user_meta_data->>'name'),
    TRIM(NEW.raw_user_meta_data->>'full_name'),
    TRIM(NEW.raw_user_meta_data->>'display_name'),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, user_name);

  INSERT INTO public.debug_logs(step, details)
  VALUES ('profile_created', jsonb_build_object('user_id', NEW.id, 'name', user_name)::text);

  invite_token := NEW.raw_user_meta_data->>'invite_token';
  INSERT INTO public.debug_logs(step, details)
  VALUES ('invite_token_checked', jsonb_build_object('invite_token_present', invite_token IS NOT NULL)::text);

  IF invite_token IS NOT NULL THEN
    SELECT * INTO invite_record
    FROM public.invitations
    WHERE token = invite_token
      AND expires_at > NOW();

    INSERT INTO public.debug_logs(step, details)
    VALUES ('invite_lookup', jsonb_build_object('found', FOUND)::text);

    IF FOUND THEN
      new_org_id := invite_record.organization_id;
      INSERT INTO public.debug_logs(step, details)
      VALUES ('invite_valid', jsonb_build_object('org_id', new_org_id, 'role', invite_record.role)::text);

      INSERT INTO public.user_organization_roles (user_id, organization_id, role)
      VALUES (NEW.id, new_org_id, invite_record.role);

      INSERT INTO public.debug_logs(step, details)
      VALUES ('role_assigned', jsonb_build_object('role', invite_record.role)::text);

      DELETE FROM public.invitations WHERE id = invite_record.id;
      INSERT INTO public.debug_logs(step, details)
      VALUES ('invitation_deleted', jsonb_build_object('inv_id', invite_record.id)::text);
    ELSE
      invite_token := NULL;
      INSERT INTO public.debug_logs(step, details)
      VALUES ('invite_invalid', '');
    END IF;
  END IF;

  IF new_org_id IS NULL THEN
    org_name := COALESCE(
      NEW.raw_user_meta_data->>'organization_name',
      user_name || '''s Workspace'
    );

    INSERT INTO public.debug_logs(step, details)
    VALUES ('org_name_extracted', jsonb_build_object('org_name', org_name)::text);

    org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    org_slug := trim(both '-' FROM org_slug);
    org_slug := org_slug || '-' || extract(epoch FROM now())::bigint;

    INSERT INTO public.organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;

    INSERT INTO public.debug_logs(step, details)
    VALUES ('org_created', jsonb_build_object('org_id', new_org_id)::text);

    INSERT INTO public.user_organization_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'super_manager');

    INSERT INTO public.debug_logs(step, details)
    VALUES ('role_super_manager_assigned', jsonb_build_object('org_id', new_org_id)::text);

    -- No global user_roles(role='admin') grant here -- removed in 027.
  END IF;

  UPDATE public.profiles
  SET current_organization_id = new_org_id
  WHERE id = NEW.id;

  INSERT INTO public.debug_logs(step, details)
  VALUES ('profile_updated', jsonb_build_object('org_id', new_org_id)::text);

  INSERT INTO public.debug_logs(step, details)
  VALUES ('trigger_end', jsonb_build_object('user_id', NEW.id)::text);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.debug_logs(step, details)
    VALUES ('error', SQLERRM);
    RAISE;
END;
$func$ LANGUAGE plpgsql;
