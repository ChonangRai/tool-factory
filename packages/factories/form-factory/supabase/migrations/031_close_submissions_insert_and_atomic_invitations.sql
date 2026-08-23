-- Final pre-staging sweep, part 1: close the direct cross-tenant
-- submissions INSERT, and make invitation redemption atomic. Forward-only;
-- does not edit 027-030.

-- ============================================================
-- 1. SUBMISSIONS INSERT
-- "allow_submissions_insert_auth" WITH CHECK ((org IN caller's orgs) OR
-- (organization_id IS NOT NULL)) -- the second branch is true for any
-- non-null org, allowing any authenticated user to insert a submission into
-- any organization directly via REST, bypassing submit_form() entirely.
-- Confirmed live in the final sweep (POST /rest/v1/submissions, 201,
-- attacker-controlled data landed in a foreign org).
--
-- Grepped the full frontend: no page performs a direct
-- `.from('submissions').insert(...)` anywhere -- Admin.tsx, AllSubmissions.tsx,
-- ArchivedSubmissions.tsx and Dashboard.tsx only ever SELECT/UPDATE/DELETE
-- submissions. Public anonymous submission has always gone exclusively
-- through submit_form(), a SECURITY DEFINER function that bypasses RLS and
-- is unaffected by this policy either way. There is no legitimate direct
-- INSERT path to preserve, so this table is closed to authenticated direct
-- INSERT entirely (narrower than "own org only") rather than kept open for
-- a write path nothing uses.
-- ============================================================

DROP POLICY IF EXISTS "allow_submissions_insert_auth" ON submissions;

-- No replacement INSERT policy: authenticated direct INSERT is now denied
-- by default. submit_form() is SECURITY DEFINER and is not governed by this
-- policy, so anonymous submission is unaffected.

-- ============================================================
-- 2. ATOMIC INVITATION REDEMPTION
-- handle_new_user_signup() previously did SELECT invitation -> grant role ->
-- DELETE invitation, which is not atomic: under READ COMMITTED, two
-- concurrent signups presenting the same token can both see the row before
-- either DELETE commits. Reproduced live: two simultaneous signups against
-- one single-use staff invite both received the grant.
--
-- Fixed by making the lookup itself the consumption: a single
-- `DELETE ... WHERE token = ... AND expires_at > now() RETURNING *`. A
-- concurrent second DELETE targeting the same row blocks on the first
-- transaction's row lock, then re-evaluates its WHERE clause once
-- unblocked and correctly finds zero rows.
--
-- Losing-the-race behavior is intentionally identical to the existing
-- "expired or already-used token" path: invite_token is cleared and the
-- signup falls through to the standard new-workspace/super_manager branch.
-- This is not a new fallback -- it is the same behavior this trigger has
-- always had for any invalid token, now also covering the race case rather
-- than the race silently granting a second copy of the target org's
-- membership. No branch grants the loser access to the org the invitation
-- was for.
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
  invite_consumed BOOLEAN;
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
    -- Atomic claim: this DELETE is the consumption. Exactly one concurrent
    -- transaction can ever see invite_consumed = true for a given token.
    --
    -- FOUND must be captured into a local variable *immediately*: it is a
    -- global per-statement flag that the very next statement (any INSERT,
    -- including the debug_logs call below) overwrites unconditionally.
    -- This was a latent bug in every prior version of this trigger too --
    -- it never surfaced because the only two paths ever exercised (no
    -- token; a genuinely valid token) both happen to coincide with what
    -- the clobbered value would show anyway. It only becomes observable
    -- once a DELETE can legitimately find zero rows here, which is exactly
    -- the race-loser case this migration introduces.
    DELETE FROM public.invitations
    WHERE token = invite_token
      AND expires_at > NOW()
    RETURNING * INTO invite_record;
    invite_consumed := FOUND;

    INSERT INTO public.debug_logs(step, details)
    VALUES ('invite_lookup', jsonb_build_object('found', invite_consumed)::text);

    IF invite_consumed THEN
      new_org_id := invite_record.organization_id;
      INSERT INTO public.debug_logs(step, details)
      VALUES ('invite_valid', jsonb_build_object('org_id', new_org_id, 'role', invite_record.role)::text);

      INSERT INTO public.user_organization_roles (user_id, organization_id, role)
      VALUES (NEW.id, new_org_id, invite_record.role);

      INSERT INTO public.debug_logs(step, details)
      VALUES ('role_assigned', jsonb_build_object('role', invite_record.role)::text);
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
